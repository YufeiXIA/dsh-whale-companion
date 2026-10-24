import assert from 'node:assert/strict';
import test from 'node:test';
import { CompanionScheduler } from '../src/scheduler.js';

test('ambient events are ephemeral, paused-only and yield to a user message', async () => {
  const driver = fakeDriver();
  const scheduler = new CompanionScheduler({ driver });
  assert.equal(scheduler.ambient({ revision: 1 }), true);
  scheduler.chat('你好');
  await flush();
  assert.equal(driver.calls[0].request.kind, 'chat');
  driver.calls[0].resolve(); await scheduler.whenIdle();
  assert.equal(scheduler.ambient({ revision: 2 }), true);
  await flush();
  assert.equal(driver.calls[1].request.kind, 'ambient');
  assert.equal(driver.calls[1].request.actionsAllowed, false);
  assert.deepEqual(driver.calls[1].request.messages, []);
  scheduler.chat('先回我这句');
  await flush();
  assert.deepEqual(driver.cancellations, ['user-message']);
  assert.equal(driver.steers.length, 0);
  driver.calls[1].resolve(); await flush();
  assert.equal(driver.calls[2].request.kind, 'chat');
  driver.calls[2].resolve(); await scheduler.whenIdle();
  scheduler.reconcile(observation('waiting', { actionable: false })); scheduler.resume();
  assert.equal(scheduler.ambient({ revision: 3 }), false);
  await scheduler.whenIdle();
  assert.equal(driver.maxActive, 1);
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function observation(versionKey, extra = {}) {
  return { versionKey, actionable: true, phase: 'combat', ...extra };
}

function fakeDriver() {
  const calls = [];
  const steers = [];
  const cancellations = [];
  let active = 0;
  let maxActive = 0;
  return {
    calls, steers, cancellations,
    get maxActive() { return maxActive; },
    followup(request) {
      request.markDispatched();
      const done = deferred();
      active++;
      maxActive = Math.max(maxActive, active);
      calls.push({ request, ...done });
      return done.promise.finally(() => active--);
    },
    steer(request) { request.markDispatched(); steers.push(request); },
    cancel(reason) { cancellations.push(reason); },
  };
}

async function flush() {
  await new Promise(resolve => setImmediate(resolve));
}

function running(driver = fakeDriver(), options = {}) {
  const scheduler = new CompanionScheduler({ driver, ...options });
  scheduler.reconcile(observation('initial', { actionable: false }));
  scheduler.resume();
  return { scheduler, driver };
}

test('100 duplicate observations produce exactly one decision', async () => {
  const { scheduler, driver } = running();
  for (let i = 0; i < 100; i++) scheduler.observe(observation('v1'));
  await flush();
  assert.equal(driver.calls.length, 1);
  driver.calls[0].resolve();
  await scheduler.whenIdle();
  scheduler.observe(observation('v1'));
  await flush();
  assert.equal(driver.calls.length, 1);
});

test('busy state updates retain one latest observation and never overlap turns', async () => {
  const { scheduler, driver } = running();
  scheduler.observe(observation('v1'));
  await flush();
  scheduler.observe(observation('v2'));
  scheduler.observe(observation('v3'));
  assert.equal(scheduler.snapshot().pendingVersionKey, 'v3');
  assert.equal(driver.calls.length, 1);
  driver.calls[0].resolve();
  await flush();
  assert.equal(driver.calls.length, 2);
  assert.equal(driver.calls[1].request.observation.versionKey, 'v3');
  assert.equal(driver.maxActive, 1);
  driver.calls[1].resolve();
  await scheduler.whenIdle();
});

test('chat is ordered, uses steer while busy, and survives observation merging', async () => {
  const { scheduler, driver } = running();
  scheduler.observe(observation('v1'));
  await flush();
  scheduler.chat('first');
  scheduler.chat('second');
  scheduler.observe(observation('v2'));
  scheduler.observe(observation('v3'));
  await flush();
  assert.deepEqual(driver.steers[0].messages.map(message => message.content), ['first', 'second']);
  driver.calls[0].resolve();
  await flush();
  assert.equal(driver.calls[1].request.messages.length, 0);
  driver.calls[1].resolve();
  await scheduler.whenIdle();
  assert.deepEqual(scheduler.snapshot().queuedMessages, []);
});

test('without steer support, ordered chat is delivered in the next turn', async () => {
  const driver = fakeDriver();
  delete driver.steer;
  const { scheduler } = running(driver);
  scheduler.observe(observation('v1'));
  await flush();
  scheduler.chat('a');
  scheduler.chat('b');
  driver.calls[0].resolve();
  await flush();
  assert.equal(driver.calls[1].request.kind, 'chat');
  assert.deepEqual(driver.calls[1].request.messages.map(message => message.content), ['a', 'b']);
  driver.calls[1].resolve();
  await scheduler.whenIdle();
});

test('pause closes action gate before cancel and waits for cancel before new chat', async () => {
  const driver = fakeDriver();
  const cancellation = deferred();
  const { scheduler } = running(driver);
  driver.cancel = () => {
    assert.equal(scheduler.actionsAllowed, false);
    return cancellation.promise;
  };
  scheduler.observe(observation('v1'));
  await flush();
  scheduler.observe(observation('v2'));
  const paused = scheduler.pause();
  assert.equal(scheduler.actionsAllowed, false);
  assert.equal(scheduler.snapshot().pendingVersionKey, null);
  scheduler.chat('still here');
  driver.calls[0].resolve();
  await flush();
  assert.equal(driver.calls.length, 1);
  assert.throws(() => scheduler.resume(), /cancellation/);
  cancellation.resolve();
  await paused;
  await flush();
  assert.equal(driver.calls.length, 2);
  assert.equal(driver.calls[1].request.actionsAllowed, false);
  assert.equal(driver.calls[1].request.kind, 'chat');
  driver.calls[1].resolve();
  await scheduler.whenIdle();
});

test('cancellation never replays chat already dispatched through steer', async () => {
  const { scheduler, driver } = running();
  scheduler.observe(observation('v1'));
  await flush();
  const id = scheduler.chat('do you hear me');
  await flush();
  await scheduler.pause();
  driver.calls[0].resolve();
  await flush();
  await scheduler.whenIdle();
  assert.equal(driver.calls.length, 1);
  assert.equal(driver.steers[0].messages[0].id, id);
  assert.deepEqual(scheduler.snapshot().queuedMessages, []);
});

test('wait_for_player and ready states suppress waking and stale pending work', async () => {
  const { scheduler, driver } = running();
  scheduler.setGoal('finish combat');
  scheduler.observe(observation('v1'));
  await flush();
  scheduler.observe(observation('v2'));
  for (let i = 0; i < 100; i++) scheduler.observe(observation('v3', { phase: 'ready' }));
  driver.calls[0].resolve();
  await scheduler.whenIdle();
  scheduler.observe(observation('v4', { phase: 'wait_for_player' }));
  await flush();
  assert.equal(driver.calls.length, 1);
});

test('assistant echoes and own action-result updates do not create extra wakeups', async () => {
  const { scheduler, driver } = running();
  scheduler.observe(observation('v1'));
  await flush();
  scheduler.observe(observation('v2'), { source: 'action-result' });
  scheduler.observe(observation('v2'));
  scheduler.observe(observation('echo'), { source: 'assistant' });
  scheduler.observe(observation('animation'), { source: 'animation' });
  driver.calls[0].resolve();
  await scheduler.whenIdle();
  assert.equal(driver.calls.length, 1);
});

test('unfinished goal allows one no-progress continuation and then pauses', async () => {
  const { scheduler, driver } = running();
  scheduler.setGoal('finish combat');
  scheduler.observe(observation('v1'));
  await flush();
  driver.calls[0].resolve();
  await flush();
  assert.equal(driver.calls.length, 2);
  driver.calls[1].resolve();
  await scheduler.whenIdle();
  assert.equal(scheduler.snapshot().pauseReason, 'no-progress');
  assert.equal(scheduler.actionsAllowed, false);
  scheduler.observe(observation('v2'));
  await flush();
  assert.equal(driver.calls.length, 2);
});

test('a goal assigned during chat continues from latest state once and then pauses', async () => {
  const { scheduler, driver } = running();
  scheduler.observe(observation('v1'));
  await flush();
  driver.calls[0].resolve();
  await scheduler.whenIdle();
  scheduler.chat('finish fight');
  await flush();
  assert.equal(driver.calls[1].request.kind, 'chat');
  scheduler.setGoal('win');
  driver.calls[1].resolve();
  await flush();
  assert.equal(driver.calls.length, 3);
  assert.equal(driver.calls[2].request.observation.versionKey, 'v1');
  assert.equal(driver.calls[2].request.goal, 'win');
  driver.calls[2].resolve();
  await scheduler.whenIdle();
  assert.equal(driver.calls.length, 3);
  assert.equal(scheduler.snapshot().pauseReason, 'no-progress');
});

test('changing the goal refreshes its continuation budget, repeating it does not', async () => {
  const { scheduler, driver } = running();
  scheduler.setGoal('win');
  scheduler.observe(observation('v1'));
  await flush();
  driver.calls[0].resolve();
  await flush();
  scheduler.setGoal('defend');
  driver.calls[1].resolve();
  await flush();
  assert.equal(driver.calls.length, 3);
  assert.equal(driver.calls[2].request.goal, 'defend');
  scheduler.setGoal('defend');
  driver.calls[2].resolve();
  await scheduler.whenIdle();
  assert.equal(driver.calls.length, 3);
  assert.equal(scheduler.snapshot().pauseReason, 'no-progress');
});

test('real action-result progress continues an unfinished goal after the active turn', async () => {
  const { scheduler, driver } = running();
  scheduler.setGoal('win');
  scheduler.observe(observation('v1'));
  await flush();
  scheduler.observe(observation('v2'), { source: 'action-result' });
  scheduler.observe(observation('v2'));
  scheduler.observe(observation('echo'), { source: 'assistant' });
  await flush();
  assert.equal(driver.calls.length, 1);
  driver.calls[0].resolve();
  await flush();
  assert.equal(driver.calls.length, 2);
  assert.equal(driver.calls[1].request.observation.versionKey, 'v2');
  scheduler.completeGoal();
  driver.calls[1].resolve();
  await scheduler.whenIdle();
  assert.equal(driver.calls.length, 2);
});

test('a new action-result received after idle wakes once; presentation feedback does not', async () => {
  const { scheduler, driver } = running();
  scheduler.observe(observation('v1'));
  await flush();
  driver.calls[0].resolve();
  await scheduler.whenIdle();
  scheduler.observe(observation('echo'), { source: 'assistant' });
  scheduler.observe(observation('animation'), { source: 'animation' });
  await flush();
  assert.equal(driver.calls.length, 1);
  scheduler.observe(observation('v2'), { source: 'action-result' });
  scheduler.observe(observation('v2'));
  await flush();
  assert.equal(driver.calls.length, 2);
  driver.calls[1].resolve();
  await scheduler.whenIdle();
  scheduler.observe(observation('v2'), { source: 'action-result' });
  await flush();
  assert.equal(driver.calls.length, 2);
});

test('restored goal requires reconciliation and explicit resume; disconnect revokes control', async () => {
  const driver = fakeDriver();
  const scheduler = new CompanionScheduler({ driver, restored: { goal: 'win', paused: false } });
  assert.equal(scheduler.snapshot().goal, 'win');
  assert.equal(scheduler.actionsAllowed, false);
  assert.throws(() => scheduler.resume(), /Reconcile/);
  scheduler.reconcile(observation('v1'));
  assert.equal(scheduler.actionsAllowed, false);
  scheduler.resume();
  await flush();
  const disconnected = scheduler.setConnected(false);
  assert.equal(scheduler.actionsAllowed, false);
  driver.calls[0].resolve();
  await disconnected;
  await scheduler.whenIdle();
  scheduler.setConnected(true);
  assert.throws(() => scheduler.resume(), /Reconcile/);
  scheduler.reconcile(observation('v2'));
  assert.equal(scheduler.actionsAllowed, false);
});

test('driver exceptions after dispatch are logged and never replay delivered chat', async () => {
  const { scheduler, driver } = running();
  scheduler.chat('question');
  await flush();
  driver.calls[0].reject(new Error('offline failure'));
  await scheduler.whenIdle();
  for (let i = 0; i < 100; i++) scheduler.observe(observation('v2'));
  await flush();
  assert.equal(driver.calls.length, 1);
  assert.equal(scheduler.snapshot().queuedMessages.length, 0);
  assert.deepEqual(scheduler.snapshot().errors, [{ operation: 'followup', message: 'offline failure' }]);
  await scheduler.whenIdle();
  scheduler.resume();
  await flush();
  assert.equal(driver.calls[1].request.messages.length, 0);
  driver.calls[1].resolve();
  await scheduler.whenIdle();
});

test('close retains undispatched chat and prevents cancellation from waking another turn', async () => {
  const driver = fakeDriver();
  delete driver.steer;
  const { scheduler } = running(driver);
  scheduler.chat('already handed off', 'sent-id');
  await flush();
  scheduler.chat('not handed off', 'queued-id');
  await scheduler.close();
  driver.calls[0].resolve();
  await scheduler.whenIdle();
  assert.equal(driver.calls.length, 1);
  assert.deepEqual(scheduler.snapshot().queuedMessages, [{ id: 'queued-id', content: 'not handed off' }]);
  assert.throws(() => scheduler.chat('too late'), /closed/);
  assert.throws(() => scheduler.resume(), /closed/);
  assert.equal(scheduler.actionsAllowed, false);
});

test('a failing steer pauses without dropping chat or launching retries', async () => {
  const { scheduler, driver } = running();
  driver.steer = () => { throw new Error('steer failure'); };
  scheduler.observe(observation('v1'));
  await flush();
  scheduler.chat('keep this message');
  await flush();
  assert.equal(scheduler.actionsAllowed, false);
  driver.calls[0].resolve();
  await scheduler.whenIdle();
  await flush();
  assert.equal(driver.calls.length, 1);
  assert.equal(scheduler.snapshot().queuedMessages[0].content, 'keep this message');
  assert.equal(scheduler.snapshot().errors[0].operation, 'steer');
});

test('cancel rejection is recorded and blocks replay until explicit recovery', async () => {
  const { scheduler, driver } = running();
  driver.cancel = () => Promise.reject(new Error('cancel failure'));
  scheduler.observe(observation('v1'));
  await flush();
  const pause = scheduler.pause();
  scheduler.chat('queued after pause');
  await pause;
  driver.calls[0].resolve();
  await scheduler.whenIdle();
  await flush();
  assert.equal(driver.calls.length, 1);
  assert.equal(scheduler.snapshot().faulted, true);
  assert.equal(scheduler.snapshot().errors[0].operation, 'cancel');
});

test('pause between scheduling and driver invocation prevents stale game dispatch', async () => {
  const { scheduler, driver } = running();
  scheduler.observe(observation('v1'));
  await Promise.resolve();
  const pause = scheduler.pause();
  await pause;
  await scheduler.whenIdle();
  assert.equal(driver.calls.length, 0);
});

test('repeated offline polls do not cancel or replay chat after the first disconnect', async () => {
  const { scheduler, driver } = running();
  scheduler.observe(observation('v1'));
  await flush();
  const disconnected = scheduler.setConnected(false);
  assert.equal(scheduler.actionsAllowed, false);
  await disconnected;
  assert.deepEqual(driver.cancellations, ['disconnected']);
  driver.calls[0].resolve();
  await scheduler.whenIdle();
  scheduler.chat('still chatting while the game is offline');
  await flush();
  assert.equal(driver.calls[1].request.actionsAllowed, false);
  for (let i = 0; i < 20; i++) await scheduler.setConnected(false);
  assert.deepEqual(driver.cancellations, ['disconnected']);
  assert.equal(scheduler.snapshot().active, true);
  driver.calls[1].resolve();
  await scheduler.whenIdle();
  assert.equal(driver.calls.length, 2);
  assert.deepEqual(scheduler.snapshot().queuedMessages, []);
});

test('startup offline polling leaves paused chat running', async () => {
  const driver = fakeDriver();
  const scheduler = new CompanionScheduler({ driver });
  scheduler.chat('hello');
  await flush();
  for (let i = 0; i < 20; i++) await scheduler.setConnected(false);
  assert.equal(driver.cancellations.length, 0);
  driver.calls[0].resolve();
  await scheduler.whenIdle();
  assert.equal(driver.calls.length, 1);
});

test('waitForChange preserves goal and control, suppresses same-state continuation, and resumes on change', async () => {
  const { scheduler, driver } = running();
  scheduler.setGoal('win');
  scheduler.observe(observation('v1'));
  await flush();
  assert.equal(scheduler.waitForChange(), 'v1');
  driver.calls[0].resolve();
  await scheduler.whenIdle();
  assert.equal(scheduler.snapshot().goal, 'win');
  assert.equal(scheduler.snapshot().waitingVersionKey, 'v1');
  assert.equal(scheduler.snapshot().paused, false);
  assert.equal(scheduler.actionsAllowed, true);
  assert.equal(driver.cancellations.length, 0);
  for (let i = 0; i < 100; i++) scheduler.observe(observation('v1'));
  scheduler.observe(observation('echo'), { source: 'assistant' });
  scheduler.observe(observation('animation'), { source: 'animation' });
  scheduler.chat('what are we waiting for');
  await flush();
  assert.equal(driver.calls.length, 2);
  assert.equal(driver.calls[1].request.kind, 'chat');
  driver.calls[1].resolve();
  await scheduler.whenIdle();
  assert.equal(driver.calls.length, 2);
  assert.equal(scheduler.snapshot().waitingVersionKey, 'v1');
  scheduler.observe(observation('v2'));
  await flush();
  assert.equal(driver.calls.length, 3);
  assert.equal(driver.calls[2].request.observation.versionKey, 'v2');
  assert.equal(driver.calls[2].request.goal, 'win');
  assert.equal(scheduler.snapshot().waitingVersionKey, null);
  scheduler.completeGoal();
  driver.calls[2].resolve();
  await scheduler.whenIdle();
});

test('waitForChange clears merged pending state and does not mistake waiting phases for decisions', async () => {
  const { scheduler, driver } = running();
  scheduler.setGoal('win');
  scheduler.observe(observation('v1'));
  await flush();
  scheduler.observe(observation('v2'));
  scheduler.waitForChange();
  assert.equal(scheduler.snapshot().pendingVersionKey, null);
  driver.calls[0].resolve();
  await scheduler.whenIdle();
  assert.equal(driver.calls.length, 1);
  scheduler.observe(observation('v3', { phase: 'ready' }));
  await flush();
  assert.equal(driver.calls.length, 1);
  scheduler.observe(observation('v4'), { source: 'action-result' });
  await flush();
  assert.equal(driver.calls.length, 2);
  assert.equal(driver.calls[1].request.observation.versionKey, 'v4');
  scheduler.completeGoal();
  driver.calls[1].resolve();
  await scheduler.whenIdle();
});
