import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBattleMemory, observeBattle, recordDecision, similarBattles, addBattleHypothesis } from '../src/battle-memory.js';
// Separate fixture from test modules: importing a test would register its tests twice.
const seen = (version, hp = 50, phase = 'combat') => ({ versionKey: version, phase,
  guard: { instance_id: 'one', run_id: 'run-one', local_player_id: 'whale' }, state: {
    state_type: phase === 'combat' ? 'monster' : 'rewards', game_version: 'v0.107.1',
    player_count: 2, run: { act: 1, floor: 2, ascension: 0 },
    player: { hp, max_hp: 80, energy: 2, block: 0, character: 'IRONCLAD', deck: [{ id: 'STRIKE_IRONCLAD' }], hand: [] },
    battle: { round: 1, enemies: [{ entity_id: 'enemy_0', hp: 10, block: 0 }] } } });

test('battle facts survive reload, record enemy turn HP changes and only confirmed local potion use', () => {
  const book = loadBattleMemory();
  observeBattle(book, seen('v1'), 100);
  observeBattle(book, seen('v2', 44), 110);
  recordDecision(book, seen('v2', 44), { action: 'use_potion', slot: 0 }, {
    status: 'effect_observed', actionId: 'a1', observation: seen('v3', 48) }, 120);
  const restored = loadBattleMemory(JSON.parse(JSON.stringify(book)));
  observeBattle(restored, seen('v4', 42), 130);
  observeBattle(restored, seen('v5', 42, 'rewards'), 140);
  const battle = restored.battles[0];
  assert.equal(restored.active, null);
  assert.equal(battle.observedNetHpDecrease, 12);
  assert.equal(battle.observedNetHpIncrease, 4);
  assert.equal(battle.potionUsesConfirmed, 1);
  assert.equal(battle.outcome, 'rewards-observed');
  assert.equal(battle.decisions[0].evidence, 'guard-effect-observed');
  assert.match(battle.decisions[0].attribution, /队友/);
});

test('reviews remain unverified and similar retrieval rejects incompatible versions, difficulty, character and team size', () => {
  const book = loadBattleMemory();
  observeBattle(book, seen('v1'), 100); observeBattle(book, seen('v2', 45, 'rewards'), 110);
  const hypothesis = addBattleHypothesis(book, book.battles[0].id, '可能应先打防御');
  assert.equal(hypothesis.verified, false); assert.equal(hypothesis.weight, 'unverified');
  assert.equal(similarBattles(book, seen('v3')).length, 1);
  for (const field of ['version', 'character', 'team', 'difficulty']) {
    const other = seen('v4');
    if (field === 'version') other.state.game_version = 'v0.111.0';
    if (field === 'character') other.state.player.character = 'SILENT';
    if (field === 'team') other.state.player_count = 1;
    if (field === 'difficulty') other.state.run.ascension = 1;
    assert.deepEqual(similarBattles(book, other), []);
  }
});

test('ready and enemy-turn phases remain the SAME battle; the live run metadata scopes rooms', () => {
  const book = loadBattleMemory();
  observeBattle(book, seen('v1'), 100);
  const ready = seen('v2'); ready.phase = 'ready';
  observeBattle(book, ready, 110);
  const enemy = seen('v3', 43); enemy.phase = 'enemy';
  observeBattle(book, enemy, 120);
  assert.equal(book.battles.length, 0);
  assert.equal(book.active.observedNetHpDecrease, 7);
  const selection = seen('v4', 43); selection.state.state_type = 'card_select'; selection.phase = 'card_select';
  selection.state.combat_in_progress = true;
  observeBattle(book, selection, 130);
  assert.equal(book.battles.length, 0);
  assert.equal(book.active.floor, 2);
  const ending = seen('ending', 43); ending.state.combat_in_progress = false; ending.phase = 'wait_for_player';
  observeBattle(book, ending, 135);
  assert.equal(book.battles.length, 0, 'combat room fading into rewards must not create an unresolved battle');
  observeBattle(book, seen('v5', 43, 'rewards'), 140);
  assert.equal(book.battles[0].outcome, 'rewards-observed');
});

test('identity changes close unresolved battles, repeated versions do not double-count, and decisions are bounded', () => {
  const book = loadBattleMemory();
  observeBattle(book, seen('v1'), 100);
  observeBattle(book, seen('v1', 2), 101);
  assert.equal(book.active.observedNetHpDecrease, 0);
  for (let i = 0; i < 40; i++) recordDecision(book, seen(`a${i}`), { action: 'play_card', card_index: 0 },
    { status: 'effect_observed', actionId: `action${i}`, observation: seen(`b${i}`) }, 102 + i);
  assert.equal(book.active.decisions.length, 32);
  const newRun = seen('new'); newRun.guard.run_id = 'run-two';
  observeBattle(book, newRun, 200);
  assert.equal(book.battles[0].outcome, 'identity-or-room-changed');
  assert.equal(book.active.runId, 'run-two');
});
