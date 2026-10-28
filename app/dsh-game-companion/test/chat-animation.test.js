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
  assert.equal(hint.catalog.length, chatAnimations.length);
  assert.ok(hint.catalog.some(item=>item.id==='music/playing_the_violin'&&item.meaning));
  assert.equal(hint.candidates[0].id, 'food/eating_rice');
  assert.equal(hint.candidates.some(item => item.id === 'clicks/shy_surprise'), false);
  assert.equal(chatAnimationHint([]), null);
});

test('recent real reply choices guide variety for direct and proactive replies without replaying topics',()=>{
  const history=[{role:'user',text:'私人内容'},...Array.from({length:6},(_,i)=>({role:'assistant',animation:'companion/hold_thought',emotion:'neutral',tone:i%2?'curious':'thoughtful',text:'不需要外带的正文'})),{role:'assistant',detail:true,animation:'food/eating_rice'}];
  const hint=chatAnimationHint([{content:'我们来聊聊音乐'}],history);
  assert.equal(hint.recent.length,4);assert.equal(hint.recent.some(item=>item.animation==='food/eating_rice'),false);
  assert.equal(JSON.stringify(hint).includes('私人内容'),false);assert.equal(JSON.stringify(hint).includes('不需要外带的正文'),false);
  assert.match(hint.variety,/语义准确优先/);
  assert.equal(chatAnimationHint([],history).recent.length,4);
});
