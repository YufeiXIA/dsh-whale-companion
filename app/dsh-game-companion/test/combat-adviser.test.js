import test from 'node:test';
import assert from 'node:assert/strict';
import { adviseCombat } from '../src/combat-adviser.js';

export function scene({ hp = 30, energy = 2, enemyHp = 12, incoming = 12, block = 0, playerCount = 1 } = {}) {
  return { versionKey: 'v1', phase: 'combat', actionable: true, availableActions: ['play_card', 'end_turn'],
    guard: { instance_id: 'instance', run_id: 'run', local_player_id: 'whale' }, state: {
      game_version: 'v0.107.1', state_type: 'monster', player_count: playerCount, players: [],
      game: { act: 1, floor: 2, ascension: 0 },
      player: { character: 'IRONCLAD', hp, max_hp: 80, block, energy, status: [], potions: [], relics: [],
        deck: [{ id: 'STRIKE_IRONCLAD' }, { id: 'DEFEND_IRONCLAD' }], hand: [0, 1, 2].map(index => ({ index,
          id: index === 2 ? 'DEFEND_IRONCLAD' : 'STRIKE_IRONCLAD', cost: '1', star_cost: '0', can_play: true,
          target_type: index === 2 ? 'Self' : 'AnyEnemy', adviser_rule: index === 2 ? 'self_block' : 'single_attack',
          dynamic_vars: index === 2 ? { Block: 5 } : { Damage: 6 } })) },
      battle: { round: 1, enemies: [{ entity_id: 'enemy_0', hp: enemyHp, block: 0, status: [],
        intents: [{ type: 'Attack', label: String(incoming) }] }] } } };
}

test('candidate search finds a two-card kill and removes its incoming pressure', () => {
  const result = adviseCombat(scene(), { timeMs: 40 });
  const first = result.candidates[0];
  assert.equal(first.actions.length, 2);
  assert.ok(first.actions.every(action => action.card_index < 2));
  assert.deepEqual(first.predicted.enemyHp, [0]);
  assert.equal(first.predicted.netHpLossIfNoOtherEffects, 0);
  assert.equal(result.observationVersion, 'v1');
  assert.ok(result.searchedNodes <= 512);
});

test('preventing death outranks nonlethal damage; excess block does not beat useful damage', () => {
  const danger = adviseCombat(scene({ hp: 8, enemyHp: 40 }), { timeMs: 40 });
  assert.ok(danger.candidates[0].actions.some(action => action.card_index === 2));
  const defended = adviseCombat(scene({ enemyHp: 40, block: 12 }), { timeMs: 40 });
  assert.ok(defended.candidates[0].actions.every(action => action.card_index !== 2));
});

test('version mismatch and unsupported modifiers abstain; unsupported cards and co-op stay explicit', () => {
  const changed = scene(); changed.state.game_version = 'v0.111.0';
  assert.deepEqual(adviseCombat(changed).candidates, []);
  const powered = scene(); powered.state.player.status = [{ id: 'STRENGTH', amount: 2 }];
  assert.deepEqual(adviseCombat(powered).candidates, []);
  const uncovered = scene(); uncovered.state.player.hand.forEach(card => { card.adviser_rule = null; });
  assert.deepEqual(adviseCombat(uncovered).candidates, [], 'unsupported hands cannot become an apparent end-turn recommendation');
  powered.state.player.status = []; powered.state.player.relics = [{ id: 'PEN_NIB' }];
  assert.deepEqual(adviseCombat(powered).candidates, []);
  const partial = scene({ playerCount: 2 }); partial.state.player.hand[2].adviser_rule = null;
  const result = adviseCombat(partial, { timeMs: 40 });
  assert.equal(result.unsupportedCards.length, 1);
  assert.equal(result.candidates[0].predicted.netHpLossIfNoOtherEffects, null);
  assert.match(result.limitations.join(' '), /多人/);
  partial.state.players = [{ status: [], relics: [] }, { status: [{ id: 'TEAM_POWER' }], relics: [] }];
  assert.deepEqual(adviseCombat(partial).candidates, [], 'known teammate modifiers also invalidate primitive search');
});

test('advice neither mutates the snapshot nor consumes hidden random/order data and respects a node cap', () => {
  const base = scene(), saved = structuredClone(base);
  const one = adviseCombat(base, { maxNodes: 1, timeMs: 40 });
  assert.equal(one.searchedNodes, 1); assert.equal(one.truncated, true);
  assert.deepEqual(base, saved);
  const first = adviseCombat(base, { timeMs: 40 });
  base.state.rng = { next: 100 }; base.state.player.draw_pile = [{ id: 'UNSEEN' }];
  assert.deepEqual(adviseCombat(base, { timeMs: 40 }).candidates, first.candidates);
});
