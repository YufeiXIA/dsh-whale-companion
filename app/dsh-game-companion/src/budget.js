import { randomUUID } from 'node:crypto';

const usageFields = ['inputTokens', 'outputTokens', 'totalTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens'];
const usageSnapshot = usage => Object.fromEntries(usageFields.map(field => [field, usage?.[field] ?? null]));

function validateRestored(state) {
  const validTime = value => Number.isFinite(value) && value >= 0;
  const statuses = ['pending', 'unknown', 'completed', 'failed', 'canceled', 'interrupted'];
  if (!state || !Number.isSafeInteger(state.requestCount) || state.requestCount < 0 ||
      !Array.isArray(state.requests) || (state.continuous === true
        ? state.requests.length > state.requestCount : state.requests.length !== state.requestCount) ||
      !state.requests.every(request => request && !Array.isArray(request) && statuses.includes(request.status))) {
    throw new Error('Invalid restored trial budget: request count or records');
  }
  if (state.startedAt === null && state.deadlineAt === null && state.requestCount === 0) return;
  if (state.continuous === true && validTime(state.startedAt) && state.deadlineAt === null) return;
  if (!validTime(state.startedAt) || !validTime(state.deadlineAt) || state.deadlineAt <= state.startedAt) {
    throw new Error('Invalid restored trial budget: start or deadline');
  }
}

// Counts DSH llm.stream calls, including retries and auxiliary calls in the same
// session. It does not count adapter-internal HTTP retries.
export class TrialBudget {
  constructor({ restored, persist, onLimit, continuous = false, durationMs = 30 * 60 * 1000, maxRequests = 100,
    now = Date.now, monotonicNow = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout }) {
    this.persist = persist;
    this.onLimit = onLimit;
    this.durationMs = durationMs;
    this.maxRequests = maxRequests;
    this.continuous = continuous;
    this.now = now;
    this.monotonicNow = monotonicNow;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    if (restored !== undefined) validateRestored(restored);
    this.state = structuredClone(restored ?? { startedAt: null, deadlineAt: null, requestCount: 0, limitReason: null, requests: [] });
    if (continuous) {
      this.state.continuous = true;
      this.state.deadlineAt = null;
      if (['time-limit', 'request-limit'].includes(this.state.limitReason)) this.state.limitReason = null;
    }
    this.pending = Promise.resolve();
    this.running = 0;
    this.failure = null;
    this.disposed = false;
    this.notified = new Set();
    this.timer = null;
    for (const request of this.state.requests) {
      if (request.status === 'pending') request.status = 'unknown';
    }
    this.trimHistory();
    if (this.state.limitReason) this.limit(this.state.limitReason);
    else if (!this.continuous && this.state.requestCount >= this.maxRequests) this.limit('request-limit');
    this.armTimer();
  }

  snapshot() { return structuredClone(this.state); }

  trimHistory() {
    if (!this.continuous) return;
    // Keep lifetime counts, recent diagnostics, and every in-flight request.
    const recent = new Set(this.state.requests.filter(request => request.status !== 'pending').slice(-100));
    this.state.requests = this.state.requests.filter(request => request.status === 'pending' || recent.has(request));
  }

  enqueue(operation) {
    const result = this.pending.then(operation);
    this.pending = result.catch(() => {});
    return result;
  }

  async save() {
    try { await this.persist(this.snapshot()); }
    catch (error) {
      this.failure = error;
      this.limit('budget-persistence-error');
      throw error;
    }
  }

  limit(reason) {
    this.state.limitReason ??= reason;
    if (this.notified.has(reason)) return;
    this.notified.add(reason);
    // Host must synchronously close its action gate here, without awaiting the
    // current agent's whenIdle() from inside this request.
    this.onLimit(reason);
  }

  armTimer() {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    if (this.disposed || this.state.deadlineAt === null || this.state.limitReason) return;
    const remaining = this.state.deadlineAt - this.now();
    if (remaining <= 0) {
      this.limit('time-limit');
      void this.enqueue(() => this.save()).catch(() => {});
      return;
    }
    this.timer = this.setTimer(() => this.armTimer(), remaining);
    this.timer?.unref?.();
  }

  // Beginning a new trial is an explicit host operation, never an ordinary
  // resume. A paused host must also have finished canceling its active stream.
  begin({ paused }) {
    return this.enqueue(async () => {
      if (!paused || this.running || this.disposed) throw new Error('Begin trial requires a paused, idle host');
      this.failure = null;
      this.notified.clear();
      const startedAt = this.now();
      this.state = { startedAt, deadlineAt: this.continuous ? null : startedAt + this.durationMs,
        requestCount: 0, limitReason: null, requests: [], ...(this.continuous ? { continuous: true } : {}) };
      this.armTimer();
      await this.save();
      return this.snapshot();
    });
  }

  check(options) {
    if (this.disposed) throw new Error('Trial budget is disposed');
    if (this.failure) throw this.failure;
    options.signal?.throwIfAborted();
    if (this.state.startedAt === null) throw new Error('Trial has not begun');
    if (!this.continuous && this.now() >= this.state.deadlineAt) this.limit('time-limit');
    if (this.state.limitReason) throw new Error(`Trial paused: ${this.state.limitReason}`);
  }

  // Register at the host: ctx.on('llm/stream', (options, next) =>
  //   options.sessionId === sessionId ? budget.wrap(options, next) : next(),
  //   { global: true, prepend: true }). The listener must return an iterable,
  // not a Promise. Admission/persistence happens when that iterable is read.
  async *wrap(options, next) {
    this.running++;
    let request;
    let started;
    let completed = false;
    try {
      await this.enqueue(async () => {
        this.check(options);
        if (!this.continuous && this.state.requestCount >= this.maxRequests) {
          this.limit('request-limit');
          throw new Error('Trial paused: request-limit');
        }
        started = this.monotonicNow();
        request = { id: randomUUID(), number: ++this.state.requestCount,
          provider: options.provider ?? null, model: options.model ?? null, purpose: options.purpose ?? null,
          reasoningEffort: options.reasoningEffort ?? null, maxTokens: options.maxTokens ?? null,
          startedAt: this.now(), endedAt: null, durationMs: null, status: 'pending', finishReason: null, usage: usageSnapshot() };
        this.state.requests.push(request);
        await this.save();
        // Pause/abort/expiry can win while disk persistence is in flight.
        this.check(options);
      });
      for await (const chunk of next()) {
        if (chunk.type === 'usage') request.usage = usageSnapshot(chunk.usage);
        if (chunk.type === 'finish') request.finishReason = chunk.reason.kind;
        yield chunk;
      }
      completed = true;
    } catch (error) {
      if (request) request.status = options.signal?.aborted ? 'canceled' : 'failed';
      throw error;
    } finally {
      try {
        if (request) {
          request.endedAt = this.now();
          request.durationMs = Math.max(0, this.monotonicNow() - started);
          if (request.status === 'pending') {
            if (request.finishReason === 'aborted' || options.signal?.aborted) request.status = 'canceled';
            else if (request.finishReason === 'error') request.status = 'failed';
            else request.status = completed ? 'completed' : 'interrupted';
          }
          if (!this.continuous && request.number === this.maxRequests) this.limit('request-limit');
          if (!this.failure) await this.enqueue(() => { this.trimHistory(); return this.save(); });
        }
      } finally { this.running--; }
    }
  }

  dispose() {
    this.disposed = true;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
  }
}
