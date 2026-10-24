import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CompanionHost } from '../src/index.js';
import { AmbientCompanion } from '../src/ambient.js';

test('desktop activity uses a chat-only prompt, guarded voice line and preserves game/personal state', async t => {
  const gate = deferred();
  t.after(() => gate.resolve());
  const f = await fixture(t);
  let time = Date.now();
  f.host.ambient = new AmbientCompanion({}, { now: () => time, random: () => 0 });
  f.host.ambient.nextAt = time;
  f.host.ambient.lastUserAt = time - 60000;
  f.agent.whenIdle = () => gate.promise;
  const budget = f.host.budget.snapshot();
  for (let i = 0; i < 6; i++) {
    await f.host.control({ action: 'ambient-sample', sample: { available: true, app: 'code', idleMs: 0, title: 'PRIVATE CONTENT' } });
    time += 10000;
  }
  for (let i = 0; i < 100 && !f.calls.some(([kind]) => kind === 'followup'); i++) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  const sent = f.calls.find(([kind]) => kind === 'followup');
  assert.ok(sent);
  const prompt = JSON.parse(sent[1].content[0].text);
  assert.equal(prompt.event, 'ambient'); assert.equal(prompt.mode, 'chat');
  assert.equal(prompt.actions_allowed, false); assert.equal(prompt.observation, null);
  assert.equal(prompt.environment.application, '代码编辑器');
  assert.equal(JSON.stringify(prompt).includes('PRIVATE CONTENT'), false);
  assert.equal(f.host.chatOnlyTurn, true);
  assert.ok(f.guards[0]({ name: 'game_observe' }));
  assert.equal(f.guards[0]({ name: 'companion_say' }), undefined);
  assert.equal((await f.requestConfig({})).reasoningEffort, 'low');
  await f.registered.get('companion_say').execute({ text: '还在认真敲代码呀？本鲸坐这儿陪你一会儿。', emotion: 'listening_nod', spoken: true }, {});
  assert.equal(f.host.messages.at(-1).ambient, true);
  assert.equal(f.host.messages.at(-1).spoken, true);
  const length = f.host.messages.length;
  const repeated = JSON.parse(await f.registered.get('companion_say').execute({ text: '不要再说一次。', spoken: true }, {}));
  assert.equal(repeated.delivered, false); assert.equal(f.host.messages.length, length);
  const changed = f.host.control({ action: 'ambient-sample', sample: { available: true, app: 'browser', idleMs: 0 } });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(f.host.scheduler.active.canceled);
  assert.ok(f.guards[0]({ name: 'companion_say' }));
  gate.resolve(); await changed; await f.host.scheduler.whenIdle();
  assert.equal(f.runtime.requests.includes('POST'), false);
  assert.deepEqual(f.host.budget.snapshot(), budget);
  assert.equal(f.host.personalMemory.entries.length, 0);
  assert.equal(f.host.chatDelivery.length, 0);
  await f.host.control({ action: 'ambient-settings', enabled: false });
  assert.equal(f.host.status().ambient.enabled, false);
  assert.equal(JSON.parse(await readFile(f.stateFile, 'utf8')).ambient.enabled, false);
});

test('vision capture requires an expiring single-use ticket; context changes cancel it without game actions',async t=>{
  const f=await fixture(t);let time=Date.now();
  f.host.ambient=new AmbientCompanion({visionOptIn:true}, {now:()=>time,random:()=>0});
  f.host.ambient.nextAt=time;f.host.ambient.lastUserAt=time-60000;
  let result;
  for(let i=0;i<6;i++){
    result=await f.host.desktopSample({available:true,app:'browser',idleMs:0,contextKey:1,captureSupported:true});
    time+=10000;
  }
  assert.ok(result.capture?.ticket);assert.equal(f.calls.some(([kind])=>kind==='followup'),false);
  assert.deepEqual(await f.host.desktopFrame({ticket:'foreign',jpeg:'bad'}),{accepted:false});
  await f.host.desktopSample({available:true,app:'browser',idleMs:0,contextKey:2,captureSupported:true});
  assert.deepEqual(await f.host.desktopFrame({ticket:result.capture.ticket,unavailable:true}),{accepted:false});
  assert.equal(f.host.pendingVision,null);assert.equal(f.runtime.requests.includes('POST'),false);
  await f.host.control({action:'ambient-settings',minMinutes:2,maxMinutes:5,visionEnabled:false});
  assert.equal(f.host.status().ambient.minMinutes,2);assert.equal(f.host.status().ambient.visionEnabled,false);
  const stored=JSON.parse(await readFile(f.stateFile,'utf8'));
  assert.equal(stored.ambient.maxMinutes,5);assert.equal(JSON.stringify(stored).includes('base64'),false);
});

test('vision cancellation aborts pending work immediately without changing saved settings, even while switching chats',async t=>{
  const f=await fixture(t),settings=f.host.ambient.save();
  for(const changing of [false,true]){
    const controller=new AbortController();
    f.host.pendingVision={ticket:'pending-frame',controller,processing:true};
    f.host.changingConversation=changing;
    try{
      const canceled=f.host.control({action:'vision-cancel'});
      assert.equal(controller.signal.aborted,true);
      assert.equal(f.host.pendingVision,null);
      const status=await canceled;
      assert.equal(status.ambient.visionEnabled,settings.visionOptIn);
      assert.deepEqual(f.host.ambient.save(),settings);
    }finally{f.host.changingConversation=false;}
  }
  assert.equal(f.runtime.requests.includes('POST'),false);
});

const identity = { instance_id: 'test-instance', run_id: 'test-run', local_player_id: 'whale' };
test('chat animation travels from prompt/tool to saved message without changing voice emotion', async t=>{
  const f=await fixture(t);
  await f.host.ensureAgent();
  const request={kind:'chat',messages:[{content:'你会不会开车'}]};
  f.host.replyRequest=request;
  const prompt=JSON.parse(f.host.prompt(request).content[0].text);
  assert.equal(prompt.animation.candidates[0].id,'companion/racing_turn');
  await f.registered.get('companion_say').execute({text:'方向盘给我，带你慢慢兜一圈。',emotion:'happy_hop',animation:'companion/racing_turn',spoken:true},{});
  const reply=f.host.messages.at(-1);
  assert.equal(reply.animation,'companion/racing_turn');assert.equal(reply.emotion,'happy_hop');assert.equal(reply.spoken,true);
  await f.host.save();
  assert.equal(JSON.parse(await readFile(f.stateFile,'utf8')).messages.at(-1).animation,'companion/racing_turn');
  assert.equal(f.runtime.requests.includes('POST'),false);
});
function observation(version = 1) {
  return { ...identity, version, allowed_actions: ['end_turn'], receipts: [],
    state: { state_type: 'monster', game_mode: 'multiplayer', player_count: 2,
      local_player_slot: 1, players: [{ is_local: false, is_alive: true },
        { is_local: true, is_alive: true, is_ready_to_end_turn: false }],
      battle: { turn: 'player', is_play_phase: true } } };
}
function deferred() {
  let resolve;
  return { promise: new Promise(done => { resolve = done; }), resolve: value => resolve(value) };
}

async function fixture(t, { saved, createGate, events = [], consume = true, onCreate } = {}) {
  const root = new URL('../.test-data/', import.meta.url);
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(fileURLToPath(root), 'host-'));
  const stateFile = join(directory, 'state.json');
  await writeFile(join(directory, 'bridge-token.txt'), 'test-token');
  await writeFile(join(directory, 'persona.yml'), '                【人设补充：蓝色大肥鱼】\n                本鲸陪你合作。\n');
  if (saved) await writeFile(stateFile, JSON.stringify(saved));
  const runtime = { state: observation(), requests: [], persistedAtPost: null, responseGate: null };
  const server = createServer(async (req, res) => {
    try {
      assert.equal(req.headers.authorization, 'Bearer test-token');
      runtime.requests.push(req.method);
      if (req.method === 'POST') {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const payload = JSON.parse(Buffer.concat(chunks));
        runtime.persistedAtPost = JSON.parse(await readFile(stateFile, 'utf8'));
        runtime.state = observation(2);
        runtime.state.receipts = [{ action_id: payload.action_id, status: 'accepted', effect_observed: true }];
      }
      if (runtime.responseGate) await runtime.responseGate.promise;
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(runtime.state));
    } catch (error) { res.writeHead(500); res.end(error.message); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const calls = [], registered = new Map(), guards = [], sections = [];
  const listeners = new Map();
  const globalListeners = new Map();
  const stream = (options, next) => globalListeners.get('llm/stream')?.(options, next) ?? next();
  let session = { events: structuredClone(events) };
  const sessions = new Map();
  function emit(event) {
    event = { seq: session.events.length, ...event };
    session.events.push(event);
    listeners.get('session/event')?.(session, event);
  }
  function pending(target) {
    let queue = [];
    for (const event of session.events) {
      if (event.type === 'agent/inbox/spliced' && event.data.target === target) {
        const { start, removedCount = 0, inserted } = event.data;
        queue = queue.toSpliced(start, removedCount, ...inserted);
      }
    }
    return queue;
  }
  function send(method, message) {
    calls.push([method, message]);
    const target = method === 'followup' ? 'next-turn' : 'next-step';
    emit({ type: 'agent/inbox/spliced', data: { target, start: pending(target).length, removedCount: 0, inserted: [message] } });
    if (consume) {
      emit({ type: 'agent/inbox/spliced', data: { target, start: 0, removedCount: 1, inserted: [] } });
      emit({ type: 'user/message', data: message });
    }
  }
  const agent = { session, followup: message => send('followup', message),
    steer: message => send('steer', message), cancel: () => {
      calls.push(['cancel']);
      for (const target of ['next-step', 'next-turn']) {
        const count = pending(target).length;
        if (count) emit({ type: 'agent/inbox/spliced', data: { target, start: 0, removedCount: count, inserted: [], outcome: 'canceled' } });
      }
    },
    whenIdle: async () => {} };
  const handle = { agent, dispose: async () => calls.push(['dispose']) };
  async function create(options, operation) {
    if (operation === 'resume') assert.equal(options.resumeSessionId, options.sessionId);
    calls.push([operation, options]);
    if (onCreate) await onCreate({ options, operation, stream, host });
    if (createGate) await createGate.promise;
    if (!sessions.has(options.sessionId)) sessions.set(options.sessionId, sessions.size ? { events: [] } : session);
    session = sessions.get(options.sessionId);
    agent.session = session;
    options.setup({ tools: { register: tool => registered.set(tool.name, tool), guard: guard => guards.push(guard),
      restrict: options => calls.push(['restrict', options]), presentAs: mode => calls.push(['presentAs', mode]) },
      systemPrompt: { section: section => sections.push(section), variable: () => {} }, on: (event, listener) => listeners.set(event, listener) }, agent);
    return handle;
  }
  let projection;
  const ctx = { agents: { create: options => create(options, 'create'), resume: options => create(options, 'resume') },
    on: (event, listener, options) => {
      calls.push(['listen', event, options]);
      globalListeners.set(event, listener);
      return () => { globalListeners.delete(event); calls.push(['unlisten', event]); };
    },
    sessionProjections: { register: definition => { projection = definition; return () => {}; },
      stateOf: (source, key) => {
        assert.equal(key, projection.key);
        return projection.stateSchema.parse(source.events.reduce(projection.apply, projection.init()));
      } },
    sessions: { flush: async () => calls.push(['flush']) } };
  const host = new CompanionHost(ctx, { dataDir: directory, personaFile: join(directory, 'persona.yml'),
    bridgeUrl: `http://127.0.0.1:${server.address().port}` });
  t.after(async () => {
    createGate?.resolve(); runtime.responseGate?.resolve();
    try { await host.dispose(); }
    finally {
      server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
      assert.ok(directory.startsWith(join(fileURLToPath(root), 'host-')));
      await rm(directory, { recursive: true, force: true });
    }
  });
  await host.initialize(); clearTimeout(host.timer);
  return { host, runtime, calls, registered, guards, sections, stateFile, agent, ctx, emit, stream,
    preStep: decision => listeners.get('agent/pre-step')(decision, async () => ({ kind: 'enter' })),
    requestConfig: config => listeners.get('agent/request')({}, async () => Object.freeze(config)),
    emitError: error => listeners.get('agent/error')({ agent, error }) };
}

test('fresh host is paused/unbound; paused chat creates one scoped agent without game POST', async t => {
  const f = await fixture(t);
  assert.equal(Object.hasOwn(f.host.status(), 'controlNonce'), false);
  assert.equal((await readFile(join(f.host.directory, 'overlay-session.txt'), 'utf8')), f.host.sessionToken);
  assert.equal(f.host.scheduler.actionsAllowed, false);
  await assert.rejects(f.host.control({ action: 'resume' }), /Bind/);
  await f.host.control({ action: 'chat', text: '大肥鱼在吗' });
  await f.host.scheduler.whenIdle();
  assert.equal(f.calls.filter(([name]) => name === 'create').length, 1);
  assert.equal(f.calls.filter(([name]) => name === 'followup').length, 1);
  const prompt = f.calls.find(([name]) => name === 'followup')[1];
  assert.ok(prompt.id); assert.equal(prompt.role, 'user');
  assert.equal(prompt.source.kind, 'plugin:dsh-game-companion');
  assert.equal(f.runtime.requests.includes('POST'), false);
  assert.deepEqual(new Set(f.registered.keys()), new Set(['game_observe', 'game_act', 'game_lookup', 'game_plan', 'game_notes', 'game_advise', 'game_review', 'companion_say', 'companion_task']));
  assert.deepEqual(f.calls.find(([name]) => name === 'restrict')[1], { allow: [] });
  assert.ok(f.guards[0]({ name: 'shell' }));
  assert.match(f.sections[0].text, /本鲸陪你合作/);
  assert.equal(f.host.scheduler.actionsAllowed, false);
  f.emit({ type: 'assistant/message', seq: 9, data: { message: { content: [{ type: 'text', text: '本鲸在呢。' }] } } });
  assert.equal(f.host.messages.at(-1).text, '本鲸在呢。');
  const count = f.host.messages.length;
  f.emit({ type: 'assistant/message', seq: 9, data: { message: { content: [{ type: 'text', text: '本鲸在呢。' }] } } });
  assert.equal(f.host.messages.length, count);
});

test('new conversation archives chat and retains explicit personal preferences in an isolated model session', async t => {
  const f = await fixture(t);
  await f.host.control({ action: 'chat', text: '我喜欢蓝莓，记住这段聊天。' });
  await f.host.scheduler.whenIdle();
  const oldId = f.host.sessionId;
  const oldMessages = structuredClone(f.host.messages);
  const budget = f.host.budget.snapshot();
  f.host.scheduler.setGoal('finish the old game');
  const fresh = await f.host.control({ action: 'new-conversation' });
  assert.notEqual(fresh.sessionId, oldId);
  assert.deepEqual(fresh.messages, []);
  assert.equal(fresh.conversations.length, 2);
  assert.equal(fresh.scheduler.paused, true);
  assert.equal(fresh.scheduler.goal, null);
  assert.equal(fresh.conversationBusy, false);
  assert.deepEqual(f.host.memory, { preferences: [], events: [] });
  assert.deepEqual(fresh.budget, budget, 'A new chat must not reset the game trial budget');
  assert.deepEqual(f.host.archivedConversations[0].messages, oldMessages);
  const stored = JSON.parse(await readFile(f.stateFile, 'utf8'));
  assert.equal(stored.archivedConversations[0].sessionId, oldId);
  assert.equal(stored.sessionCreated, false, 'New chat is created lazily without a model call');
  await f.host.control({ action: 'chat', text: '你好，第一次见。' });
  await f.host.scheduler.whenIdle();
  const create = f.calls.filter(([name]) => name === 'create');
  assert.equal(create.length, 2);
  assert.notEqual(create[0][1].sessionId, create[1][1].sessionId);
  const prompt = JSON.parse(f.calls.filter(([name]) => name === 'followup').at(-1)[1].content[0].text);
  assert.equal(prompt.memory.preferences[0].text, '我喜欢蓝莓，记住这段聊天');
  assert.equal(prompt.memory.recent.some(message => message.text.includes('蓝莓')), false,
    'Long-term preferences cross sessions, while the old transcript stays archived');
  assert.equal(f.runtime.requests.includes('POST'), false);
});

test('personal corrections and forgetting survive new chat, old-chat switching and host restart', async t => {
  const f = await fixture(t);
  await f.host.control({ action: 'chat', text: '以后请叫我阿明' });
  await f.host.scheduler.whenIdle();
  const old = f.host.sessionId;
  await f.host.control({ action: 'new-conversation' });
  assert.equal(f.host.status().personalMemory.entries[0].text, '以后请叫我阿明');
  await f.host.control({ action: 'chat', text: '以后请叫我小夏' });
  await f.host.scheduler.whenIdle();
  await f.host.control({ action: 'switch-conversation', sessionId: old });
  assert.equal(f.host.status().personalMemory.entries[0].text, '以后请叫我小夏');
  await f.host.control({ action: 'chat', text: '忘记称呼' });
  await f.host.scheduler.whenIdle();
  await f.host.control({ action: 'new-conversation' });
  const restarted = await fixture(t, { saved: JSON.parse(await readFile(f.stateFile, 'utf8')) });
  assert.deepEqual(restarted.host.status().personalMemory.entries, []);
  const prompt = restarted.host.prompt({ kind: 'chat', messages: [{ content: '你好' }] });
  assert.deepEqual(JSON.parse(prompt.content[0].text).memory.preferences, []);
  assert.equal(f.runtime.requests.includes('POST'), false);
});

test('conversations can be renamed and deleted, and single memories forgotten, across restart', async t => {
  const f = await fixture(t);
  await f.host.control({ action: 'chat', text: '以后请叫我阿明' });
  await f.host.scheduler.whenIdle();
  const first = f.host.sessionId;
  let status = await f.host.control({ action: 'rename-conversation', sessionId: first, title: '  周五晚上的一局  ' });
  assert.equal(status.conversations.find(item => item.sessionId === first).title, '周五晚上的一局');
  await f.host.control({ action: 'new-conversation' });
  const second = f.host.sessionId;
  status = await f.host.control({ action: 'rename-conversation', sessionId: first, title: '' });
  assert.equal(status.conversations.find(item => item.sessionId === first).title, '以后请叫我阿明', 'An empty name falls back to the first line');
  await f.host.control({ action: 'rename-conversation', sessionId: second, title: '新的'.repeat(30) });
  assert.equal(f.host.status().conversations.find(item => item.sessionId === second).title.length, 40);
  status = await f.host.control({ action: 'delete-conversation', sessionId: second });
  assert.equal(status.sessionId, first, 'Deleting the open chat moves to the most recent other one');
  assert.deepEqual(status.conversations.map(item => item.sessionId), [first]);
  await assert.rejects(f.host.control({ action: 'delete-conversation', sessionId: second }), /没有找到/);
  const [memory] = status.personalMemory.entries;
  status = await f.host.control({ action: 'forget-memory', id: memory.id });
  assert.deepEqual(status.personalMemory.entries, []);
  assert.equal(status.messages.some(message => message.text.includes('阿明')), true, 'Forgetting keeps the chat text');
  await assert.rejects(f.host.control({ action: 'forget-memory', id: memory.id }), /没有找到/);
  const restarted = await fixture(t, { saved: JSON.parse(await readFile(f.stateFile, 'utf8')) });
  assert.deepEqual(restarted.host.status().conversations.map(item => item.sessionId), [first]);
  assert.deepEqual(restarted.host.status().personalMemory.entries, []);
});

test('live knowledge and run plans use guarded read-only observations and stale plans expire', async t => {
  const f = await fixture(t);
  await f.host.ensureAgent();
  await f.host.control({ action: 'bind', binding: identity });
  f.runtime.state.state.player = { character: 'Ironclad', deck: [{ id: 'STRIKE', name: 'Strike', type: 'Attack', description: 'Deal 6 damage.' }] };
  const exec = { signal: new AbortController().signal };
  const call = async (name, args) => JSON.parse(await f.registered.get(name).execute(args, exec));
  const knowledge = await call('game_lookup', { ids: ['STRIKE'] });
  assert.equal(knowledge.entities[0].description, 'Deal 6 damage.');
  const version = knowledge.source.observationVersion;
  await call('game_notes', { observation_version: version, direction: '先补防守', team_roles: '朋友负责爆发' });
  await call('game_plan', { observation_version: version, goal: '先防守，再铺垫', backup: '队友先击杀就改目标' });
  assert.equal(f.host.status().runMemory.turnPlan.goal, '先防守，再铺垫');
  f.runtime.state = observation(2);
  await call('game_observe', {});
  assert.equal(f.host.status().runMemory.turnPlan, null);
  assert.equal(f.host.status().runMemory.notes.direction, '先补防守');
  await assert.rejects(call('game_plan', { observation_version: version, goal: '旧计划' }), /STALE_PLAN/);
  f.runtime.state.run_id = 'another-run';
  await assert.rejects(call('game_observe', {}), error => error.code === 'BINDING_CHANGED');
  await f.host.control({ action: 'bind', binding: { ...identity, run_id: 'another-run' } });
  await call('game_observe', {});
  assert.equal(f.host.status().runMemory.notes, null);
  assert.equal(f.runtime.requests.includes('POST'), false);
});

test('request budgets change before immutable model requests and fresh combat plans precede actions', async t => {
  const f = await fixture(t);
  await f.host.control({ action: 'bind', binding: identity });
  await f.host.ensureAgent();
  f.runtime.state.state.player = { hp: 20, max_hp: 80, hand: [{ index: 0, can_play: true }] };
  f.runtime.state.state.state_type = 'boss';
  await f.host.tick(); clearTimeout(f.host.timer);
  f.host.replyRequest = { messages: [] };
  const config = Object.freeze({ provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'low', maxTokens: 3000 });
  await f.host.scheduler.setConnected(false);
  assert.equal((await f.requestConfig(config)).reasoningEffort, 'low', 'Offline games must not silently enable strategic budgets');
  f.host.scheduler.reconcile(f.host.lastObservation);
  assert.equal((await f.requestConfig(config)).reasoningEffort, 'high');
  assert.equal(config.reasoningEffort, 'low');
  f.host.replyRequest = { messages: [{ content: '晚饭吃什么' }] };
  assert.equal((await f.requestConfig(config)).reasoningEffort, 'low');
  await f.host.control({ action: 'resume' });
  await f.host.scheduler.whenIdle();
  const exec = { signal: new AbortController().signal };
  const version = f.host.lastObservation.versionKey;
  await assert.rejects(f.registered.get('game_act').execute({ observation_version: version, action: 'end_turn' }, exec), /PLAN_REQUIRED/);
  assert.equal(f.runtime.requests.includes('POST'), false);
  await f.registered.get('game_plan').execute({ observation_version: version, goal: '防守，等待队友' }, exec);
  await f.registered.get('game_act').execute({ observation_version: version, action: 'end_turn' }, exec);
  assert.equal(f.runtime.requests.includes('POST'), true);
  assert.equal(f.host.battleMemory.active.decisions.length, 1);
  assert.equal(f.host.battleMemory.active.decisions[0].action.action, 'end_turn');
});

test('adviser and review tools stay read-only and reviews persist as unverified hypotheses', async t => {
  const f = await fixture(t);
  await f.host.ensureAgent();
  f.runtime.state.state.player = { character: 'IRONCLAD', hp: 50, max_hp: 80, hand: [], deck: [] };
  await f.host.control({ action: 'bind', binding: identity });
  const exec = { signal: new AbortController().signal };
  const call = async (name, args = {}) => JSON.parse(await f.registered.get(name).execute(args, exec));
  const advice = await call('game_advise');
  assert.deepEqual(advice.candidates, []);
  assert.match(advice.limitations.join(' '), /版本/);
  const review = await call('game_review', { operation: 'similar' });
  assert.ok(review.activeBattle);
  const hypothesis = await call('game_review', { battle_id: review.activeBattle, hypothesis: '也许应该更早防守' });
  assert.equal(hypothesis.verified, false);
  assert.equal(JSON.parse(await readFile(f.stateFile, 'utf8')).battleMemory.active.hypotheses.length, 1);
  await f.host.scheduler.setConnected(false);
  const previousRequests = f.runtime.requests.length;
  const offline = await call('game_review', { battle_id: review.activeBattle });
  assert.equal(offline.detail.hypotheses.length, 1);
  assert.equal(f.runtime.requests.length, previousRequests, 'Offline review must not require a game request');
  assert.equal(f.runtime.requests.includes('POST'), false);
});

test('polling an unbound game does not create shared run or battle memories', async t => {
  const f = await fixture(t);
  f.runtime.state.state.player = { character: 'IRONCLAD', hp: 50, max_hp: 80, hand: [], deck: [] };
  await f.host.tick(); clearTimeout(f.host.timer);
  assert.equal(f.host.battleMemory.active, null);
  assert.deepEqual(f.host.runMemory.runs, []);
  await f.host.control({ action: 'bind', binding: identity });
  await f.host.tick(); clearTimeout(f.host.timer);
  assert.ok(f.host.battleMemory.active);
  assert.equal(f.host.runMemory.runs.length, 1);
});

test('history switching and restart restore each transcript and its own memory', async t => {
  const f = await fixture(t);
  await f.host.control({ action: 'chat', text: '我喜欢草莓。' });
  await f.host.scheduler.whenIdle();
  const oldId = f.host.sessionId;
  await f.host.control({ action: 'new-conversation' });
  const newId = f.host.sessionId;
  await f.host.control({ action: 'chat', text: '第二段聊星星。' });
  await f.host.scheduler.whenIdle();
  const old = await f.host.control({ action: 'switch-conversation', sessionId: oldId });
  assert.equal(old.sessionId, oldId);
  assert.equal(old.messages[0].text, '我喜欢草莓。');
  assert.equal(old.messages.some(message => message.text.includes('星星')), false);
  assert.equal(f.host.memory.preferences[0].text, '我喜欢草莓。');
  assert.equal(f.host.restored.sessionCreated, true);
  const saved = JSON.parse(await readFile(f.stateFile, 'utf8'));
  const restarted = await fixture(t, { saved });
  assert.equal(restarted.host.sessionId, oldId);
  assert.equal(restarted.host.messages[0].text, '我喜欢草莓。');
  const next = await restarted.host.control({ action: 'switch-conversation', sessionId: newId });
  assert.equal(next.messages[0].text, '第二段聊星星。');
  assert.deepEqual(restarted.host.memory.preferences, []);
  await restarted.host.control({ action: 'chat', text: '接着聊。' });
  await restarted.host.scheduler.whenIdle();
  assert.equal(restarted.calls.filter(([name]) => name === 'resume').at(-1)[1].resumeSessionId, newId);
});

test('conversation changes refuse an in-flight creation and invalid history without losing input', async t => {
  const createGate = deferred(), creating = deferred();
  const f = await fixture(t, { createGate, onCreate: () => creating.resolve() });
  const oldId = f.host.sessionId;
  const chat = f.host.control({ action: 'chat', text: '这句正在发送。' });
  await creating.promise;
  await assert.rejects(f.host.control({ action: 'new-conversation' }), /回完/);
  assert.equal(f.host.sessionId, oldId);
  assert.equal(f.host.archivedConversations.length, 0);
  createGate.resolve();
  await chat;
  await f.host.scheduler.whenIdle();
  await assert.rejects(f.host.control({ action: 'switch-conversation', sessionId: 'not-a-session' }), /没有找到/);
  assert.equal(f.host.messages[0].text, '这句正在发送。');
  assert.equal(f.calls.filter(([name]) => name === 'followup').length, 1);
});

test('new chat recovers a failed unsent queue and history never resends canceled input', async t => {
  const f = await fixture(t);
  const writeState = f.host.writeState;
  f.host.writeState = state => state.chatDelivery.some(message => message.status === 'dispatching')
    ? Promise.reject(new Error('save unavailable')) : writeState(state);
  await f.host.control({ action: 'chat', text: '这句没有交给模型。' });
  await f.host.scheduler.whenIdle();
  assert.equal(f.host.scheduler.faulted, true);
  assert.equal(f.host.scheduler.messages.length, 1);
  assert.equal(f.host.status().conversationBusy, false);
  const oldId = f.host.sessionId;
  f.host.writeState = writeState;
  await f.host.control({ action: 'new-conversation' });
  await f.host.control({ action: 'switch-conversation', sessionId: oldId });
  assert.equal(f.host.chatDelivery[0].status, 'canceled');
  const saved = JSON.parse(await readFile(f.stateFile, 'utf8'));
  const restarted = await fixture(t, { saved });
  await restarted.host.scheduler.whenIdle();
  assert.equal(restarted.calls.filter(([name]) => name === 'followup').length, 0);
  assert.equal(restarted.host.messages[0].text, '这句没有交给模型。');
});

test('casual chat excludes game snapshots and preferences survive host restart', async t => {
  const f = await fixture(t);
  await f.host.control({ action: 'chat', text: '我喜欢你直说，不用总问我问题。' });
  await f.host.scheduler.whenIdle();
  const prompt = JSON.parse(f.calls.find(([name]) => name === 'followup')[1].content[0].text);
  assert.equal(prompt.mode, 'chat');
  assert.equal(prompt.observation, null);
  assert.equal(prompt.goal, null);
  assert.equal(f.runtime.requests.includes('POST'), false);
  const saved = JSON.parse(await readFile(f.stateFile, 'utf8'));
  assert.equal(saved.memory.preferences.length, 1);
  const restarted = await fixture(t, { saved, events: f.agent.session.events });
  const next = JSON.parse(restarted.host.prompt({ kind: 'chat', messages: [{ content: '还记得刚才说的吗' }] }).content[0].text);
  assert.match(next.memory.preferences[0].text, /不用总问/);
});

test('the one-based first DSH step runs persona migration even below the size limit', async t => {
  const f = await fixture(t);
  await f.host.ensureAgent();
  const events = [{ type: 'system/message', data: {} },
    { type: 'user/message', data: { source: { kind: 'plugin:dsh-game-companion' } } },
    { type: 'assistant/message', data: {} },
    { type: 'user/message', data: { source: { kind: 'plugin:dsh-game-companion' } } }];
  const replacements = [];
  Object.assign(f.agent.session, { deriveMessages: () => [], snapshotEvents: () => events,
    surface: { nodes: [0, 1, 2, 3] }, deriveEventMessage: event => event,
    append: (...args) => replacements.push(args) });
  await f.preStep({ step: 1 });
  assert.equal(replacements.length, 1);
  assert.equal(f.host.restored.conversationVersion, 1);
  assert.equal(f.host.contextMaintenance.replaced, 2);
});

test('a casual spoken reply replaces preamble and hides the final paraphrase, but explanations remain', async t => {
  const f = await fixture(t);
  await f.host.ensureAgent();
  f.host.replyRequest = { messages: [{ content: '小肥鱼饿不饿' }] };
  const emitText = text => f.emit({ type: 'assistant/message', data: { message: { content: [{ type: 'text', text }] } } });
  emitText('我来回应一下你的问题。');
  await f.registered.get('companion_say').execute({ text: '有一点，你是不是藏了夜宵？', spoken: true }, {});
  emitText('是的，我有点饿了。');
  const duplicate = JSON.parse(await f.registered.get('companion_say').execute({ text: '（安静待着）', spoken: false }, {}));
  assert.equal(duplicate.delivered, false);
  assert.deepEqual(f.host.messages.map(m => m.text), ['有一点，你是不是藏了夜宵？']);
  f.host.replyRequest = { messages: [{ content: '详细解释一下为什么' }] };
  emitText('这是你追问的具体解释。');
  assert.equal(f.host.messages.at(-1).detail, true);
});

test('speech is opt-in, bounded, one line per turn and cooled down across turns', async t => {
  const f = await fixture(t);
  await f.host.ensureAgent();
  const say = args => f.registered.get('companion_say').execute(args, {}).then(JSON.parse);
  assert.equal(f.host.say('普通回复不会朗读。').spoken, false);
  assert.equal((await say({ text: '短句默认也不念。' })).spoken, false);
  assert.equal((await say({ text: '长'.repeat(121), spoken: true })).spoken, false);
  assert.equal((await say({ text: '这张挑得不错嘛，夸你呢。', spoken: true })).spoken, true);
  assert.equal((await say({ text: '同一轮别连着说。', spoken: true })).spoken, false);
  f.host.spokenThisTurn = false;
  assert.equal((await say({ text: '跨轮也要等一会儿。', spoken: true })).spoken, false);
  f.host.lastSpokenAt -= 20000;
  assert.equal((await say({ text: '听你的，这把我跟。', spoken: true })).spoken, true);
  const transcript = f.host.messages;
  assert.equal(transcript.filter(message => message.spoken).length, 2);
  await f.host.save();
  assert.deepEqual(JSON.parse(await readFile(f.stateFile, 'utf8')).messages, transcript);
});

test('a final-only reply gets one bounded spoken takeaway without another game turn', async t => {
  const f = await fixture(t);
  const sent = [];
  f.ctx.llm = { stream: options => f.stream(options, async function* () {
    sent.push(options);
    yield { type: 'text-delta', text: JSON.stringify({ text: '先拆护盾，你帮我留点格挡就好。', emotion: 'taking_notes' }) };
  }) };
  const send = f.agent.followup;
  f.agent.followup = message => {
    send(message);
    f.emit({ type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '护盾还有九层，先多次攻击再用重锤。'.repeat(30) }] } } });
  };
  await f.host.control({ action: 'new-trial' });
  await f.host.control({ action: 'chat', text: '这轮怎么打？' });
  await f.host.scheduler.whenIdle();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].messages.length, 2, 'speech editor cannot inherit the game history');
  assert.equal(sent[0].tools, undefined);
  assert.equal(f.host.messages.at(-1).spoken, true);
  assert.equal(f.host.messages.at(-1).emotion, 'taking_notes');
  assert.equal(f.host.messages.at(-2).detail, true);
  assert.equal(f.host.budget.snapshot().requestCount, 0, 'paused chat and its speech edit are separate from the game trial');
  assert.equal(f.calls.filter(([name]) => name === 'followup').length, 1);
  assert.equal(f.runtime.requests.includes('POST'), false);
});

test('text-only and cancellation suppress fallback speech', async t => {
  const f = await fixture(t);
  let edits = 0;
  f.ctx.llm = { stream: async function* () { edits++; yield { type: 'text-delta', text: '不该播出。' }; } };
  const send = f.agent.followup;
  f.agent.followup = message => {
    send(message);
    f.emit({ type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '这步先防御。' }] } } });
  };
  await f.host.control({ action: 'chat', text: '只用文字解释' });
  await f.host.scheduler.whenIdle();
  assert.equal(edits, 0);
  assert.equal(f.host.messages.at(-1).spoken, false);
  f.host.textOnly = false;
  f.host.speechAbort.abort();
  await f.host.completeSpeech({ messages: [] });
  assert.equal(f.host.messages.at(-1).spoken, false);
});

test('new chat arriving during speech editing discards the old line and completes the new reply', async t => {
  const f = await fixture(t);
  const editing = deferred();
  let edits = 0;
  f.ctx.llm = { stream: async function* ({ signal }) {
    if (++edits === 1) {
      editing.resolve();
      await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
      yield { type: 'text-delta', text: '过时的台词。' };
    } else yield { type: 'text-delta', text: JSON.stringify({ text: '听你的，这步先防御。', emotion: 'taking_notes' }) };
  } };
  for (const method of ['followup', 'steer']) {
    const send = f.agent[method];
    f.agent[method] = message => {
      send(message);
      f.emit({ type: 'assistant/message', data: { message: { content: [{ type: 'text', text: method === 'followup' ? '先攻击。' : '改为防御。' }] } } });
    };
  }
  await f.host.control({ action: 'chat', text: '怎么打？' });
  await editing.promise;
  await f.host.control({ action: 'chat', text: '等等，先防御' });
  await f.host.scheduler.whenIdle();
  assert.equal(edits, 2);
  assert.deepEqual(f.host.messages.filter(m => m.spoken).map(m => m.text), ['听你的，这步先防御。']);
  assert.equal(f.host.chatDelivery.every(m => m.status === 'consumed'), true);
});

test('pause and new user chat stop voice synthesis', async t => {
  const f = await fixture(t);
  let stops = 0;
  f.host.voice.stop = () => { stops++; };
  await f.host.control({ action: 'pause' });
  await f.host.control({ action: 'chat', text: '我来说一句' });
  assert.equal(stops, 2);
});

test('casual chat has one reply; an explicitly requested explanation stays collapsible', async t => {
  const f = await fixture(t);
  await f.host.control({ action: 'chat', text: '大肥鱼打得好菜哦' });
  await f.host.scheduler.whenIdle();
  const request = JSON.parse(f.calls.find(([name]) => name === 'followup')[1].content[0].text);
  assert.match(request.response_style, /spoken=true/);
  assert.deepEqual(f.registered.get('companion_say').parameters.required, ['text', 'spoken']);
  await f.registered.get('companion_say').execute({ text: '本鲸这叫稳！', spoken: true }, {});
  f.emit({ type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '护盾需要多次攻击才能清除。' }] } } });
  assert.equal(f.host.messages.at(-1).spoken, true);
  assert.equal(f.host.messages.some(m => m.text === '护盾需要多次攻击才能清除。'), false);
  await f.host.control({ action: 'chat', text: '解释一下刚才的打法' });
  await f.host.scheduler.whenIdle();
  assert.equal(JSON.parse(await f.registered.get('companion_say').execute({ text: '先拆它的护盾，重锤留后面。', spoken: true }, {})).spoken, true, 'direct user reply bypasses unsolicited-comment cooldown');
  f.emit({ type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '护盾需要多次攻击才能清除。' }] } } });
  assert.equal(f.host.messages.at(-1).detail, true);
  // A separate direct answer with no short line should not inherit folding.
  await f.host.control({ action: 'chat', text: '只用文字解释' });
  await f.host.scheduler.whenIdle();
  f.emit({ type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '这是直接回答你的说明。' }] } } });
  assert.equal(f.host.messages.at(-1).detail, undefined, 'previous turn cannot fold a new direct reply');
});

test('host persists pending action before POST, clears it only after effect and readback', async t => {
  const f = await fixture(t);
  await f.host.control({ action: 'bind', binding: identity });
  await f.host.control({ action: 'resume' }); await f.host.scheduler.whenIdle();
  await f.registered.get('game_act').execute({ observation_version: f.host.lastObservation.versionKey, action: 'end_turn' }, {});
  const pending = f.runtime.persistedAtPost.adapter.pending;
  assert.ok(pending.actionId); assert.ok(pending.deadline > Date.now() - 15000);
  assert.deepEqual(f.runtime.persistedAtPost.adapter.binding, identity);
  const saved = JSON.parse(await readFile(f.stateFile, 'utf8'));
  assert.equal(saved.adapter.pending, null);
  assert.equal(f.runtime.requests.filter(method => method === 'POST').length, 1);
  await f.host.control({ action: 'pause' });
  await assert.rejects(f.registered.get('game_act').execute({ observation_version: f.host.lastObservation.versionKey, action: 'end_turn' }, {}), { code: 'PAUSED' });
});

test('restart restores unconfirmed action and refuses rebind or resume without receipt', async t => {
  const pending = { actionId: 'previous-action', deadline: Date.now() - 1000 };
  const f = await fixture(t, { saved: { sessionId: 'existing-game-session', sessionCreated: true,
    adapter: { binding: identity, pending }, goal: '一起通关', messages: [] } });
  assert.equal(f.host.sessionId, 'existing-game-session');
  assert.deepEqual(f.host.adapter.snapshot().pending, pending);
  assert.equal(f.host.bindingConfirmed, false);
  await assert.rejects(f.host.control({ action: 'resume' }), /Bind/);
  await assert.rejects(f.host.control({ action: 'bind', binding: identity }), { code: 'ACTION_UNCERTAIN' });
  assert.equal(f.runtime.requests.includes('POST'), false);
  await f.host.control({ action: 'chat', text: '先聊天' }); await f.host.scheduler.whenIdle();
  assert.equal(f.calls.filter(([name]) => name === 'resume').length, 1);
  assert.equal(f.host.scheduler.actionsAllowed, false);
});

test('pause during asynchronous agent creation wins over earlier resume request', async t => {
  const createGate = deferred();
  const creating = deferred();
  const f = await fixture(t, { createGate, onCreate: () => creating.resolve() });
  await f.host.control({ action: 'bind', binding: identity });
  const resuming = assert.rejects(f.host.control({ action: 'resume' }), /interrupted/);
  await creating.promise;
  await f.host.control({ action: 'pause' });
  createGate.resolve();
  await resuming;
  assert.equal(f.host.scheduler.actionsAllowed, false);
  assert.equal(f.calls.filter(([name]) => name === 'followup').length, 0);
});

test('identity change closes action gate and exposes new identity for explicit binding', async t => {
  const f = await fixture(t);
  await f.host.control({ action: 'bind', binding: identity });
  await f.host.control({ action: 'resume' }); await f.host.scheduler.whenIdle();
  f.runtime.state = { ...observation(2), run_id: 'next-run' };
  await f.host.tick(); clearTimeout(f.host.timer);
  assert.equal(f.host.bindingConfirmed, false);
  assert.equal(f.host.scheduler.actionsAllowed, false);
  assert.equal(f.host.lastObservation.guard.run_id, 'next-run');
  assert.equal(f.runtime.requests.includes('POST'), false);
});

test('failed initialization and disposal preserve the original pending action evidence', async t => {
  const f = await fixture(t);
  await f.host.dispose();
  const saved = { sessionId: 'recover-me', goal: 'cooperate', adapter: { binding: identity,
    pending: { actionId: 'unconfirmed', deadline: 1234 } } };
  await writeFile(f.stateFile, JSON.stringify(saved));
  const failed = new CompanionHost({}, { dataDir: f.host.directory, tokenFile: join(f.host.directory, 'missing-token.txt') });
  await assert.rejects(failed.initialize(), { code: 'ENOENT' });
  await failed.dispose();
  assert.deepEqual(JSON.parse(await readFile(f.stateFile, 'utf8')), saved);
});

test('DSH-contained model errors fault the scheduler instead of silently completing chat', async t => {
  const f = await fixture(t);
  f.agent.whenIdle = async () => f.emitError(new Error('model route unavailable'));
  await f.host.control({ action: 'chat', text: '测试错误回传' });
  await f.host.scheduler.whenIdle();
  assert.equal(f.host.scheduler.snapshot().faulted, true);
  assert.equal(f.host.status().error, 'model route unavailable');
  assert.equal(f.host.scheduler.snapshot().queuedMessages.length, 0);
  assert.equal(f.host.status().chatDelivery[0].status, 'consumed');
});

test('explicit pause chat closes the game gate before it is sent to the model', async t => {
  const f = await fixture(t);
  await f.host.control({ action: 'bind', binding: identity });
  await f.host.control({ action: 'resume' }); await f.host.scheduler.whenIdle();
  await f.host.control({ action: 'chat', text: '等一下！' });
  assert.equal(f.host.scheduler.actionsAllowed, false);
  await f.host.scheduler.whenIdle();
  const prompts = f.calls.filter(([name]) => name === 'followup');
  const last = JSON.parse(prompts.at(-1)[1].content[0].text);
  assert.equal(last.actions_allowed, false);
});

test('accepted chat left in the host queue survives restart with its original UI id', async t => {
  const f = await fixture(t);
  f.agent.followup = () => { throw new Error('submission outcome unavailable'); };
  await f.host.control({ action: 'chat', text: 'uncertain first request' });
  await f.host.scheduler.whenIdle();
  assert.equal(f.host.scheduler.snapshot().faulted, true);
  const accepted = await f.host.control({ action: 'chat', text: 'definitely not submitted yet' });
  const queued = accepted.chatDelivery.find(message => message.status === 'queued');
  assert.equal(accepted.messages.find(message => message.id === queued.id).text, queued.text);
  await f.host.dispose();
  const saved = JSON.parse(await readFile(f.stateFile, 'utf8'));
  assert.equal(saved.chatDelivery.find(message => message.id === queued.id).status, 'queued');

  const restarted = await fixture(t, { saved });
  await restarted.host.scheduler.whenIdle();
  const prompts = restarted.calls.filter(([name]) => name === 'followup');
  assert.equal(prompts.length, 1);
  const chat = JSON.parse(prompts[0][1].content[0].text).chat;
  assert.deepEqual(chat, [{ id: queued.id, content: queued.text }]);
  assert.equal(restarted.host.sessionId, saved.sessionId);
  assert.equal(restarted.host.scheduler.actionsAllowed, false);
  assert.equal(restarted.host.status().chatDelivery[0].needsConfirmation, true);
});

function savedChat(status = 'dispatching') {
  return { sessionId: 'original-session', sessionCreated: true,
    chatDelivery: [{ id: 'chat-1', text: 'already submitted', status, envelopeId: 'envelope-1' }],
    messages: [{ id: 'chat-1', role: 'user', text: 'already submitted' }] };
}

function submittedEvents(ending) {
  const message = { id: 'envelope-1', role: 'user', source: { kind: 'plugin:dsh-game-companion' }, content: [] };
  const events = [{ type: 'agent/inbox/spliced', data: { target: 'next-turn', start: 0, removedCount: 0, inserted: [message] } }];
  if (ending !== 'inbox') events.push({ type: 'agent/inbox/spliced', data: {
    target: 'next-turn', start: 0, removedCount: 1, inserted: [], ...(ending === 'canceled' ? { outcome: 'canceled' } : {}) } });
  if (ending === 'consumed') events.push({ type: 'user/message', data: message });
  return events;
}

for (const ending of ['inbox', 'consumed', 'claimed', 'canceled', 'missing']) {
  test(`restart reconciles ${ending} DSH evidence without resubmitting dispatch intent`, async t => {
    const f = await fixture(t, { saved: savedChat(), events: ending === 'missing' ? [] : submittedEvents(ending) });
    await f.host.scheduler.whenIdle();
    assert.equal(f.calls.filter(([name]) => name === 'followup' || name === 'steer').length, 0);
    assert.equal(f.calls.filter(([name]) => name === 'resume').length, 1);
    const delivery = f.host.status().chatDelivery[0];
    assert.equal(delivery.status, ['claimed', 'missing'].includes(ending) ? 'uncertain' : ending);
    assert.equal(delivery.needsConfirmation, ['claimed', 'missing', 'canceled'].includes(ending));
    assert.equal(f.host.sessionId, 'original-session');
    assert.equal(JSON.parse(await readFile(f.stateFile, 'utf8')).chatDelivery[0].status, delivery.status);
  });
}

for (const consume of [true, false]) {
  test(`pause does not replay ${consume ? 'consumed' : 'pending'} DSH chat`, async t => {
    const f = await fixture(t, { consume });
    const turn = deferred();
    const sent = deferred();
    t.after(() => turn.resolve());
    f.agent.whenIdle = () => turn.promise;
    const send = f.agent.followup;
    f.agent.followup = message => { send(message); sent.resolve(); };
    const cancel = f.agent.cancel;
    f.agent.cancel = () => { cancel(); turn.resolve(); };
    await f.host.control({ action: 'chat', text: 'do not duplicate this' });
    await sent.promise;
    await f.host.control({ action: 'pause' });
    await f.host.scheduler.whenIdle();
    assert.equal(f.calls.filter(([name]) => name === 'followup').length, 1);
    const delivery = f.host.status().chatDelivery[0];
    assert.equal(delivery.status, consume ? 'consumed' : 'canceled');
    assert.equal(delivery.needsConfirmation, !consume);
    assert.deepEqual(f.host.scheduler.snapshot().queuedMessages, []);
  });
}

test('dispatch intent is durable before DSH send; failed flush is uncertain and never replayed', async t => {
  const f = await fixture(t);
  await f.host.ensureAgent();
  const write = f.host.writeState;
  let lastSaved;
  f.host.writeState = async value => { await write(value); lastSaved = JSON.parse(await readFile(f.stateFile, 'utf8')); };
  const send = f.agent.followup;
  f.agent.followup = message => {
    const record = lastSaved.chatDelivery[0];
    assert.equal(record.status, 'dispatching');
    assert.equal(record.envelopeId, message.id);
    assert.equal(record.id, JSON.parse(message.content[0].text).chat[0].id);
    send(message);
  };
  f.ctx.sessions.flush = async () => { throw new Error('DSH durability unavailable'); };
  await f.host.control({ action: 'chat', text: 'durable boundary' });
  await f.host.scheduler.whenIdle();
  assert.equal(f.host.scheduler.snapshot().faulted, true);
  assert.equal(f.calls.filter(([name]) => name === 'followup').length, 1);
  assert.equal(f.host.status().chatDelivery[0].status, 'uncertain');
  assert.equal(f.host.status().chatDelivery[0].needsConfirmation, true);
  assert.equal(lastSaved.chatDelivery[0].status, 'uncertain');
  assert.deepEqual(f.host.scheduler.snapshot().queuedMessages, []);
});

test('failed dispatch-intent persistence cannot submit input to DSH', async t => {
  const f = await fixture(t);
  await f.host.ensureAgent();
  const write = f.host.writeState;
  f.host.writeState = value => value.chatDelivery.some(message => message.status === 'dispatching')
    ? Promise.reject(new Error('disk unavailable')) : write(value);
  await f.host.control({ action: 'chat', text: 'keep until stored' });
  await f.host.scheduler.whenIdle();
  assert.equal(f.calls.filter(([name]) => name === 'followup').length, 0);
  assert.equal(f.host.scheduler.snapshot().faulted, true);
  assert.equal(f.host.status().chatDelivery[0].status, 'queued');
  assert.equal(JSON.parse(await readFile(f.stateFile, 'utf8')).chatDelivery[0].status, 'queued');
});

test('pause while dispatch intent is saving sends the unsent chat once with actions disabled', async t => {
  const f = await fixture(t);
  await f.host.ensureAgent();
  const savedIntent = deferred(), release = deferred();
  const write = f.host.writeState;
  let gated = false;
  f.host.writeState = async value => {
    const isIntent = value.chatDelivery.some(message => message.status === 'dispatching');
    await write(value);
    if (!gated && isIntent) {
      gated = true; savedIntent.resolve(); await release.promise;
    }
  };
  t.after(() => release.resolve());
  await f.host.control({ action: 'chat', text: 'pause race' });
  await savedIntent.promise;
  await f.host.control({ action: 'pause' });
  assert.equal(f.calls.filter(([name]) => name === 'followup').length, 0);
  release.resolve();
  await f.host.scheduler.whenIdle();
  const prompts = f.calls.filter(([name]) => name === 'followup');
  assert.equal(prompts.length, 1);
  assert.equal(JSON.parse(prompts[0][1].content[0].text).actions_allowed, false);
  assert.equal(f.host.status().chatDelivery[0].status, 'consumed');
});

test('host disposal preserves queued chat and cannot dispatch it during cancellation cleanup', async t => {
  const f = await fixture(t);
  const turn = deferred(), sent = deferred();
  t.after(() => turn.resolve());
  f.agent.whenIdle = () => turn.promise;
  const send = f.agent.followup, cancel = f.agent.cancel;
  f.agent.followup = message => { send(message); sent.resolve(); };
  f.agent.cancel = () => { cancel(); turn.resolve(); };
  delete f.host.scheduler.driver.steer;
  await f.host.control({ action: 'chat', text: 'active chat' });
  await sent.promise;
  await f.host.control({ action: 'chat', text: 'queued during active chat' });
  await f.host.dispose();
  assert.equal(f.calls.filter(([name]) => name === 'followup').length, 1);
  const saved = JSON.parse(await readFile(f.stateFile, 'utf8'));
  assert.deepEqual(saved.chatDelivery.map(message => message.status), ['consumed', 'queued']);
  assert.equal(f.host.scheduler.snapshot().active, false);
});

test('a matching ID from another message source is not proof of companion model admission', async t => {
  const events = submittedEvents('claimed');
  events.push({ type: 'user/message', data: { id: 'envelope-1', source: { kind: 'other-plugin' } } });
  const f = await fixture(t, { saved: savedChat(), events });
  assert.equal(f.host.status().chatDelivery[0].status, 'uncertain');
  assert.equal(f.host.status().chatDelivery[0].reason, 'claimed-without-model-admission');
  assert.equal(f.calls.filter(([name]) => name === 'followup').length, 0);
});

test('failure to save an accepted queue record never starts delivery', async t => {
  const f = await fixture(t);
  await f.host.ensureAgent();
  const write = f.host.writeState;
  f.host.writeState = () => Promise.reject(new Error('queue store unavailable'));
  await assert.rejects(f.host.control({ action: 'chat', text: 'must be stored first' }), /queue store unavailable/);
  await f.host.scheduler.whenIdle();
  assert.equal(f.calls.filter(([name]) => name === 'followup').length, 0);
  assert.deepEqual(f.host.scheduler.snapshot().queuedMessages, []);
  f.host.writeState = write;
});

async function consumeStream(iterable) {
  const chunks = [];
  for await (const chunk of iterable) chunks.push(chunk);
  return chunks;
}
async function* modelReply() {
  yield { type: 'usage', usage: { inputTokens: 7, outputTokens: 3, totalTokens: 10 } };
  yield { type: 'finish', reason: { kind: 'stop' } };
}
function trialState(count = 0) {
  return { startedAt: Date.now() - 1000, deadlineAt: Date.now() + 60000, requestCount: count, limitReason: null,
    requests: Array.from({ length: count }, () => ({ status: 'completed' })) };
}

test('game calls and independent auxiliary work count toward the trial; paused chat does not', async t => {
  const f = await fixture(t);
  let modelTurn = Promise.resolve();
  const send = f.agent.followup;
  f.agent.followup = message => {
    send(message);
    modelTurn = consumeStream(f.stream({ sessionId: f.host.sessionId, provider: 'deepseek-official',
      model: 'deepseek-flash', purpose: JSON.parse(message.content[0].text).event }, modelReply));
  };
  f.agent.whenIdle = () => modelTurn;
  await f.host.control({ action: 'chat', text: 'before the trial' });
  await f.host.scheduler.whenIdle();
  assert.equal(f.host.status().budget.startedAt, null);
  assert.equal(f.host.status().budget.requestCount, 0);
  assert.deepEqual(f.calls.find(call => call[0] === 'listen' && call[1] === 'llm/stream')[2], { global: true, prepend: true });
  assert.deepEqual(f.host.status().route, { provider: 'deepseek-official', model: 'deepseek-flash' });
  const agentOptions = f.calls.find(call => call[0] === 'create')[1].agentOptions;
  assert.equal(agentOptions.provider, 'deepseek-official');
  assert.equal(agentOptions.model, 'deepseek-flash');

  await f.host.control({ action: 'bind', binding: identity });
  await f.host.control({ action: 'resume' });
  await f.host.scheduler.whenIdle();
  const started = f.host.status().budget;
  assert.equal(started.deadlineAt - started.startedAt, 1800000);
  assert.equal(started.requestCount, 1);
  assert.equal(f.host.budget.maxRequests, 100);
  await f.host.control({ action: 'pause' });
  await f.host.control({ action: 'chat', text: 'paused after the trial began' });
  await f.host.scheduler.whenIdle();
  await consumeStream(f.stream({ sessionId: f.host.sessionId, purpose: 'summary' }, modelReply));
  await consumeStream(f.stream({ sessionId: 'another-session' }, modelReply));
  assert.equal(f.host.status().budget.requestCount, 2);
  assert.equal(f.host.status().budget.requests[1].purpose, 'summary');
  assert.equal(f.host.status().budget.requests[1].usage.totalTokens, 10);
  await f.host.control({ action: 'resume' });
  await f.host.scheduler.whenIdle();
  assert.equal(f.host.status().budget.requestCount, 3);
  assert.equal(f.host.status().budget.deadlineAt, started.deadlineAt);
  assert.equal(JSON.parse(await readFile(f.stateFile, 'utf8')).budget.requestCount, 3);
});

for (const reason of ['time-limit', 'request-limit']) {
  test(`offline paused chat works after ${reason} without resetting the game budget`, async t => {
    const budget={...trialState(1),limitReason:reason};
    const f=await fixture(t,{saved:{sessionId:'expired-game',sessionCreated:true,budget}});
    await f.host.scheduler.setConnected(false);
    f.host.scheduler.faulted=true;
    let modelTurn;
    const send=f.agent.followup;
    f.agent.followup=message=>{
      send(message);
      modelTurn=consumeStream(f.stream({sessionId:f.host.sessionId},modelReply));
    };
    f.agent.whenIdle=()=>modelTurn??Promise.resolve();
    await f.host.control({action:'chat',text:'小肥鱼饿不饿呀'});
    await f.host.scheduler.whenIdle();
    assert.equal(f.calls.filter(([kind])=>kind==='followup').length,1);
    const input=JSON.parse(f.calls.find(([kind])=>kind==='followup')[1].content[0].text);
    assert.equal(input.observation,null);
    assert.equal(input.goal,null);
    assert.equal(f.host.scheduler.faulted,false);
    assert.equal(f.host.scheduler.actionsAllowed,false);
    assert.equal(f.host.status().budget.limitReason,reason);
    assert.equal(f.host.status().budget.requestCount,1);
    assert.equal(f.runtime.requests.includes('POST'),false);
  });
}

test('game trial expiry during a paused chat does not cancel that conversation', async t => {
  const f=await fixture(t);
  await f.host.control({action:'new-trial'});
  const sent=deferred(),finish=deferred();
  t.after(()=>finish.resolve());
  f.agent.whenIdle=()=>finish.promise;
  const send=f.agent.followup;
  f.agent.followup=message=>{send(message);sent.resolve();};
  await f.host.control({action:'chat',text:'聊一会儿'});
  await sent.promise;
  f.host.budget.limit('time-limit');
  assert.equal(f.host.scheduler.active.canceled,false);
  assert.equal(f.host.scheduler.actionsAllowed,false);
  finish.resolve();await f.host.scheduler.whenIdle();
});

test('restored budget is enforced during agent resume before restored inbox work can call a model', async t => {
  const budget = trialState(1);
  budget.requests[0].status = 'pending';
  const f = await fixture(t, { saved: { ...savedChat('inbox'), budget }, events: submittedEvents('inbox'),
    onCreate: async ({ options, operation, stream, host }) => {
      assert.equal(operation, 'resume');
      assert.equal(host.budget.snapshot().requests[0].status, 'unknown');
      await consumeStream(stream({ sessionId: options.resumeSessionId, purpose: 'resume-auxiliary' }, modelReply));
    } });
  assert.equal(f.host.status().budget.requestCount, 2);
  assert.equal(f.host.status().budget.deadlineAt, budget.deadlineAt);
  assert.equal(f.host.status().budget.requests[0].status, 'unknown');
  assert.equal(f.host.scheduler.actionsAllowed, false);
  assert.equal(f.calls.filter(call => call[0] === 'followup').length, 0);
  await f.host.control({ action: 'bind', binding: identity });
  await f.host.control({ action: 'resume' });
  await f.host.scheduler.whenIdle();
  assert.equal(f.host.status().budget.requestCount, 2);
  assert.equal(f.host.status().budget.deadlineAt, budget.deadlineAt);
});

test('100th call closes the gate without waiting for idle; ordinary resume cannot reset it', async t => {
  const f = await fixture(t, { saved: { sessionId: 'capped-trial', sessionCreated: true, budget: trialState(99) } });
  await f.host.control({ action: 'bind', binding: identity });
  await f.host.control({ action: 'resume' });
  await f.host.scheduler.whenIdle();
  await assert.rejects(f.host.control({ action: 'new-trial' }), /paused, idle/);
  f.agent.whenIdle = () => { assert.fail('limit callback must not await an auxiliary stream itself'); };
  const options = { sessionId: f.host.sessionId };
  await consumeStream(f.stream(options, modelReply));
  assert.equal(f.host.scheduler.actionsAllowed, false);
  assert.equal(f.host.status().budget.requestCount, 100);
  assert.equal(f.host.status().budget.limitReason, 'request-limit');
  assert.ok(f.calls.some(call => call[0] === 'cancel'));
  await assert.rejects(consumeStream(f.stream(options, () => assert.fail('101st call must not dispatch'))), /request-limit/);
  await assert.rejects(f.host.control({ action: 'resume' }), /request-limit/);
  await consumeStream(f.stream({ sessionId: 'another-session' }, modelReply));
  assert.equal(f.host.status().budget.requestCount, 100);
  const reset = await f.host.control({ action: 'new-trial' });
  assert.equal(reset.budget.requestCount, 0);
  assert.equal(reset.budget.limitReason, null);
  assert.equal(reset.budget.deadlineAt - reset.budget.startedAt, 1800000);
  assert.equal(f.host.scheduler.actionsAllowed, false);
  await f.host.dispose();
  assert.equal(f.host.budget.disposed, true);
  assert.ok(f.calls.some(call => call[0] === 'unlisten' && call[1] === 'llm/stream'));
});

test('expired restore blocks own-session model admission before agent resume, without resetting the trial', async t => {
  const budget = { ...trialState(2), startedAt: Date.now() - 2000, deadlineAt: Date.now() - 1 };
  const f = await fixture(t, { saved: { ...savedChat('inbox'), budget }, events: submittedEvents('inbox'),
    onCreate: async ({ options, stream, host }) => {
      assert.equal(host.scheduler.actionsAllowed, false);
      await assert.rejects(consumeStream(stream({ sessionId: options.resumeSessionId },
        () => assert.fail('expired restored inbox must not call the provider'))), /time-limit/);
    } });
  assert.equal(f.host.status().budget.deadlineAt, budget.deadlineAt);
  assert.equal(f.host.status().budget.requestCount, 2);
  assert.equal(f.host.status().budget.limitReason, 'time-limit');
  assert.equal(JSON.parse(await readFile(f.stateFile, 'utf8')).budget.limitReason, 'time-limit');
});

test('deadline closes an active game gate synchronously, and a new trial requires paused idle state', async t => {
  const f = await fixture(t);
  await f.host.control({ action: 'bind', binding: identity });
  await f.host.control({ action: 'resume' });
  await f.host.scheduler.whenIdle();
  const expiredAt = f.host.budget.snapshot().deadlineAt;
  f.host.budget.now = () => expiredAt;
  f.host.budget.armTimer();
  assert.equal(f.host.scheduler.actionsAllowed, false);
  assert.equal(f.host.status().budget.limitReason, 'time-limit');
  await f.host.control({ action: 'new-trial' });
  const turn = deferred(), sent = deferred();
  const send = f.agent.followup, cancel = f.agent.cancel;
  f.agent.followup = message => { send(message); sent.resolve(); };
  f.agent.whenIdle = () => turn.promise;
  f.agent.cancel = () => { cancel(); turn.resolve(); };
  await f.host.control({ action: 'chat', text: 'active paused chat' });
  await sent.promise;
  await assert.rejects(f.host.control({ action: 'new-trial' }), /paused, idle/);
  turn.resolve();
  await f.host.scheduler.whenIdle();
});

test('pause wins while the initial budget is saving, before agent creation or game wakeup', async t => {
  const f = await fixture(t);
  await f.host.control({ action: 'bind', binding: identity });
  const write = f.host.writeState, entered = deferred(), release = deferred();
  let gated = false;
  f.host.writeState = async value => {
    await write(value);
    if (!gated && value.budget.startedAt !== null) { gated = true; entered.resolve(); await release.promise; }
  };
  t.after(() => release.resolve());
  const resuming = assert.rejects(f.host.control({ action: 'resume' }), /interrupted/);
  await entered.promise;
  await f.host.control({ action: 'pause' });
  release.resolve();
  await resuming;
  assert.equal(f.host.scheduler.actionsAllowed, false);
  assert.equal(f.calls.filter(call => call[0] === 'create' || call[0] === 'followup').length, 0);
  assert.notEqual(f.host.status().budget.startedAt, null);
});

test('an iterable created before trial start cannot bypass the budget when consumed afterwards', async t => {
  const f = await fixture(t);
  const delayed = f.stream({ sessionId: f.host.sessionId }, modelReply);
  await f.host.control({ action: 'new-trial' });
  await consumeStream(delayed);
  assert.equal(f.host.status().budget.requestCount, 1);
});

test('invalid saved budget fails initialization without overwriting the original state', async t => {
  const f = await fixture(t);
  await f.host.dispose();
  const saved = { sessionId: 'preserve-invalid-trial', budget: { ...trialState(), deadlineAt: null },
    adapter: { binding: identity, pending: { actionId: 'keep-evidence', deadline: 1234 } } };
  await writeFile(f.stateFile, JSON.stringify(saved));
  const failed = new CompanionHost(f.ctx, { dataDir: f.host.directory });
  await assert.rejects(failed.initialize(), /Invalid restored trial budget/);
  await failed.dispose();
  assert.deepEqual(JSON.parse(await readFile(f.stateFile, 'utf8')), saved);
});

test('budget exhaustion inside an active host turn cancels without a whenIdle deadlock', async t => {
  const f = await fixture(t, { saved: { sessionId: 'last-call', sessionCreated: true, budget: trialState(99) } });
  let modelTurn = Promise.resolve();
  const send = f.agent.followup;
  f.agent.followup = message => {
    send(message);
    modelTurn = consumeStream(f.stream({ sessionId: f.host.sessionId }, modelReply));
  };
  f.agent.whenIdle = () => modelTurn;
  await f.host.control({ action: 'bind', binding: identity });
  await f.host.control({ action: 'resume' });
  await f.host.scheduler.whenIdle();
  assert.equal(f.host.status().budget.requestCount, 100);
  assert.equal(f.host.status().budget.limitReason, 'request-limit');
  assert.equal(f.host.scheduler.actionsAllowed, false);
  assert.equal(f.host.scheduler.snapshot().active, false);
  assert.equal(f.calls.filter(call => call[0] === 'followup').length, 1);
});
