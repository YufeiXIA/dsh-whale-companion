import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRunMemory, observeRun, runContext, setRunPlan, setRunNotes } from '../src/run-memory.js';
import { gameKnowledge } from '../src/game-knowledge.js';

const observation = (run = 'run-one', version = 'v1') => ({ versionKey: version, phase: 'combat',
  guard: { run_id: run, local_player_id: 'whale' }, state: { state_type: 'monster', game_version: 'test-v1',
    game: { floor: 4, act: 1 }, player: { character: 'Ironclad', deck: [],
      hand: [{ id: 'STRIKE', name: 'Strike', description: 'Deal 6 damage.', cost: '1' }] },
    battle: { round: 2, enemies: [{ id: 'slime', name: 'Slime', hp: 8, block: 0 }] } } });

test('run notes are isolated across runs and players, survive reload and never become observed facts', () => {
  const book = loadRunMemory();
  const first = observation();
  setRunNotes(book, first, { observation_version: 'v1', direction: '补防守' });
  setRunPlan(book, first, { observation_version: 'v1', goal: '先击杀史莱姆' });
  const restored = loadRunMemory(JSON.parse(JSON.stringify(book)));
  assert.match(runContext(restored, first).notes.source, /hypothesis/);
  assert.equal(runContext(restored, observation('run-two')).notes, null);
  const teammate = structuredClone(first);
  teammate.guard.local_player_id = 'human';
  assert.equal(runContext(restored, teammate).turnPlan, null);
  assert.equal(runContext(restored, first).turnPlan.goal, '先击杀史莱姆');
  first.versionKey = 'native-game-over'; first.state.state_type = 'game_over'; first.state.game_over = { win: false };
  assert.equal(runContext(restored, first).outcome, 'lost');
});

test('any state change invalidates concrete plans, while keeping hypotheses for reassessment', () => {
  const book = loadRunMemory();
  setRunPlan(book, observation(), { observation_version: 'v1', goal: '出牌', defense: '需要 5 格挡' });
  observeRun(book, observation('run-one', 'teammate-action-v2'));
  assert.equal(book.runs[0].turnPlan, null);
  assert.throws(() => setRunPlan(book, observation('run-one', 'v3'), { observation_version: 'v1', goal: '过期' }), /STALE_PLAN/);
});

test('knowledge is scene-specific, bounded and sourced to the exact observation and reported version', () => {
  const seen = observation();
  seen.state.player.deck = Array.from({ length: 100 }, (_, i) => ({ id: `CARD_${i}`, description: 'card '.repeat(1000) }));
  const knowledge = gameKnowledge(seen);
  assert.equal(knowledge.entities.length, 12);
  assert.equal(knowledge.source.gameVersion, 'test-v1');
  assert.equal(knowledge.source.observationVersion, 'v1');
  assert.ok(JSON.stringify(knowledge).length < 9000);
  const missing = gameKnowledge(seen, { ids: ['not-present'] });
  assert.deepEqual(missing.entities, []);
  assert.deepEqual(missing.notFound, ['not-present']);
  delete seen.state.game_version;
  assert.equal(gameKnowledge(seen).source.gameVersion, null);
  seen.state.run = { floor: 9, act: 2, ascension: 0 };
  const actualRun = runContext(loadRunMemory(), seen);
  assert.equal(actualRun.floor, 9, 'live bridge metadata is under run');
  assert.equal(actualRun.act, 2);
  seen.state.state_type = 'shop'; seen.phase = 'shop';
  assert.notDeepEqual(gameKnowledge(seen).guidance, knowledge.guidance);
});

test('lookup reads native merchant field names, prices and current power descriptions', () => {
  const seen = observation();
  seen.state.state_type = 'shop'; seen.phase = 'shop';
  seen.state.shop = { items: [{ index: 7, category: 'potion', potion_id: 'BLOOD_POTION', potion_name: '鲜血药水',
    potion_description: '回复最大生命的20%。', price: 50, can_afford: true, is_stocked: true }] };
  const item = gameKnowledge(seen, { category: 'shop', ids: ['BLOOD_POTION'] }).entities[0];
  assert.equal(item.name, '鲜血药水'); assert.equal(item.price, 50); assert.match(item.description, /20%/);
  seen.state.player.status = [{ id: 'WEAK', name: '虚弱', description: '攻击伤害降低。' }];
  assert.match(gameKnowledge(seen, { category: 'power', ids: ['WEAK'] }).entities[0].description, /降低/);
  seen.state.players = [{ is_local: false, character: '铁甲战士', status: [{ id: 'TEAM_BUFF', amount: 2, description: '友方能力' }] }];
  const power = gameKnowledge(seen, { category: 'power', ids: ['TEAM_BUFF'] }).entities[0];
  assert.equal(power.amount, 2); assert.match(power.owner, /player_slot_0/);
});
