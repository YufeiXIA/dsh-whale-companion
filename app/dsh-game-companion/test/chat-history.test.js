import test from 'node:test';
import assert from 'node:assert/strict';
import { searchHistory, readHistory, historyContext, recoverUserHistory } from '../src/chat-history.js';
import { conversationContext } from '../src/conversation.js';
import { loadPersonalMemory, editPersonalMemory, forgetPersonalMemory } from '../src/personal-memory.js';

const user = (id, text, at = 1) => ({ id, role: 'user', text, at });
const conversation = (messages, sessionId = 'old') => ({ sessionId, messages, createdAt: 1 });

test('early facts survive long chats and semantic topic variants, with exact source attribution', () => {
  const messages = [user('school', '我在青禾大学读计算机博士。')];
  for (let i = 0; i < 140; i++) messages.push(user(`filler${i}`, `今天散步经过了第${i}条街`, i + 2));
  const chats = [conversation(messages), conversation([user('now', '还记得我的学历吗？', 200)], 'new')];
  const memory = loadPersonalMemory();
  const context = historyContext(chats, memory, 'new', '还记得我的学历吗？', ['now']);
  assert.equal(context.recalled[0].message_id, 'school');
  assert.equal(context.recalled[0].session_id, 'old');
  assert.equal(context.recalled[0].role, 'user');
  assert.match(context.recalled[0].text, /青禾大学/);
  assert.equal(searchHistory(chats, memory, { query: '学历', sessionId: 'new', excludeIds: ['now'] }).length, 0);
  assert.equal(searchHistory(chats, memory, { query: '银河飞船' }).length, 0);
});

test('long original messages can be retrieved in bounded pages without losing their later details', () => {
  const text = '前文'.repeat(900) + '我的小猫叫栗子' + '后文'.repeat(900);
  const chats = [conversation([user('long', text)])];
  const [hit] = searchHistory(chats, null, { query: '栗子' });
  assert.match(hit.text, /栗子/); assert.equal(hit.truncated, true); assert.ok(hit.text.length <= 700);
  let offset = 0, recovered = '';
  do {
    const page = readHistory(chats, null, { session_id: 'old', message_id: 'long', offset });
    recovered += page.text; offset = page.next_offset;
  } while (offset !== null);
  assert.equal(recovered, text);
  assert.equal(readHistory(chats, null, { session_id: 'foreign', message_id: 'long' }).found, false);
});

test('withdrawals exclude old facts and their replies across retrieval, recent context and restart', () => {
  let memory = loadPersonalMemory();
  const messages = [user('a', '我在青禾大学读博士', 1),
    { id: 'b', role: 'assistant', text: '那你应该熟悉校园吧。', at: 2 }, user('c', '今天吃了面条', 3)];
  editPersonalMemory(memory, user('f', '忘记我的学历', 4));
  memory = loadPersonalMemory(JSON.parse(JSON.stringify(memory)));
  const chats = [conversation(messages)];
  assert.deepEqual(searchHistory(chats, memory, { query: '大学 校园' }), []);
  assert.equal(readHistory(chats, memory, { session_id: 'old', message_id: 'a' }).found, false);
  assert.deepEqual(conversationContext(messages, undefined, memory).recent.map(m => m.id), ['c']);
  messages.push(user('new', '我现在在青禾大学工作', 5));
  assert.equal(searchHistory(chats, memory, { query: '青禾大学' })[0].message_id, 'new');
});

test('corrected preferences and legacy deletions are not resurrected from old chats', () => {
  let memory = loadPersonalMemory();
  const old = user('a', '以后请叫我阿明', 1), latest = user('b', '以后请叫我小夏', 2);
  editPersonalMemory(memory, old); editPersonalMemory(memory, latest);
  const chats = [conversation([old]), conversation([latest], 'new')];
  assert.equal(searchHistory(chats, memory, { query: '阿明' }).length, 0);
  assert.equal(searchHistory(chats, memory, { query: '小夏' }).length, 1);
  forgetPersonalMemory(memory, latest.text, { at: 3 });
  assert.equal(searchHistory(chats, memory, { query: '小夏' }).length, 0);
  memory = loadPersonalMemory({ version: 1, revision: 3, entries: [] });
  assert.equal(searchHistory(chats, memory, { query: '阿明 小夏' }).length, 0);
});

test('forget-all preferences keeps ordinary events, forget-all memory excludes all earlier recall', () => {
  const memory = loadPersonalMemory(), preference = user('a', '我喜欢蓝莓', 1);
  editPersonalMemory(memory, preference);
  const messages = [preference, user('b', '昨天去了海边', 2)];
  editPersonalMemory(memory, user('c', '忘记所有偏好', 3));
  assert.equal(searchHistory([conversation(messages)], memory, { query: '海边' }).length, 1);
  editPersonalMemory(memory, user('d', '忘记所有记忆', 4));
  assert.equal(searchHistory([conversation(messages)], memory, { query: '海边' }).length, 0);
});

test('legacy delivery recovery preserves known originals, avoids duplicate IDs and invents no dates', () => {
  const recent = [user('b', '原消息和图片说明'), { id: 'c', role: 'assistant', text: '回应', at: 3 }];
  const delivery = [{ id: 'a', text: '早先的本科经历' }, { id: 'b', text: '原消息' }];
  const restored = recoverUserHistory(recent, delivery);
  assert.deepEqual(restored.map(m => m.id), ['a', 'b', 'c']);
  assert.equal(restored[0].at, null); assert.equal(restored[1], recent[0]);
  assert.deepEqual(recoverUserHistory(restored, delivery), restored);
});

test('calibration stays excluded, assistant claims stay labeled and recent context remains bounded', () => {
  const messages = [user('cal', '连接测试，我住在火星'), { id: 'cal-answer', role: 'assistant', text: '火星你好' },
    user('real', '昨天去散步'), { id: 'guess', role: 'assistant', text: '你可能喜欢蓝色。' }];
  assert.equal(searchHistory([conversation(messages)], null, { query: '火星' }).length, 0);
  assert.equal(searchHistory([conversation(messages)], null, { query: '蓝色' })[0].role, 'assistant');
  for (let i = 0; i < 100; i++) messages.push(user(`long${i}`, '字'.repeat(2000), i + 5));
  const recent = conversationContext(messages).recent;
  assert.ok(recent.length <= 16 && recent.length > 6);
  assert.ok(recent.reduce((sum, m) => sum + m.text.length, 0) <= 10000);
  assert.ok(recent.at(-1).truncated);
});

test('questions about preferences are not stored as new facts', () => {
  const memory = loadPersonalMemory();
  editPersonalMemory(memory, user('q', '你记得我喜欢什么吗？'));
  assert.deepEqual(memory.entries, []);
});
