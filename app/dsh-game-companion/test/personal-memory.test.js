import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPersonalMemory, editPersonalMemory, personalContext } from '../src/personal-memory.js';

function user(id, text) { return { id, role: 'user', text, at: Number(id) || 100 }; }

test('explicit preferences survive reload and a newer correction replaces the old topic', () => {
  const memory = loadPersonalMemory();
  editPersonalMemory(memory, user('1', '以后请叫我阿明'), 'old-chat');
  editPersonalMemory(memory, user('2', '以后请叫我小夏'), 'new-chat');
  const restored = loadPersonalMemory(JSON.parse(JSON.stringify(memory)));
  assert.equal(restored.entries.length, 1);
  assert.equal(restored.entries[0].text, '以后请叫我小夏');
  assert.equal(restored.entries[0].sourceSession, 'new-chat');
});

test('forgetting survives migration and does not adopt assistant claims or calibration', () => {
  const messages = [user('1', '我喜欢蓝莓'), user('2', '忘记我喜欢蓝莓'),
    { id: '3', role: 'assistant', text: '你喜欢草莓' }, user('4', '连接测试，我喜欢短句')];
  const memory = loadPersonalMemory(undefined, [{ messages }]);
  assert.deepEqual(memory.entries, []);
  assert.deepEqual(loadPersonalMemory(memory, [{ messages: [messages[0]] }]).entries, []);
  editPersonalMemory(memory, user('5', '记住：周末喜欢合作游戏'));
  assert.equal(memory.entries.length, 1);
  editPersonalMemory(memory, user('6', '忘记所有偏好'));
  assert.deepEqual(personalContext(memory).entries, []);
});

test('memory remains bounded and invalid saved data is not silently overwritten', () => {
  const memory = loadPersonalMemory();
  for (let i = 0; i < 60; i++) editPersonalMemory(memory, user(String(i), `我喜欢食物${i}`));
  assert.equal(memory.entries.length, 24);
  assert.ok(JSON.stringify(personalContext(memory)).length < 5000);
  assert.throws(() => loadPersonalMemory({ entries: [] }), /Invalid personal memory/);
});

test('appended response instructions cannot change a remembered topic or a forget command', () => {
  const memory = loadPersonalMemory();
  editPersonalMemory(memory, user('1', '记住：我希望关键选择先和我商量。只文字回复，不播放语音。'));
  assert.equal(memory.entries[0].topic, '合作方式');
  assert.equal(memory.entries[0].text, '记住：我希望关键选择先和我商量');
  editPersonalMemory(memory, user('2', '忘记合作方式。只文字回复，不播放语音。'));
  assert.deepEqual(memory.entries, []);
});
