import test from 'node:test';
import assert from 'node:assert/strict';
import { decisionBudget } from '../src/decision-budget.js';

test('strategic choices get a larger budget and casual chat immediately returns to normal', () => {
  const game = { messages: [] };
  const boss = { phase: 'combat', state: { state_type: 'boss', player: { hp: 50, max_hp: 80 } } };
  assert.equal(decisionBudget(game, boss).reasoningEffort, 'high');
  assert.equal(decisionBudget(game, boss).maxTokens, 6000);
  assert.equal(decisionBudget({ messages: [{ content: '今天吃什么呀' }] }, boss).reasoningEffort, 'low');
  assert.equal(decisionBudget(game, { phase: 'combat', state: { state_type: 'monster' } }).maxTokens, 3000);
  assert.equal(decisionBudget(game, { phase: 'map', state: { state_type: 'map', map: { next_options: [1, 2] } } }).reasoningEffort, 'high');
});
