import test from 'node:test';
import assert from 'node:assert/strict';
import { meaningfulConversation, rememberPreference, conversationContext, conversationMode } from '../src/conversation.js';

test('calibration pairs stay out of conversational memory; ordinary conversation resumes', () => {
  const messages = [
    { role: 'user', text: '连接测试，我喜欢一句话' },
    { role: 'assistant', text: '我在，不碰游戏' },
    { id: 'real', role: 'user', text: '我喜欢你直接说想法，不用老反问' },
    { role: 'assistant', text: '好，我也有话直说。', spoken: true },
    { role: 'assistant', text: '重复的详情', detail: true }
  ];
  assert.equal(meaningfulConversation(messages).length, 2);
  const memory = { preferences: [], events: [] };
  for (const message of messages) rememberPreference(memory, message);
  assert.deepEqual(memory.preferences, [{ id: 'real', text: messages[2].text }]);
  assert.deepEqual(conversationContext(messages, memory).recently_spoken, ['好，我也有话直说。']);
});

test('preference excerpts are bounded and keep source ids and the latest conflicting statement', () => {
  const memory = { preferences: [], events: [] };
  for (let i = 0; i < 20; i++) rememberPreference(memory, { id: String(i), role: 'user', text: '我喜欢短句' });
  rememberPreference(memory, { id: 'latest', role: 'user', text: '我不喜欢短句了，可以详细解释' });
  assert.equal(memory.preferences.length, 8);
  assert.equal(memory.preferences.at(-1).id, 'latest');
  assert.match(conversationContext([], memory).note, /较新/);
});

test('presentation modes separate casual chat, tactics, debugging and autonomous gameplay', () => {
  for (const [content, expected] of [['小肥鱼饿不饿', 'chat'], ['这轮怎么打', 'tactics'], ['查一下报错日志', 'debug']]) {
    assert.equal(conversationMode({ messages: [{ content }] }), expected);
  }
  assert.equal(conversationMode({ messages: [] }), 'gameplay');
});
