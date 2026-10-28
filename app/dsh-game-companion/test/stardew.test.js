import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StardewAdapter } from '../src/stardew.js';
import { CompanionScheduler } from '../src/scheduler.js';

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'whale-farm-'));
  const configFile = join(dir, 'config.json');
  await writeFile(configFile, JSON.stringify({ Port: 27431, Token: 'test-secret' }));
  const f = { allowed: false, now: 10000, sent: [], save: { loaded: true, isHost: true, uniqueId: 'farm1' },
    raw: { paused: true, health: 100, time: 600, day: 1, location: 'Farm', farm: { dryCrops: 3 }, host: {} } };
  class Socket extends EventTarget {
    constructor() { super(); f.socket = this; this.readyState = 0; queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event('open')); }); }
    message(message) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) })); }
    send(frame) {
      const m = JSON.parse(frame); f.sent.push(m);
      queueMicrotask(() => {
        if (m.t === 'cmd') return;
        if (m.t === 'pause') {
          f.raw.paused = m.paused;
          if (m.paused && f.adapter.pending) this.message({ t: 'result', id: f.adapter.pending.id, ok: false, detail: 'paused by the player' });
        }
        if (m.t === 'cancel' && f.adapter.pending) this.message({ t: 'result', id: f.adapter.pending.id, ok: false, detail: 'aborted' });
        this.message({ t: 'result', id: m.id, ok: true,
          ...(m.t === 'ping' ? { save: f.save } : {}), ...(m.t === 'observe' ? { obs: structuredClone(f.raw) } : {}) });
      });
    }
    close() { this.readyState = 3; this.dispatchEvent(new Event('close')); }
  }
  f.adapter = new StardewAdapter({ configFile, canAct: () => f.allowed, now: () => f.now, WebSocketImpl: Socket,
    fetchImpl: async () => ({ ok: true, json: async () => ({ mod: 'SeiCompanion', protocol: 1, save: f.save }) }) });
  t.after(async () => { await f.adapter.dispose(); await rm(dir, { recursive: true, force: true }); });
  f.start = async () => {
    const initial = await f.adapter.observe();
    await f.adapter.bind(initial.guard);
    f.allowed = true; await f.adapter.setPaused(false);
    return f.adapter.observe();
  };
  return f;
}

test('farm observation never spawns or acts until explicit binding and resume', async t => {
  const f = await fixture(t), o = await f.adapter.observe();
  assert.equal(o.actionable, false);
  assert.deepEqual(f.sent.map(m => m.t), ['ping']);
  await assert.rejects(f.adapter.act({ action: 'water' }, { expectedVersionKey: o.versionKey }), /CONTROLS_PAUSED/);
  await assert.rejects(f.adapter.bind({ ...o.guard, run_id: 'different' }), /BINDING_MISMATCH/);
});

test('watering returns immediately, reports completion later, and rejects parallel commands', async t => {
  const f = await fixture(t), o = await f.start();
  const result = await f.adapter.act({ action: 'water', args: { count: 3, scope: 'farm' } }, { expectedVersionKey: o.versionKey });
  assert.equal(result.status, 'submitted'); assert.equal(result.observation.actionable, false);
  assert.ok(f.adapter.pendingActionId);
  await assert.rejects(f.adapter.act({ action: 'follow' }, { expectedVersionKey: o.versionKey }), /BUSY/);
  f.socket.message({ t: 'result', id: result.actionId, ok: true, detail: 'watered 3 crops' });
  const after = await f.adapter.observe();
  assert.equal(after.actionable, true); assert.equal(after.state.lastResult.detail, 'watered 3 crops');
  assert.notEqual(after.versionKey, result.observation.versionKey);
});

test('pause aborts real work and forbids later submissions', async t => {
  const f = await fixture(t), o = await f.start();
  await f.adapter.act({ action: 'water' }, { expectedVersionKey: o.versionKey });
  assert.equal(f.sent.find(m => m.t === 'cmd').args.count, 5);
  f.allowed = false; await f.adapter.setPaused(true);
  assert.equal(f.adapter.pending, null); assert.equal(f.adapter.lastResult.ok, false);
  await assert.rejects(f.adapter.act({ action: 'follow' }, { expectedVersionKey: o.versionKey }), /CONTROLS_PAUSED/);
});

test('a job is never submitted when saving its dispatch intent fails', async t => {
  const f = await fixture(t), o = await f.start();
  f.adapter.onStateChange = async () => { throw Error('disk full'); };
  await assert.rejects(f.adapter.act({ action: 'water' }, { expectedVersionKey: o.versionKey }), /disk full/);
  assert.equal(f.sent.filter(m => m.t === 'cmd').length, 0);
  assert.equal(f.adapter.pending, null);
});

test('save identity change freezes the companion and clears binding', async t => {
  const f = await fixture(t); await f.start();
  f.save = { ...f.save, uniqueId: 'another-farm' };
  await assert.rejects(f.adapter.observe(), /BINDING_CHANGED/);
  assert.equal(f.adapter.binding, null);
  assert.ok(f.sent.some(m => m.t === 'pause' && m.paused));
});

test('disconnect does not replay pending commands and requires binding again', async t => {
  const f = await fixture(t), o = await f.start();
  await f.adapter.act({ action: 'harvest' }, { expectedVersionKey: o.versionKey });
  f.socket.close(); f.allowed = false;
  const r = await f.adapter.reconcile();
  assert.equal(r.requiresBinding, true); assert.equal(f.adapter.lastResult.error, 'DISCONNECTED');
  assert.equal(f.sent.filter(m => m.t === 'cmd').length, 1);
});

test('walking frames do not wake the model; farm changes coalesce to eight seconds', async t => {
  const f = await fixture(t), initial = await f.start();
  f.raw.x = 10; f.raw.time = 610;
  f.socket.message({ t: 'obs', obs: structuredClone(f.raw) });
  assert.equal((await f.adapter.observe()).versionKey, initial.versionKey);
  f.raw.farm.dryCrops = 2; f.now += 1000;
  f.socket.message({ t: 'obs', obs: structuredClone(f.raw) });
  assert.equal((await f.adapter.observe()).versionKey, initial.versionKey);
  f.now += 8000;
  assert.notEqual((await f.adapter.observe()).versionKey, initial.versionKey);
});

test('stale observations and developer commands cannot execute', async t => {
  const f = await fixture(t); await f.start();
  await assert.rejects(f.adapter.act({ action: 'water' }, { expectedVersionKey: 'stale' }), /STALE_OBSERVATION/);
  await assert.rejects(f.adapter.act({ action: 'newFarm' }, {}), /UNSUPPORTED/);
  assert.equal(f.sent.filter(m => m.t === 'cmd').length, 0);
});

test('scheduler accepts chat while a long farm command remains in flight', async t => {
  const f = await fixture(t), o = await f.start(), turns = [];
  const scheduler = new CompanionScheduler({ driver: { followup: async request => {
    turns.push(request.kind); request.markDispatched();
    if (request.kind === 'game') {
      const result = await f.adapter.act({ action: 'water' }, { expectedVersionKey: request.observation.versionKey });
      scheduler.observe(result.observation, { source: 'action-result' });
    }
  }, cancel: async () => {} } });
  scheduler.reconcile(o); scheduler.resume(); await scheduler.whenIdle();
  assert.ok(f.adapter.pendingActionId);
  scheduler.chat('一边浇水一边聊会儿吧'); await scheduler.whenIdle();
  assert.deepEqual(turns, ['game', 'chat']); assert.ok(f.adapter.pendingActionId);
  await scheduler.close();
});
