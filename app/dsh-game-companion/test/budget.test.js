import assert from 'node:assert/strict';
import test from 'node:test';
import { TrialBudget } from '../src/budget.js';

const options = { provider: 'test', model: 'test-model' };
const finish = { type: 'finish', reason: { kind: 'stop' } };
const consume = async stream => { const chunks = []; for await (const chunk of stream) chunks.push(chunk); return chunks; };
const stream = (...chunks) => async function* () { yield* chunks; };
function deferred() { let resolve; return { promise: new Promise(done => { resolve = done; }), resolve }; }
function fixture(t, config = {}) {
  let time = 1000, monotonic = 50, timer;
  const saved = [], limits = [];
  const budget = new TrialBudget({ persist: async state => saved.push(state), onLimit: reason => limits.push(reason),
    now: () => time, monotonicNow: () => monotonic,
    setTimer: (callback, delay) => { timer = { callback, delay }; return timer; }, clearTimer: () => { timer = null; }, ...config });
  t.after(() => budget.dispose());
  return { budget, saved, limits, advance: ms => { time += ms; monotonic += ms; }, fireTimer: () => timer.callback(), timer: () => timer };
}

test('begin is explicit, requires paused host, and uses 30 minute / 100 request defaults', async t => {
  const { budget, saved, timer } = fixture(t);
  let dispatched = false;
  await assert.rejects(consume(budget.wrap(options, () => { dispatched = true; return stream(finish)(); })), /not begun/);
  await assert.rejects(budget.begin({ paused: false }), /paused, idle/);
  assert.equal(dispatched, false);
  assert.equal(saved.length, 0);
  const begun = await budget.begin({ paused: true });
  assert.equal(begun.deadlineAt - begun.startedAt, 1800000);
  assert.equal(timer().delay, 1800000);
  assert.equal(budget.maxRequests, 100);
});

test('concurrent admissions persist serially before dispatch; latest usage is retained once', async t => {
  const gate = deferred(), entered = deferred(), persisted = [];
  const { budget, advance } = fixture(t, { persist: async state => {
    if (state.requestCount === 1 && state.requests[0].status === 'pending') { entered.resolve(); await gate.promise; }
    persisted.push(state);
  } });
  await budget.begin({ paused: true });
  const dispatched = [];
  const call = label => consume(budget.wrap(options, async function* () {
    assert.ok(persisted.some(state => state.requests.some(request => request.number === dispatched.length + 1)));
    dispatched.push(label);
    advance(12);
    yield { type: 'usage', usage: { inputTokens: 2, outputTokens: 1 } };
    yield { type: 'usage', usage: { inputTokens: 3, outputTokens: 4, cacheReadTokens: 5, cacheWriteTokens: 6, totalTokens: 18 } };
    yield finish;
  }));
  const first = call('first');
  await entered.promise;
  const second = call('second');
  assert.deepEqual(dispatched, []);
  gate.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(dispatched, ['first', 'second']);
  const state = budget.snapshot();
  assert.equal(state.requestCount, 2);
  assert.deepEqual(state.requests[0].usage, { inputTokens: 3, outputTokens: 4, cacheReadTokens: 5, cacheWriteTokens: 6, totalTokens: 18, reasoningTokens: null });
  assert.equal(state.requests[0].startedAt, 1000);
  assert.ok(state.requests[0].durationMs >= 12);
  assert.equal(state.requests[0].status, 'completed');
  assert.notEqual(state.requests[0].id, state.requests[1].id);
});

test('admission persistence failure dispatches nothing, retains reservation, and fails closed', async t => {
  const failure = new Error('disk full');
  let writes = 0, dispatched = 0;
  const { budget, limits } = fixture(t, { persist: async state => { writes++; if (state.requestCount) throw failure; } });
  await budget.begin({ paused: true });
  const next = () => { dispatched++; return stream(finish)(); };
  await assert.rejects(consume(budget.wrap(options, next)), error => error === failure);
  await assert.rejects(consume(budget.wrap(options, next)), error => error === failure);
  assert.equal(dispatched, 0);
  assert.equal(writes, 2);
  assert.equal(budget.snapshot().requestCount, 1);
  assert.deepEqual(limits, ['budget-persistence-error']);
});

test('expiry while admission persistence waits closes permission synchronously and prevents dispatch', async t => {
  const gate = deferred(), entered = deferred();
  let allowed = true, dispatched = false;
  const { budget, advance, fireTimer } = fixture(t, { durationMs: 10,
    onLimit: () => { allowed = false; }, persist: async state => {
      if (state.requestCount === 1 && state.requests[0].status === 'pending') { entered.resolve(); await gate.promise; }
    } });
  await budget.begin({ paused: true });
  const request = consume(budget.wrap(options, () => { dispatched = true; return stream(finish)(); }));
  await entered.promise;
  advance(10);
  fireTimer();
  assert.equal(allowed, false);
  gate.resolve();
  await assert.rejects(request, /time-limit/);
  assert.equal(dispatched, false);
  assert.equal(budget.snapshot().requestCount, 1);
});

test('100th completion pauses, rejects 101st, and ordinary observation cannot reset it', async t => {
  const { budget, limits } = fixture(t);
  await budget.begin({ paused: true });
  let dispatched = 0;
  const next = () => { dispatched++; return stream(finish)(); };
  for (let i = 0; i < 99; i++) await consume(budget.wrap(options, next));
  assert.deepEqual(limits, []);
  await consume(budget.wrap(options, next));
  assert.deepEqual(limits, ['request-limit']);
  await assert.rejects(consume(budget.wrap(options, next)), /request-limit/);
  assert.equal(dispatched, 100);
  assert.equal(budget.snapshot().requestCount, 100);
  await budget.begin({ paused: true });
  assert.equal(budget.snapshot().requestCount, 0);
});

test('failed, canceled, and consumer-interrupted attempts do not refund; unknown usage stays null', async t => {
  const { budget } = fixture(t);
  await budget.begin({ paused: true });
  await assert.rejects(consume(budget.wrap(options, async function* () { throw new Error('transport'); })), /transport/);
  const controller = new AbortController();
  await assert.rejects(consume(budget.wrap({ ...options, signal: controller.signal }, async function* () {
    controller.abort(); controller.signal.throwIfAborted();
  })), /abort/i);
  for await (const _chunk of budget.wrap(options, stream({ type: 'text-delta', text: 'hi' }, finish))) break;
  const state = budget.snapshot();
  assert.equal(state.requestCount, 3);
  assert.deepEqual(state.requests.map(request => request.status), ['failed', 'canceled', 'interrupted']);
  assert.ok(Object.values(state.requests[0].usage).every(value => value === null));
  assert.ok(state.requests.every(request => request.endedAt !== null && request.durationMs !== null));
});

test('terminal error/abort chunks retain provider usage and failures, not successful completion', async t => {
  const { budget } = fixture(t);
  await budget.begin({ paused: true });
  for (const kind of ['error', 'aborted']) await consume(budget.wrap(options, stream(
    { type: 'usage', usage: { inputTokens: 0, outputTokens: 0 } }, { type: 'finish', reason: { kind } })));
  assert.deepEqual(budget.snapshot().requests.map(request => request.status), ['failed', 'canceled']);
  assert.equal(budget.snapshot().requests[0].usage.inputTokens, 0);
});

test('restore preserves count/deadline and marks crash-interrupted timings unknown', async t => {
  const { budget: original } = fixture(t);
  await original.begin({ paused: true });
  await consume(original.wrap(options, stream(finish)));
  const restored = original.snapshot();
  restored.requests[0].status = 'pending';
  restored.requests[0].endedAt = null;
  restored.requests[0].durationMs = null;
  const { budget, advance, fireTimer, limits } = fixture(t, { restored });
  assert.equal(budget.snapshot().requestCount, 1);
  assert.equal(budget.snapshot().deadlineAt, restored.deadlineAt);
  assert.equal(budget.snapshot().requests[0].status, 'unknown');
  assert.equal(budget.snapshot().requests[0].durationMs, null);
  await consume(budget.wrap(options, stream(finish)));
  assert.equal(budget.snapshot().requestCount, 2);
  advance(1800000);
  fireTimer();
  assert.deepEqual(limits, ['time-limit']);
  await assert.rejects(consume(budget.wrap(options, stream(finish))), /time-limit/);
});

test('restored exhausted trial notifies immediately and does not silently restart', async t => {
  const restored = { startedAt: 0, deadlineAt: 500, requestCount: 7, limitReason: null,
    requests: Array.from({ length: 7 }, () => ({ status: 'pending', endedAt: null, durationMs: null })) };
  const { budget, limits } = fixture(t, { restored });
  assert.deepEqual(limits, ['time-limit']);
  await assert.rejects(consume(budget.wrap(options, stream(finish))), /time-limit/);
  assert.equal(budget.snapshot().requestCount, 7);
});

test('pre-aborted call is not admitted; cancellation during persistence does consume its reservation', async t => {
  const gate = deferred(), entered = deferred();
  const { budget } = fixture(t, { persist: async state => {
    if (state.requestCount === 1 && state.requests[0].status === 'pending') { entered.resolve(); await gate.promise; }
  } });
  await budget.begin({ paused: true });
  await assert.rejects(consume(budget.wrap({ ...options, signal: AbortSignal.abort() }, stream(finish))), /abort/i);
  assert.equal(budget.snapshot().requestCount, 0);
  const controller = new AbortController();
  let dispatched = false;
  const request = consume(budget.wrap({ ...options, signal: controller.signal }, () => { dispatched = true; return stream(finish)(); }));
  await entered.promise;
  controller.abort(); gate.resolve();
  await assert.rejects(request, /abort/i);
  assert.equal(dispatched, false);
  assert.equal(budget.snapshot().requestCount, 1);
});

test('begin cannot erase an active request and dispose prevents further admission', async t => {
  const gate = deferred(), entered = deferred();
  const { budget } = fixture(t);
  await budget.begin({ paused: true });
  const active = consume(budget.wrap(options, async function* () { entered.resolve(); await gate.promise; yield finish; }));
  await entered.promise;
  await assert.rejects(budget.begin({ paused: true }), /paused, idle/);
  gate.resolve(); await active;
  budget.dispose();
  await assert.rejects(consume(budget.wrap(options, stream(finish))), /disposed/);
  assert.equal(budget.snapshot().requestCount, 1);
});

test('settlement persistence failure preserves the durable reservation and blocks new calls', async t => {
  const saved = [], failure = new Error('settlement write failed');
  const { budget, limits } = fixture(t, { persist: async state => {
    if (state.requests[0]?.status === 'completed') throw failure;
    saved.push(state);
  } });
  await budget.begin({ paused: true });
  await assert.rejects(consume(budget.wrap(options, stream(finish))), error => error === failure);
  await assert.rejects(consume(budget.wrap(options, stream(finish))), error => error === failure);
  assert.equal(saved.at(-1).requestCount, 1);
  assert.equal(saved.at(-1).requests[0].status, 'pending');
  assert.deepEqual(limits, ['budget-persistence-error']);
});

test('timer persistence failure is reported without an unhandled rejection or re-opening permission', async t => {
  const failed = deferred();
  const { budget, advance, fireTimer, limits } = fixture(t, { durationMs: 10, persist: async state => {
    if (state.limitReason) { failed.resolve(); throw new Error('timer write failed'); }
  } });
  await budget.begin({ paused: true });
  advance(10); fireTimer();
  assert.deepEqual(limits, ['time-limit']);
  await failed.promise;
  await assert.rejects(consume(budget.wrap(options, stream(finish))), /timer write failed/);
  assert.deepEqual(limits, ['time-limit', 'budget-persistence-error']);
});

test('invalid restored budget is rejected before scheduling or persistence, never silently reset', () => {
  const valid = { startedAt: 1000, deadlineAt: 2000, requestCount: 1, requests: [{ status: 'pending' }] };
  const invalid = [null, {},
    { ...valid, startedAt: undefined }, { ...valid, startedAt: null }, { ...valid, startedAt: NaN },
    { ...valid, deadlineAt: undefined }, { ...valid, deadlineAt: null }, { ...valid, deadlineAt: Infinity },
    { ...valid, deadlineAt: NaN }, { ...valid, deadlineAt: '2000' }, { ...valid, deadlineAt: 1000 },
    { ...valid, requestCount: -1 }, { ...valid, requestCount: 1.5 }, { ...valid, requestCount: Infinity },
    { ...valid, requestCount: 0 }, { ...valid, requests: null }, { ...valid, requests: {} },
    { ...valid, requests: [null] }, { ...valid, requests: [[]] }, { ...valid, requests: [{}] },
    { ...valid, requests: [{ status: 'unrecognized' }] }
  ];
  for (const restored of invalid) assert.throws(() => new TrialBudget({ restored,
    persist: () => assert.fail('must not save invalid restore'), onLimit: () => assert.fail('must not notify invalid restore'),
    setTimer: () => assert.fail('must not schedule invalid restore') }), /Invalid restored trial budget/);
});

test('an explicitly saved unstarted budget stays unstarted after restore', async t => {
  const restored = { startedAt: null, deadlineAt: null, requestCount: 0, limitReason: null, requests: [] };
  const { budget, timer, saved } = fixture(t, { restored });
  assert.deepEqual(budget.snapshot(), restored);
  assert.equal(timer(), undefined);
  assert.deepEqual(saved, []);
  await assert.rejects(consume(budget.wrap(options, stream(finish))), /not begun/);
});
