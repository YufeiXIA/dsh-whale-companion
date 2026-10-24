import test from 'node:test';
import assert from 'node:assert/strict';
import { chatAnimations, chatAnimationHint, searchChatAnimations, selectChatAnimation } from '../src/chat-animation.js';

test('retrieval uses all installed clips and finds the three requested topics', () => {
  assert.equal(chatAnimations.length, 164);
  for (const [text, id] of [
    ['你会不会开车呀', 'companion/racing_turn'],
    ['该吃饭了，大肥鱼', 'food/eating_rice'],
    ['大肥鱼，我喜欢你', 'clicks/shy_surprise'],
    ['一起涮火锅好不好', 'food/eating_hotpot'],
    ['早饭准备好了', 'food/eating_breakfast'],
    ['你看这辆玩具车', 'games/playing_with_a_toy_car'],
    ['给我拉一段小提琴', 'music/playing_the_violin'],
    ['过端午，来吃粽子', 'festivals/eating_zongzi']
  ]) assert.equal(searchChatAnimations(text)[0]?.id, id, text);
});

test('semantic choice stays independent of voice emotion and unknown assets are rejected', () => {
  assert.equal(selectChatAnimation('带我兜兜风吧', 'companion/racing_turn'), 'companion/racing_turn');
  assert.equal(selectChatAnimation('开车', 'none'), null);
  assert.equal(selectChatAnimation('开车', '../../secrets'), null);
  assert.equal(selectChatAnimation('开车', 'roleplay/not_installed'), null);
  assert.equal(selectChatAnimation('你会开车吗'), 'companion/racing_turn');
  assert.equal(selectChatAnimation('这道方程的解是什么'), null);
  assert.equal(selectChatAnimation('我不喜欢你'), null);
  assert.notEqual(selectChatAnimation('我喜欢赛车'), 'clicks/shy_surprise');
});

test('hints use the current message, without replaying previous chat themes', () => {
  const hint = chatAnimationHint([{ content: '我喜欢你' }, { content: '该吃饭了' }]);
  assert.equal(hint.candidates[0].id, 'food/eating_rice');
  assert.equal(hint.candidates.some(item => item.id === 'clicks/shy_surprise'), false);
  assert.equal(chatAnimationHint([]), null);
});
