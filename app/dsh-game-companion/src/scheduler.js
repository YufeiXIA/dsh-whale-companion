/**
 * Offline scheduler. The host owns persistence and the actual DSH adapter.
 *
 * driver.followup(request) must settle only after the agent is fully idle, not
 * when its message is merely queued. Wrap DSH followup + whenIdle accordingly.
 * Optional steer(request) adds ordered chat to the running turn; its promise is
 * an acceptance acknowledgement. cancel(reason) must finish canceling before
 * settling. No second turn starts until followup, steer and cancel have settled.
 *
 * Each request carries actionsAllowed for context. Tools MUST additionally
 * check scheduler.actionsAllowed immediately before submitting every action.
 * An already submitted action cannot be rolled back by this scheduler.
 *
 * A driver calls request.markDispatched() immediately before submitting input,
 * after persisting its dispatch intent. Those chats must never be replayed by
 * this scheduler, even if cancellation or an error follows. The host owns
 * durable delivery records and reconciliation of uncertain submissions.
 */
export class CompanionScheduler {
  constructor({ driver, restored = {} }) {
    if (typeof driver?.followup !== 'function') {
      throw new TypeError('driver.followup must wait for the full agent turn');
    }
    this.driver = driver;
    this.goal = restored.goal ?? null;
    this.paused = true;
    this.pauseReason = 'startup';
    this.connected = false;
    this.reconciled = false;
    this.latest = null;
    this.pending = null;
    this.ambientPending = null;
    this.messages = [];
    this.nextMessageId = 1;
    this.active = null;
    this.lastDecisionKey = null;
    this.continuationKey = null;
    this.waitingVersionKey = null;
    this.errors = [];
    this.faulted = false;
    this.scheduled = false;
    this.closed = false;
    this.idleWaiters = [];
  }

  get actionsAllowed() {
    return !this.closed && !this.paused && this.connected && this.reconciled && !this.faulted;
  }

  setGoal(goal) {
    if (goal !== this.goal) this.continuationKey = null;
    this.goal = goal;
  }

  completeGoal() {
    // Only a host-confirmed game readback should call this, not model prose.
    this.setGoal(null);
  }

  waitForChange() {
    // Waiting keeps the goal and control mode; it only suppresses this state.
    this.waitingVersionKey = this.latest?.versionKey ?? null;
    this.pending = null;
    this.#schedule();
    return this.waitingVersionKey;
  }

  snapshot() {
    return {
      goal: this.goal,
      paused: this.paused,
      pauseReason: this.pauseReason,
      connected: this.connected,
      reconciled: this.reconciled,
      active: Boolean(this.active),
      pendingVersionKey: this.pending?.versionKey ?? null,
      waitingVersionKey: this.waitingVersionKey,
      queuedMessages: this.messages.map(message => ({ ...message })),
      errors: this.errors.map(error => ({ ...error })),
      faulted: this.faulted,
    };
  }

  reconcile(observation) {
    this.#validateObservation(observation);
    this.latest = observation;
    this.connected = true;
    this.reconciled = true;
    // Reconnecting never implicitly restores control.
  }

  setConnected(connected) {
    const wasConnected = this.connected;
    this.connected = Boolean(connected);
    if (!this.connected) {
      this.reconciled = false;
      // Failed offline polls must not cancel chat started after disconnection.
      if (wasConnected || !this.paused) return this.pause('disconnected');
      return this.active?.cancelPromise ?? Promise.resolve();
    }
    return Promise.resolve();
  }

  resume() {
    if (this.closed) throw new Error('Scheduler is closed');
    if (!this.connected || !this.reconciled) {
      throw new Error('Reconcile the connected game before resuming');
    }
    if (this.active?.canceled) {
      throw new Error('Wait for cancellation to finish before resuming');
    }
    this.paused = false;
    this.ambientPending = null;
    this.faulted = false;
    this.pauseReason = null;
    this.lastDecisionKey = null;
    this.continuationKey = null;
    this.waitingVersionKey = null;
    this.pending = this.#actionable(this.latest) ? this.latest : null;
    this.#schedule();
  }

  pause(reason = 'user') {
    // Close this synchronous gate before invoking any asynchronous driver code.
    this.paused = true;
    this.pauseReason = reason;
    this.pending = null;
    this.ambientPending = null;
    const turn = this.active;
    if (!turn || turn.canceled) return turn?.cancelPromise ?? Promise.resolve();
    turn.canceled = true;
    turn.cancelPending = true;
    turn.cancelPromise = Promise.resolve().then(() => this.driver.cancel?.(reason))
      .catch(error => this.#recordError('cancel', error))
      .finally(() => {
        turn.cancelPending = false;
        this.#finish(turn);
      });
    return turn.cancelPromise;
  }

  close() {
    this.closed = true;
    return this.pause('host-disposed');
  }

  observe(observation, { source = 'game' } = {}) {
    // UI animations and assistant echoes must never enter the wakeup path.
    if (source !== 'game' && source !== 'action-result') return;
    this.#validateObservation(observation);
    this.latest = observation;
    if (this.waitingVersionKey !== null) {
      if (observation.versionKey === this.waitingVersionKey) {
        this.pending = null;
        return;
      }
      this.waitingVersionKey = null;
      this.continuationKey = null;
    }
    if (!this.actionsAllowed || !this.#actionable(observation)) {
      this.pending = null;
      return;
    }
    if (source === 'action-result' && this.active) {
      // The running tool loop already received this state. A subsequent poll
      // of that same state must not create another decision.
      this.lastDecisionKey = observation.versionKey;
      this.pending = null;
      return;
    }
    if (observation.versionKey === this.active?.observation?.versionKey ||
        observation.versionKey === this.lastDecisionKey) {
      this.pending = null;
      return;
    }
    this.pending = observation;
    this.#schedule();
  }

  chat(content, id = this.nextMessageId++) {
    if (this.closed) throw new Error('Scheduler is closed');
    if (this.messages.some(message => message.id === id)) return id;
    this.ambientPending = null;
    if (this.active?.kind === 'ambient') void this.pause('user-message');
    // A new user message can recover chat after an error without resuming play.
    if (this.paused && !this.active) this.faulted = false;
    const message = { id, content };
    this.messages.push(message);
    this.#schedule();
    return message.id;
  }

  ambient(event) {
    // Ephemeral, lowest-priority input. Never queues behind chat/game work.
    if (this.closed || this.faulted || !this.paused || this.active || this.scheduled || this.messages.length) return false;
    this.ambientPending = event;
    this.#schedule();
    return true;
  }

  whenIdle() {
    if (!this.active && !this.scheduled &&
        (this.messages.length === 0 || this.faulted || this.closed) && !this.pending && !this.ambientPending) {
      return Promise.resolve();
    }
    return new Promise(resolve => this.idleWaiters.push(resolve));
  }

  #validateObservation(observation) {
    if (!observation || !['string', 'number'].includes(typeof observation.versionKey)) {
      throw new TypeError('Observation requires an adapter-provided versionKey');
    }
  }

  #actionable(observation) {
    return observation?.actionable === true &&
      !['wait_for_player', 'ready', 'waiting', 'disconnected'].includes(observation.phase);
  }

  #schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.#pump();
    });
  }

  #request(kind, messages, observation = null) {
    return { kind, messages, observation, goal: this.goal, actionsAllowed: this.actionsAllowed,
      markDispatched: () => {
        const ids = new Set(messages.map(message => message.id));
        this.messages = this.messages.filter(message => !ids.has(message.id));
      } };
  }

  #pump() {
    if (this.faulted || this.closed) {
      if (!this.active) {
        for (const resolve of this.idleWaiters.splice(0)) resolve();
      }
      return;
    }
    if (this.active) {
      this.#steer(this.active);
      return;
    }
    const messages = [...this.messages];
    const observation = this.actionsAllowed ? this.pending : null;
    const ambient = !messages.length && !observation && this.paused ? this.ambientPending : null;
    this.ambientPending = null;
    this.pending = null;
    if (!messages.length && !observation && !ambient) {
      for (const resolve of this.idleWaiters.splice(0)) resolve();
      return;
    }
    const turn = {
      kind: ambient ? 'ambient' : observation ? 'game' : 'chat',
      observation,
      initialVersionKey: this.latest?.versionKey,
      delivered: new Set(messages.map(message => message.id)),
      canceled: false,
      cancelPending: false,
      steerPending: false,
      settled: false,
      failed: false,
    };
    this.active = turn;
    if (observation) this.lastDecisionKey = observation.versionKey;
    const request = this.#request(turn.kind, messages, observation);
    if (ambient) { request.environment = ambient; request.actionsAllowed = false; }
    Promise.resolve().then(() => {
      if (!turn.canceled) return this.driver.followup(request);
    }).catch(error => {
      turn.failed = true;
      this.#recordError('followup', error);
    }).finally(() => {
      turn.settled = true;
      this.#finish(turn);
    });
  }

  #steer(turn) {
    if (turn.kind === 'ambient') return;
    if (!this.driver.steer || turn.canceled || turn.settled || turn.steerPending) return;
    const messages = this.messages.filter(message => !turn.delivered.has(message.id));
    if (!messages.length) return;
    turn.steerPending = true;
    for (const message of messages) turn.delivered.add(message.id);
    Promise.resolve().then(() => {
      if (!turn.canceled && !turn.settled) {
        return this.driver.steer(this.#request('chat', messages));
      }
      for (const message of messages) turn.delivered.delete(message.id);
    }).catch(error => {
      this.#recordError('steer', error);
      turn.failed = true;
      this.pause('driver-error');
    }).finally(() => {
      turn.steerPending = false;
      this.#finish(turn);
      this.#schedule();
    });
  }

  #finish(turn) {
    if (this.active !== turn || !turn.settled || turn.cancelPending || turn.steerPending) return;
    this.active = null;
    if (!turn.canceled && !turn.failed) {
      this.messages = this.messages.filter(message => !turn.delivered.has(message.id));
    }
    if (turn.failed) {
      // Leave failed messages visible for manual recovery, without retry loops.
      this.pending = null;
      for (const resolve of this.idleWaiters.splice(0)) resolve();
      return;
    }
    if (!turn.canceled && this.goal !== null &&
        this.actionsAllowed && this.#actionable(this.latest) &&
        this.waitingVersionKey !== this.latest.versionKey) {
      const key = this.latest.versionKey;
      if (key !== turn.initialVersionKey) {
        this.continuationKey = null;
        this.pending = this.latest;
      } else if (this.continuationKey !== key) {
        this.continuationKey = key;
        this.pending = this.latest;
      } else {
        this.paused = true;
        this.pauseReason = 'no-progress';
        this.pending = null;
      }
    }
    this.#schedule();
  }

  #recordError(operation, error) {
    this.faulted = true;
    this.paused = true;
    this.pauseReason = 'driver-error';
    this.pending = null;
    this.errors.push({ operation, message: String(error?.message ?? error) });
    if (this.errors.length > 20) this.errors.shift();
  }
}
