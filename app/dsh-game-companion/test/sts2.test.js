import assert from 'node:assert/strict';
import test from 'node:test';
import { Sts2Adapter } from '../src/sts2.js';

const identity = { instance_id: 'instance-a', run_id: 'run-a', local_player_id: 'player-a' };
const actions = ['play_card', 'end_turn', 'use_potion', 'discard_potion', 'choose_map_node',
  'claim_reward', 'select_card_reward', 'skip_card_reward', 'proceed', 'choose_event_option', 'advance_dialogue',
  'choose_rest_option', 'select_card', 'confirm_selection', 'cancel_selection', 'open_shop',
  'close_shop', 'shop_purchase', 'open_treasure', 'claim_treasure_relic'];

function envelope(version = 1, overrides = {}) {
  return { ...identity, version, allowed_actions: actions, pending_action_id: null,
    requires_reconciliation: false, receipt: null, receipts: [],
    state: { state_type: 'monster', game_mode: 'multiplayer', player_count: 2, local_player_slot: 0,
      players: [{ is_local: true, is_alive: true, is_ready_to_end_turn: false },
        { is_local: false, is_alive: true, is_ready_to_end_turn: false }],
      battle: { turn: 'player', is_play_phase: true } }, ...overrides };
}

function receiptEnvelope(id, { version = 1, status = 'accepted', effect = false } = {}) {
  const receipt = { action_id: id, status, effect_observed: effect, submitted_version: 1,
    observed_version: effect ? version : null, requires_reconciliation: status === 'uncertain' };
  return envelope(version, { receipt, receipts: [receipt],
    pending_action_id: effect || status === 'rejected' || status === 'not_executed' ? null : id,
    requires_reconciliation: status === 'uncertain' });
}

function mockServer(steps) {
  const requests = [];
  async function fetchImpl(url, options) {
    const request = { url, ...options, payload: options.body ? JSON.parse(options.body) : null };
    requests.push(request);
    assert.equal(new URL(url).pathname, '/api/v1/companion');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer test-secret');
    assert.ok(steps.length, 'unexpected extra HTTP request');
    const next = steps.shift();
    const body = typeof next === 'function' ? await next(request) : next;
    return { ok: true, status: 200, json: async () => structuredClone(body) };
  }
  return { requests, fetchImpl };
}

async function bound(steps = [], options = {}) {
  const server = mockServer([envelope(), ...steps]);
  const adapter = new Sts2Adapter({ token: 'test-secret', canAct: () => true,
    fetchImpl: server.fetchImpl, pollIntervalMs: 1, ...options });
  await adapter.observe();
  adapter.bind(identity);
  return { adapter, ...server };
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('observations carry guard identities/version, and binding is explicit', async () => {
  const server = mockServer([envelope()]);
  const adapter = new Sts2Adapter({ token: 'test-secret', canAct: () => true, fetchImpl: server.fetchImpl });
  const seen = await adapter.observe();
  assert.deepEqual(JSON.parse(seen.versionKey), ['instance-a', 'run-a', 'player-a', 1]);
  assert.equal(seen.phase, 'combat');
  assert.equal(seen.actionable, true);
  assert.deepEqual(seen.guard.allowed_actions, actions);
  await assert.rejects(adapter.act({ action: 'end_turn' }), { code: 'UNBOUND' });
  assert.throws(() => adapter.bind({ ...identity, local_player_id: 'other-player' }), { code: 'BINDING_INVALID' });
  adapter.bind(identity);
  assert.deepEqual(adapter.binding, identity);
});

test('run/player/instance rollover never silently rebinds', async () => {
  for (const field of ['instance_id', 'run_id', 'local_player_id']) {
    const { adapter, requests } = await bound([envelope(1, { [field]: 'changed' })]);
    await assert.rejects(adapter.act({ action: 'end_turn' }), { code: 'BINDING_CHANGED', pauseRequired: true });
    assert.deepEqual(adapter.binding, identity);
    assert.equal(requests.filter(request => request.method === 'POST').length, 0);
  }
});

test('preflight rejects changed versions without refreshing selected card indices', async () => {
  const { adapter, requests } = await bound([envelope(2)]);
  await assert.rejects(adapter.act({ action: 'play_card', card_index: 0, target: 'enemy-1' }), { code: 'STALE_STATE' });
  assert.equal(requests.length, 2);
  assert.equal(requests.filter(request => request.method === 'POST').length, 0);
});

test('decision version protects indices even when background observation already advanced', async () => {
  const { adapter, requests } = await bound([envelope(2)]);
  const decisionVersion = adapter.latest.versionKey;
  await adapter.observe();
  await assert.rejects(adapter.act({ action: 'play_card', card_index: 0 }, { expectedVersionKey: decisionVersion }), { code: 'STALE_STATE' });
  assert.equal(requests.length, 2);
});

test('live pause gate is checked before preflight and again immediately before POST', async () => {
  let allowed = false;
  const { adapter, requests } = await bound([() => { allowed = false; return envelope(); }], { canAct: () => allowed });
  await assert.rejects(adapter.act({ action: 'end_turn' }), { code: 'PAUSED' });
  assert.equal(requests.length, 1);
  allowed = true;
  await assert.rejects(adapter.act({ action: 'end_turn' }), { code: 'PAUSED' });
  assert.equal(requests.filter(request => request.method === 'POST').length, 0);
});

test('concurrent actions are rejected rather than queued with stale targets', async () => {
  const preflight = deferred();
  let submitted;
  const { adapter, requests } = await bound([() => preflight.promise,
    request => { submitted = request.payload; return receiptEnvelope(submitted.action_id, { effect: true, version: 2 }); },
    envelope(2)]);
  const first = adapter.act({ action: 'play_card', card_index: 2, target: 'enemy-1' });
  await assert.rejects(adapter.act({ action: 'end_turn' }), { code: 'BUSY' });
  preflight.resolve(envelope());
  await first;
  assert.equal(requests.filter(request => request.method === 'POST').length, 1);
  assert.equal(submitted.card_index, 2);
  assert.equal(submitted.target, 'enemy-1');
});

test('accepted and unrelated state progress do not complete an action without local effect', async () => {
  let id;
  let completed = false;
  const confirmation = deferred();
  const queryStarted = deferred();
  const { adapter, requests } = await bound([envelope(),
    request => { id = request.payload.action_id; return receiptEnvelope(id); },
    request => {
      assert.equal(new URL(request.url).searchParams.get('action_id'), id);
      return receiptEnvelope(id, { version: 2 });
    },
    () => { queryStarted.resolve(); return confirmation.promise; },
    envelope(3)]);
  const action = adapter.act({ action: 'end_turn' }).then(result => { completed = true; return result; });
  await queryStarted.promise;
  assert.equal(completed, false);
  confirmation.resolve(receiptEnvelope(id, { version: 3, effect: true }));
  const result = await action;
  assert.equal(result.status, 'effect_observed');
  assert.equal(result.observation.guard.version, 3);
  assert.equal(adapter.pendingActionId, null);
  const post = requests.find(request => request.method === 'POST').payload;
  assert.match(post.action_id, /^[a-f0-9-]{36}$/);
  assert.deepEqual(Object.fromEntries(Object.keys(identity).map(key => [key, post[key]])), identity);
  assert.equal(post.version, 1);
  assert.ok(Date.parse(post.expires_at) > Date.now());
  assert.equal(requests.filter(request => request.method === 'POST').length, 1);
});

test('lost POST response is recovered by querying the same action ID, never reposting', async () => {
  let id;
  const { adapter, requests } = await bound([envelope(),
    request => { id = request.payload.action_id; throw new Error('network test-secret'); },
    request => {
      assert.equal(new URL(request.url).searchParams.get('action_id'), id);
      return receiptEnvelope(id, { version: 2, effect: true });
    }, envelope(2)]);
  assert.equal((await adapter.act({ action: 'end_turn' })).status, 'effect_observed');
  assert.equal(requests.filter(request => request.method === 'POST').length, 1);
});

test('authoritative pre-effect cancellation clears pending without reporting an effect or reposting', async () => {
  let id;
  const saved = [];
  const { adapter, requests } = await bound([envelope(),
    request => { id = request.payload.action_id; return receiptEnvelope(id); },
    () => receiptEnvelope(id, { status: 'not_executed', version: 2 })],
  { onStateChange: snapshot => saved.push(snapshot) });
  await assert.rejects(adapter.act({ action: 'play_card', card_index: 0, target: 'enemy-1' }),
    { code: 'ACTION_NOT_EXECUTED', pauseRequired: false });
  assert.equal(adapter.pendingActionId, null);
  assert.equal(saved[0].pending.actionId, id);
  assert.equal(saved.at(-1).pending, null);
  assert.equal(requests.filter(request => request.method === 'POST').length, 1);
  assert.equal(adapter.latest.guard.receipt.effect_observed, false);
});

test('restored cancellation is reconciled without replay and still requires explicit binding confirmation', async () => {
  const server = mockServer([receiptEnvelope('old-action', { status: 'not_executed', version: 2 })]);
  const adapter = new Sts2Adapter({ token: 'test-secret', canAct: () => true, fetchImpl: server.fetchImpl,
    restored: { binding: identity, pending: { actionId: 'old-action', deadline: Date.now() - 100 } } });
  const result = await adapter.reconcile();
  assert.equal(result.status, 'not_executed');
  assert.equal(result.requiresBinding, true);
  assert.equal(adapter.pendingActionId, null);
  assert.ok(server.requests.every(request => request.method === 'GET'));
  await assert.rejects(adapter.act({ action: 'end_turn' }), { code: 'PAUSED' });
});

test('contradictory cancellation evidence cannot clear a restored pending action', async () => {
  for (const override of [{ effect_observed: true }, { requires_reconciliation: true }]) {
    const body = receiptEnvelope('old-action', { status: 'not_executed' });
    Object.assign(body.receipt, override);
    const server = mockServer([body]);
    const adapter = new Sts2Adapter({ token: 'test-secret', canAct: () => true, fetchImpl: server.fetchImpl,
      restored: { binding: identity, pending: { actionId: 'old-action', deadline: Date.now() + 1000 } } });
    await assert.rejects(adapter.reconcile(), { code: 'ACTION_UNCERTAIN', pauseRequired: true });
    assert.equal(adapter.pendingActionId, 'old-action');
    assert.equal(server.requests.length, 1);
  }
});

test('main-thread 202 uncertainty triggers receipt query, not a second POST', async () => {
  let id;
  const { adapter, requests } = await bound([envelope(),
    request => { id = request.payload.action_id; return { status: 'uncertain', action_id: id }; },
    () => receiptEnvelope(id, { version: 2, effect: true }), envelope(2)]);
  await adapter.act({ action: 'end_turn' });
  assert.equal(requests.filter(request => request.method === 'POST').length, 1);
});

test('uncertain receipt latches a pause requirement until explicit evidence-based reconciliation', async () => {
  let id;
  const { adapter, requests } = await bound([envelope(),
    request => { id = request.payload.action_id; return receiptEnvelope(id, { status: 'uncertain' }); },
    () => receiptEnvelope(id, { version: 2, effect: true })]);
  await assert.rejects(adapter.act({ action: 'end_turn' }), { code: 'ACTION_UNCERTAIN', pauseRequired: true });
  await assert.rejects(adapter.act({ action: 'end_turn' }), { code: 'ACTION_UNCERTAIN', actionId: id });
  assert.equal(requests.filter(request => request.method === 'POST').length, 1);
  assert.equal((await adapter.reconcile()).status, 'effect_observed');
  assert.equal(adapter.pendingActionId, null);
});

test('receipt timeout remains uncertain, blocks another action, and never resubmits', async () => {
  let id;
  let posts = 0;
  let queries = 0;
  const adapter = new Sts2Adapter({ token: 'test-secret', canAct: () => true, actionTtlMs: 20, pollIntervalMs: 1,
    fetchImpl: async (url, options) => {
      let body = envelope();
      if (options.method === 'POST') { posts++; id = JSON.parse(options.body).action_id; body = receiptEnvelope(id); }
      else if (new URL(url).searchParams.has('action_id')) { queries++; body = receiptEnvelope(id, { version: 2 }); }
      return { ok: true, json: async () => body };
    } });
  await adapter.observe();
  adapter.bind(identity);
  await assert.rejects(adapter.act({ action: 'end_turn' }), { code: 'ACTION_UNCERTAIN', pauseRequired: true });
  await assert.rejects(adapter.act({ action: 'end_turn' }), { code: 'ACTION_UNCERTAIN' });
  assert.equal(posts, 1);
  assert.ok(queries > 0);
});

test('abort before POST prevents submission; abort after POST requires reconciliation', async () => {
  const before = new AbortController();
  const initial = await bound([() => { before.abort(); return envelope(); }]);
  await assert.rejects(initial.adapter.act({ action: 'end_turn' }, { signal: before.signal }), { code: 'PAUSED' });
  assert.equal(initial.requests.filter(request => request.method === 'POST').length, 0);
  const after = new AbortController();
  const submitted = await bound([envelope(), request => {
    after.abort();
    return receiptEnvelope(request.payload.action_id);
  }]);
  await assert.rejects(submitted.adapter.act({ action: 'end_turn' }, { signal: after.signal }), { code: 'ACTION_UNCERTAIN', pauseRequired: true });
  assert.equal(submitted.requests.filter(request => request.method === 'POST').length, 1);
});

test('ready, dead, enemy turn, non-play, voted map, and unknown screens never become actionable', async () => {
  const ready = envelope(); ready.state.players[0].is_ready_to_end_turn = true;
  const dead = envelope(); dead.state.players[0].is_alive = false;
  const enemy = envelope(); enemy.state.battle.turn = 'enemy';
  const noPlay = envelope(); noPlay.state.battle.is_play_phase = false;
  const voted = envelope(); voted.state.state_type = 'map'; voted.state.map = { votes: [{ is_local: true, voted: true }] };
  const unknown = envelope(); unknown.state.state_type = 'card_select';
  for (const body of [ready, dead, enemy, noPlay, voted, unknown]) {
    const server = mockServer([body]);
    const adapter = new Sts2Adapter({ token: 'test-secret', canAct: () => true, fetchImpl: server.fetchImpl });
    assert.equal((await adapter.observe()).actionable, false);
    adapter.bind(identity);
    await assert.rejects(adapter.act({ action: 'end_turn' }), { code: 'NOT_ACTIONABLE' });
    assert.equal(server.requests.length, 1);
  }
});

test('only advertised actions are accepted; raw API actions and injected identity fields are rejected', async () => {
  const { adapter, requests } = await bound();
  await assert.rejects(adapter.act({ action: 'undo_end_turn' }), { code: 'ACTION_NOT_ALLOWED' });
  await assert.rejects(adapter.act({ action: 'end_turn', local_player_id: 'another' }), { code: 'INVALID_ACTION' });
  assert.equal(requests.length, 1);
  const server = mockServer([envelope(1, { allowed_actions: ['play_card'] })]);
  const limited = new Sts2Adapter({ token: 'test-secret', canAct: () => true, fetchImpl: server.fetchImpl });
  await limited.observe(); limited.bind(identity);
  await assert.rejects(limited.act({ action: 'end_turn' }), { code: 'ACTION_NOT_ALLOWED' });
});

test('map choices use the same bound identity and complete only after own vote evidence', async () => {
  const map = envelope();
  map.state.state_type = 'map';
  map.state.map = { votes: [{ is_local: true, voted: false }, { is_local: false, voted: true }],
    next_options: [{ index: 0 }, { index: 1 }] };
  const voted = structuredClone(map);
  voted.version = 2;
  voted.state.map.votes[0].voted = true;
  let id;
  const server = mockServer([map, map, request => {
    assert.equal(request.payload.action, 'choose_map_node');
    assert.equal(request.payload.index, 1);
    id = request.payload.action_id;
    return { ...map, receipt: receiptEnvelope(id).receipt, pending_action_id: id };
  }, () => ({ ...voted, receipt: receiptEnvelope(id, { version: 2, effect: true }).receipt }), voted]);
  const adapter = new Sts2Adapter({ token: 'test-secret', canAct: () => true, fetchImpl: server.fetchImpl, pollIntervalMs: 1 });
  assert.equal((await adapter.observe()).actionable, true);
  adapter.bind(identity);
  const result = await adapter.act({ action: 'choose_map_node', index: 1 });
  assert.equal(result.observation.phase, 'wait_for_player');
  assert.equal(result.observation.actionable, false);
});

test('guard manual screens without multiplayer metadata remain observable after binding', async () => {
  const { adapter } = await bound([envelope(2, { state: { state_type: 'manual_interaction' } })]);
  const observed = await adapter.observe();
  assert.equal(observed.phase, 'manual_interaction');
  assert.equal(observed.actionable, false);
  assert.deepEqual(adapter.binding, identity);
});

test('guard rejection is definitive and is never reported as an accepted effect', async () => {
  const { adapter, requests } = await bound([envelope(), request =>
    receiptEnvelope(request.payload.action_id, { status: 'rejected' })]);
  await assert.rejects(adapter.act({ action: 'end_turn' }), { code: 'ACTION_REJECTED', pauseRequired: false });
  assert.equal(adapter.pendingActionId, null);
  assert.equal(requests.filter(request => request.method === 'POST').length, 1);
});

test('transport errors never expose credentials, and non-loopback destinations are refused', async () => {
  const adapter = new Sts2Adapter({ token: 'test-secret', canAct: () => true,
    fetchImpl: async () => { throw new Error('Authorization Bearer test-secret'); } });
  await assert.rejects(adapter.observe(), error => {
    assert.equal(error.code, 'TRANSPORT_ERROR');
    assert.equal(JSON.stringify(error).includes('test-secret'), false);
    assert.equal(error.message.includes('test-secret'), false);
    return true;
  });
  assert.equal(JSON.stringify(adapter).includes('test-secret'), false);
  assert.throws(() => new Sts2Adapter({ baseUrl: 'http://example.com', token: 'test-secret', canAct: () => true }), /loopback/);
});

test('pending state is durably awaited before POST and cleared after effect readback', async () => {
  const saved = [];
  const storage = deferred();
  const storing = deferred();
  const { adapter, requests } = await bound([envelope(), request => {
    assert.equal(saved[0].pending.actionId, request.payload.action_id);
    return receiptEnvelope(request.payload.action_id, { version: 2, effect: true });
  }, envelope(2)], { onStateChange: async snapshot => {
    saved.push(snapshot);
    if (snapshot.pending) { storing.resolve(); await storage.promise; }
  } });
  const action = adapter.act({ action: 'end_turn' });
  await storing.promise;
  assert.equal(requests.filter(request => request.method === 'POST').length, 0);
  assert.deepEqual(saved[0].binding, identity);
  assert.ok(Number.isSafeInteger(saved[0].pending.deadline));
  storage.resolve();
  await action;
  assert.deepEqual(saved[1], { binding: identity, pending: null });
});

test('failed durable storage sends no POST, clears local pending, and requests pause', async () => {
  const { adapter, requests } = await bound([envelope()], { onStateChange: async () => {
    throw new Error('disk failure containing test-secret');
  } });
  await assert.rejects(adapter.act({ action: 'end_turn' }), error => {
    assert.equal(error.code, 'STORE_FAILED');
    assert.equal(error.pauseRequired, true);
    assert.equal(error.message.includes('test-secret'), false);
    return true;
  });
  assert.equal(adapter.pendingActionId, null);
  assert.equal(requests.filter(request => request.method === 'POST').length, 0);
});

test('pause during pending-state persistence is rechecked before POST', async () => {
  let allowed = true;
  const saved = [];
  const { adapter, requests } = await bound([envelope()], { canAct: () => allowed,
    onStateChange: async snapshot => { saved.push(snapshot); allowed = false; } });
  await assert.rejects(adapter.act({ action: 'end_turn' }), { code: 'PAUSED' });
  assert.equal(requests.filter(request => request.method === 'POST').length, 0);
  assert.equal(saved.length, 2);
  assert.equal(saved[1].pending, null);
});

test('restored pending action reconciles by ID without POST and requires explicit binding confirmation', async () => {
  const restored = { binding: identity, pending: { actionId: 'old-action', deadline: Date.now() - 100 } };
  const server = mockServer([request => {
    assert.equal(new URL(request.url).searchParams.get('action_id'), 'old-action');
    return receiptEnvelope('old-action', { version: 2, effect: true });
  }]);
  const saved = [];
  const adapter = new Sts2Adapter({ token: 'test-secret', canAct: () => true, fetchImpl: server.fetchImpl,
    restored, onStateChange: async snapshot => saved.push(snapshot) });
  assert.deepEqual(adapter.snapshot(), restored);
  await assert.rejects(adapter.act({ action: 'end_turn' }), { code: 'ACTION_UNCERTAIN' });
  const result = await adapter.reconcile();
  assert.equal(result.status, 'effect_observed');
  assert.equal(adapter.pendingActionId, null);
  await assert.rejects(adapter.act({ action: 'end_turn' }), { code: 'PAUSED' });
  adapter.bind(identity);
  assert.equal(server.requests.filter(request => request.method === 'POST').length, 0);
  assert.deepEqual(saved, [{ binding: identity, pending: null }]);
});

test('a new game process clears an old pending action but never silently rebinds', async () => {
  const restored = { binding: identity, pending: { actionId: 'old-action', deadline: Date.now() - 100 } };
  const nextIdentity = { ...identity, instance_id: 'instance-b', run_id: 'run-b' };
  const server = mockServer([envelope(1, nextIdentity)]);
  const adapter = new Sts2Adapter({ token: 'test-secret', canAct: () => true, fetchImpl: server.fetchImpl, restored });
  const result = await adapter.reconcile();
  assert.equal(result.status, 'previous-instance-ended');
  assert.deepEqual(adapter.snapshot(), { binding: null, pending: null });
  await assert.rejects(adapter.act({ action: 'end_turn' }), { code: 'PAUSED' });
  adapter.bind(nextIdentity);
  assert.deepEqual(adapter.binding, nextIdentity);
  assert.equal(server.requests.filter(request => request.method === 'POST').length, 0);
});

test('missing receipt in the same instance remains uncertain even after stored expiry', async () => {
  const restored = { binding: identity, pending: { actionId: 'old-action', deadline: Date.now() - 100 } };
  const server = mockServer([envelope()]);
  const adapter = new Sts2Adapter({ token: 'test-secret', canAct: () => false, fetchImpl: server.fetchImpl, restored });
  await assert.rejects(adapter.reconcile(), { code: 'ACTION_UNCERTAIN', pauseRequired: true, actionId: 'old-action' });
  assert.deepEqual(adapter.snapshot(), restored);
  assert.equal(server.requests.filter(request => request.method === 'POST').length, 0);
});

test('restored snapshots validate identities and pending deadlines', () => {
  for (const restored of [{}, { binding: identity, pending: { actionId: 'a', deadline: 'tomorrow' } },
    { binding: null, pending: { actionId: 'a', deadline: 1 } }, { binding: { ...identity, run_id: 4 }, pending: null }]) {
    assert.throws(() => new Sts2Adapter({ token: 'test-secret', canAct: () => false, restored }), /snapshot/);
  }
});

test('reconciliation without pending work returns new identities and requires explicit rebind', async () => {
  for (const field of ['instance_id', 'run_id', 'local_player_id']) {
    const nextIdentity = { ...identity, [field]: 'changed' };
    const saved = [];
    const { adapter, requests } = await bound([envelope(2, nextIdentity), envelope(2, nextIdentity), envelope(2, nextIdentity)],
      { onStateChange: async snapshot => saved.push(snapshot) });
    await assert.rejects(adapter.observe(), { code: 'BINDING_CHANGED' });
    const result = await adapter.reconcile();
    assert.equal(result.status, 'binding-changed');
    assert.equal(result.requiresBinding, true);
    assert.equal(result.observation.guard[field], 'changed');
    assert.deepEqual(adapter.snapshot(), { binding: null, pending: null });
    assert.deepEqual(saved, [{ binding: null, pending: null }]);
    await assert.rejects(adapter.act({ action: 'end_turn' }), { code: 'PAUSED' });
    const repeated = await adapter.reconcile();
    assert.equal(repeated.status, 'observed');
    assert.equal(repeated.requiresBinding, true);
    adapter.bind(nextIdentity);
    assert.deepEqual(adapter.binding, nextIdentity);
    assert.equal(requests.filter(request => request.method === 'POST').length, 0);
  }
});

test('no-pending reconciliation preserves an unchanged binding and does not reset restored confirmation', async () => {
  const { adapter } = await bound([envelope()]);
  const current = await adapter.reconcile();
  assert.equal(current.status, 'observed');
  assert.equal(current.requiresBinding, false);
  assert.deepEqual(adapter.binding, identity);
  const server = mockServer([envelope()]);
  const restored = new Sts2Adapter({ token: 'test-secret', canAct: () => true, fetchImpl: server.fetchImpl,
    restored: { binding: identity, pending: null } });
  assert.equal((await restored.reconcile()).requiresBinding, true);
  await assert.rejects(restored.act({ action: 'end_turn' }), { code: 'PAUSED' });
});

test('same-instance cross-run or cross-player receipts cannot clear restored pending work', async () => {
  for (const field of ['run_id', 'local_player_id']) {
    const restored = { binding: identity, pending: { actionId: 'old-action', deadline: Date.now() - 100 } };
    const body = { ...receiptEnvelope('old-action', { effect: true }), [field]: 'changed' };
    const server = mockServer([body]);
    const adapter = new Sts2Adapter({ token: 'test-secret', canAct: () => false, fetchImpl: server.fetchImpl, restored });
    await assert.rejects(adapter.reconcile(), { code: 'BINDING_CHANGED', pauseRequired: true });
    assert.deepEqual(adapter.snapshot(), restored);
    assert.throws(() => adapter.bind({ ...identity, [field]: 'changed' }), { code: 'ACTION_UNCERTAIN' });
    assert.equal(server.requests.filter(request => request.method === 'POST').length, 0);
  }
});

test('reconciliation locks out action submission until the identity check completes', async () => {
  const read = deferred();
  const { adapter, requests } = await bound([() => read.promise]);
  const reconciliation = adapter.reconcile();
  await assert.rejects(adapter.act({ action: 'end_turn' }), { code: 'BUSY' });
  assert.throws(() => adapter.bind(identity), { code: 'BUSY' });
  read.resolve(envelope());
  await reconciliation;
  assert.equal(requests.filter(request => request.method === 'POST').length, 0);
});

test('map transitions and incomplete or ambiguous local metadata never become actionable', async () => {
  const cases = [];
  for (const map of [
    { votes: [{ is_local: true, voted: false }], next_options: [] },
    { votes: [{ is_local: true, voted: false }] },
    { votes: [{ is_local: true, voted: false }, { is_local: true, voted: true }], next_options: [{ index: 0 }] },
    { votes: {}, next_options: [{ index: 0 }] },
  ]) {
    const body = envelope();
    body.state.state_type = 'map';
    body.state.map = map;
    cases.push(body);
  }
  const everyoneReady = envelope();
  everyoneReady.state.battle.all_players_ready = true;
  cases.push(everyoneReady);
  const unknownLocal = envelope();
  unknownLocal.state.players[0] = null;
  cases.push(unknownLocal);
  for (const body of cases) {
    const server = mockServer([body]);
    const adapter = new Sts2Adapter({ token: 'test-secret', canAct: () => true, fetchImpl: server.fetchImpl });
    assert.equal((await adapter.observe()).actionable, false);
  }
});

function screen(type, contents) {
  const state = structuredClone(envelope().state);
  state.state_type = type;
  delete state.battle;
  state[type] = contents;
  return state;
}

function mapScreen(voted = false) {
  return screen('map', { votes: [{ is_local: true, voted }, { is_local: false, voted: false }],
    next_options: [{ index: 0 }, { index: 1 }] });
}

async function runFlow(states, commands) {
  let position = 0;
  let pendingId = null;
  const submitted = [];
  const adapter = new Sts2Adapter({ token: 'test-secret', canAct: () => true, pollIntervalMs: 1,
    fetchImpl: async (url, options) => {
      assert.equal(new URL(url).pathname, '/api/v1/companion');
      let result;
      if (options.method === 'POST') {
        const body = JSON.parse(options.body);
        assert.equal(body.version, position + 1);
        assert.equal(pendingId, null);
        for (const [key, value] of Object.entries(commands[position])) assert.equal(body[key], value);
        submitted.push(body);
        pendingId = body.action_id;
        result = receiptEnvelope(pendingId, { version: position + 1 });
      } else if (new URL(url).searchParams.has('action_id')) {
        assert.equal(new URL(url).searchParams.get('action_id'), pendingId);
        position++;
        result = receiptEnvelope(pendingId, { version: position + 1, effect: true });
        pendingId = null;
      } else result = envelope(position + 1);
      result.state = states[position];
      return { ok: true, status: 200, json: async () => structuredClone(result) };
    } });
  await adapter.observe();
  adapter.bind(identity);
  for (const command of commands) {
    assert.ok(adapter.latest.availableActions.includes(command.action), `${command.action} is available on ${adapter.latest.phase}`);
    const result = await adapter.act(command, { expectedVersionKey: adapter.latest.versionKey });
    assert.equal(result.status, 'effect_observed');
  }
  assert.equal(submitted.length, commands.length);
  return adapter;
}

test('reward claim, card choice, remaining rewards, proceed, and map vote form a guarded flow', async () => {
  const adapter = await runFlow([
    screen('rewards', { items: [{ index: 0, type: 'card' }, { index: 1, type: 'gold' }], can_proceed: true }),
    screen('card_reward', { cards: [{ index: 0 }, { index: 1 }], can_skip: true }),
    screen('rewards', { items: [{ index: 0, type: 'gold' }], can_proceed: true }),
    screen('rewards', { items: [], can_proceed: true }), mapScreen(), mapScreen(true),
  ], [{ action: 'claim_reward', index: 0 }, { action: 'select_card_reward', card_index: 1 },
    { action: 'claim_reward', index: 0 }, { action: 'proceed' }, { action: 'choose_map_node', index: 0 }]);
  assert.equal(adapter.latest.actionable, false);
  assert.equal(adapter.latest.phase, 'wait_for_player');
});

test('ancient dialogue and individual event selection advance through local card preview', async () => {
  const event = options => screen('event', { is_shared: false, in_dialogue: false, options });
  const choice = { index: 0, is_locked: false, was_chosen: false };
  const adapter = await runFlow([
    screen('event', { is_shared: false, in_dialogue: true, dialogue_line: 0, options: [] }),
    event([choice]),
    screen('card_select', { cards: [{ index: 0 }, { index: 1 }], selected_indices: [], preview_showing: false, can_confirm: false, can_cancel: true }),
    screen('card_select', { cards: [{ index: 0 }, { index: 1 }], selected_indices: [1], preview_showing: true, can_confirm: true, can_cancel: true }),
    event([{ ...choice, is_proceed: true }]), mapScreen(),
  ], [{ action: 'advance_dialogue' }, { action: 'choose_event_option', index: 0 },
    { action: 'select_card', index: 1 }, { action: 'confirm_selection' }, { action: 'choose_event_option', index: 0 }]);
  assert.equal(adapter.latest.phase, 'map');
});

test('rest upgrade selection returns to rest then proceeds to map', async () => {
  const adapter = await runFlow([
    screen('rest_site', { options: [{ index: 0, is_enabled: true }], can_proceed: false }),
    screen('card_select', { cards: [{ index: 0 }], preview_showing: false, can_confirm: false, can_cancel: true }),
    screen('card_select', { cards: [{ index: 0 }], preview_showing: true, can_confirm: true, can_cancel: true }),
    screen('rest_site', { options: [{ index: 0, is_enabled: false }], can_proceed: true }), mapScreen(),
  ], [{ action: 'choose_rest_option', index: 0 }, { action: 'select_card', index: 0 },
    { action: 'confirm_selection' }, { action: 'proceed' }]);
  assert.equal(adapter.latest.phase, 'map');
});

test('shop open, purchase, close, and proceed honor explicit inventory visibility', async () => {
  for (const type of ['shop', 'fake_merchant']) {
    const shop = (open, stocked = true) => {
      const data = { items: [{ index: 0, is_stocked: stocked, can_afford: true }], can_proceed: !open };
      return screen(type, type === 'shop' ? { ...data, inventory_open: open }
        : { inventory_open: open, started_fight: false, shop: data });
    };
    const adapter = await runFlow([shop(false), shop(true), shop(true, false), shop(false, false), mapScreen()],
      [{ action: 'open_shop' }, { action: 'shop_purchase', index: 0 }, { action: 'close_shop' }, { action: 'proceed' }]);
    assert.equal(adapter.latest.phase, 'map');
  }
});

test('treasure opens explicitly and stops after the local relic vote', async () => {
  const treasure = voted => screen('treasure', { can_open_chest: false, is_bidding_phase: true,
    relics: [{ index: 0 }], bids: [{ is_local: true, voted }, { is_local: false, voted: false }], can_proceed: false });
  const adapter = await runFlow([
    screen('treasure', { can_open_chest: true, is_bidding_phase: true, relics: [{ index: 0 }] }),
    treasure(false), treasure(true),
  ], [{ action: 'open_treasure' }, { action: 'claim_treasure_relic', index: 0 }]);
  assert.equal(adapter.latest.actionable, false);
  assert.equal(adapter.latest.phase, 'wait_for_player');
});

test('all twenty globally allowed actions remain restricted to their actual screens', async () => {
  const server = mockServer([envelope()]);
  const adapter = new Sts2Adapter({ token: 'test-secret', canAct: () => true, fetchImpl: server.fetchImpl });
  const observed = await adapter.observe();
  adapter.bind(identity);
  assert.equal(observed.guard.allowed_actions.length, 20);
  assert.deepEqual(observed.availableActions, ['play_card', 'end_turn', 'use_potion', 'discard_potion']);
  for (const action of ['claim_reward', 'proceed', 'open_shop', 'advance_dialogue', 'claim_treasure_relic']) {
    await assert.rejects(adapter.act({ action, index: 0 }), { code: 'NOT_ACTIONABLE' });
  }
  const limitedServer = mockServer([envelope(1, { allowed_actions: ['claim_reward', 'proceed'] })]);
  const limited = new Sts2Adapter({ token: 'test-secret', canAct: () => true, fetchImpl: limitedServer.fetchImpl });
  assert.equal((await limited.observe()).actionable, false);
});

test('shared events wait after voting; dialogue, chosen options, and locked options are not interchanged', async () => {
  const baseEvent = { is_shared: true, in_dialogue: false,
    votes: [{ is_local: true, voted: false }], options: [
      { index: 0, is_locked: false, was_chosen: false },
      { index: 1, is_locked: true, was_chosen: false },
      { index: 2, is_locked: false, was_chosen: true },
    ] };
  const server = mockServer([envelope(1, { state: screen('event', baseEvent) })]);
  const adapter = new Sts2Adapter({ token: 'test-secret', canAct: () => true, fetchImpl: server.fetchImpl });
  await adapter.observe(); adapter.bind(identity);
  await assert.rejects(adapter.act({ action: 'choose_event_option', index: 1 }), { code: 'INVALID_ACTION' });
  await assert.rejects(adapter.act({ action: 'choose_event_option', index: 2 }), { code: 'INVALID_ACTION' });
  await assert.rejects(adapter.act({ action: 'proceed' }), { code: 'NOT_ACTIONABLE' });
  await assert.rejects(adapter.act({ action: 'advance_dialogue' }), { code: 'NOT_ACTIONABLE' });
  const voted = { ...baseEvent, votes: [{ is_local: true, voted: true }] };
  const flow = await runFlow([screen('event', baseEvent), screen('event', voted)], [{ action: 'choose_event_option', index: 0 }]);
  assert.equal(flow.latest.phase, 'wait_for_player');
});

test('selection preview restricts choices to advertised confirm and cancel controls', async () => {
  const selection = screen('card_select', { cards: [{ index: 0 }], preview_showing: true, can_confirm: true, can_cancel: true });
  const server = mockServer([envelope(1, { state: selection })]);
  const adapter = new Sts2Adapter({ token: 'test-secret', canAct: () => true, fetchImpl: server.fetchImpl });
  assert.deepEqual((await adapter.observe()).availableActions, ['confirm_selection', 'cancel_selection']);
  adapter.bind(identity);
  await assert.rejects(adapter.act({ action: 'select_card', index: 0 }), { code: 'NOT_ACTIONABLE' });
  const returned = await runFlow([selection,
    screen('card_select', { cards: [{ index: 0 }], preview_showing: false, can_confirm: false, can_cancel: true })],
  [{ action: 'cancel_selection' }]);
  assert.ok(returned.latest.availableActions.includes('select_card'));
});

test('reward skip and empty treasure proceed use their advertised controls', async () => {
  await runFlow([screen('card_reward', { cards: [{ index: 0 }], can_skip: true }),
    screen('rewards', { items: [], can_proceed: true })], [{ action: 'skip_card_reward' }]);
  await runFlow([screen('treasure', { can_open_chest: false, is_bidding_phase: false, can_proceed: true }),
    mapScreen()], [{ action: 'proceed' }]);
});

test('disabled and unavailable flow choices are rejected without a POST', async () => {
  const cases = [
    [screen('rest_site', { options: [{ index: 0, is_enabled: true }, { index: 1, is_enabled: false }], can_proceed: true }), { action: 'choose_rest_option', index: 1 }, 'INVALID_ACTION'],
    [screen('shop', { inventory_open: false, items: [{ index: 0, is_stocked: true, can_afford: true }], can_proceed: true }), { action: 'shop_purchase', index: 0 }, 'NOT_ACTIONABLE'],
    [screen('shop', { inventory_open: true, items: [{ index: 0, is_stocked: true, can_afford: true }, { index: 1, is_stocked: true, can_afford: false }] }), { action: 'shop_purchase', index: 1 }, 'INVALID_ACTION'],
    [screen('shop', { inventory_open: true, items: [], can_proceed: true }), { action: 'proceed' }, 'NOT_ACTIONABLE'],
    [screen('card_reward', { cards: [{ index: 0 }], can_skip: false }), { action: 'skip_card_reward' }, 'NOT_ACTIONABLE'],
    [screen('rewards', { items: [{ index: 0 }], can_proceed: false }), { action: 'claim_reward', index: 3 }, 'INVALID_ACTION'],
  ];
  for (const [state, command, code] of cases) {
    const server = mockServer([envelope(1, { state })]);
    const adapter = new Sts2Adapter({ token: 'test-secret', canAct: () => true, fetchImpl: server.fetchImpl });
    await adapter.observe(); adapter.bind(identity);
    await assert.rejects(adapter.act(command), { code });
    assert.equal(server.requests.length, 1);
  }
});

test('reward potion slots can be freed explicitly without opening other combat actions', async () => {
  const before = screen('rewards', { items: [{ index: 0, type: 'potion' }], can_proceed: true });
  before.player = { potions: [{ slot: 1, id: 'potion-a' }] };
  const after = structuredClone(before); after.player.potions = [];
  const server = mockServer([envelope(1, { state: before })]);
  const check = new Sts2Adapter({ token: 'test-secret', canAct: () => true, fetchImpl: server.fetchImpl });
  const seen = await check.observe(); check.bind(identity);
  assert.ok(seen.availableActions.includes('discard_potion'));
  assert.equal(seen.availableActions.includes('use_potion'), false);
  await assert.rejects(check.act({ action: 'discard_potion', slot: 0 }), { code: 'INVALID_ACTION' });
  const adapter = await runFlow([before, after], [{ action: 'discard_potion', slot: 1 }]);
  assert.equal(adapter.latest.availableActions.includes('discard_potion'), false);
});

test('pending receipt or reconciliation blocks all expanded flow actions', async () => {
  for (const blocker of [{ pending_action_id: 'pending' }, { requires_reconciliation: true }]) {
    const server = mockServer([envelope(1, { state: screen('rewards', { items: [{ index: 0 }], can_proceed: true }), ...blocker })]);
    const adapter = new Sts2Adapter({ token: 'test-secret', canAct: () => true, fetchImpl: server.fetchImpl });
    const seen = await adapter.observe();
    assert.equal(seen.actionable, false);
    assert.deepEqual(seen.availableActions, []);
    adapter.bind(identity);
    await assert.rejects(adapter.act({ action: 'claim_reward', index: 0 }), { code: 'NOT_ACTIONABLE' });
  }
});

test('disabled event buttons and card animation locks suppress decisions until their state changes', async () => {
  const cases = [
    ['event', { is_shared: false, in_dialogue: false, options: [
      { index: 0, is_locked: false, was_chosen: false, is_enabled: false },
    ] }, 'options', 'is_enabled', 'choose_event_option'],
    ['card_reward', { cards: [{ index: 0, can_select: false }], can_skip: false }, 'cards', 'can_select', 'select_card_reward'],
    ['card_select', { cards: [{ index: 0, can_select: false }], preview_showing: false, can_confirm: false, can_cancel: false },
      'cards', 'can_select', 'select_card'],
  ];
  for (const [type, contents, list, flag, action] of cases) {
    const enabled = structuredClone(contents);
    enabled[list][0][flag] = true;
    const server = mockServer([envelope(1, { state: screen(type, contents) }), envelope(2, { state: screen(type, enabled) })]);
    const adapter = new Sts2Adapter({ token: 'test-secret', canAct: () => true, fetchImpl: server.fetchImpl });
    const locked = await adapter.observe();
    assert.equal(locked.actionable, false);
    assert.deepEqual(locked.availableActions, []);
    adapter.bind(identity);
    const command = action === 'select_card_reward' ? { action, card_index: 0 } : { action, index: 0 };
    await assert.rejects(adapter.act(command), { code: 'NOT_ACTIONABLE' });
    const unlocked = await adapter.observe();
    assert.equal(unlocked.actionable, true);
    assert.deepEqual(unlocked.availableActions, [action]);
    assert.notEqual(unlocked.versionKey, locked.versionKey);
    assert.equal(server.requests.filter(request => request.method === 'POST').length, 0);
  }
});

test('disabled choice indices cannot be submitted when other choices on the same screen are clickable', async () => {
  const cases = [
    [screen('event', { is_shared: false, in_dialogue: false, options: [
      { index: 0, is_locked: false, was_chosen: false, is_enabled: false },
      { index: 1, is_locked: false, was_chosen: false, is_enabled: true },
    ] }), { action: 'choose_event_option', index: 0 }],
    [screen('card_reward', { cards: [{ index: 0, can_select: false }, { index: 1, can_select: true }], can_skip: false }),
      { action: 'select_card_reward', card_index: 0 }],
    [screen('card_select', { cards: [{ index: 0, can_select: false }, { index: 1, can_select: true }],
      preview_showing: false, can_confirm: false, can_cancel: false }), { action: 'select_card', index: 0 }],
  ];
  for (const [state, command] of cases) {
    const server = mockServer([envelope(1, { state })]);
    const adapter = new Sts2Adapter({ token: 'test-secret', canAct: () => true, fetchImpl: server.fetchImpl });
    assert.equal((await adapter.observe()).actionable, true);
    adapter.bind(identity);
    await assert.rejects(adapter.act(command), { code: 'INVALID_ACTION' });
    assert.equal(server.requests.length, 1);
  }
});
