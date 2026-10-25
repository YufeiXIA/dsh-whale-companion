import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings, mergeSettings, visionRoute } from '../host/settings.mjs';
import { chatCompletion, parseReply } from '../host/llm.mjs';
import { audioUrl, spokenText } from '../host/voice.mjs';
import { LiteHost } from '../host/host.mjs';
import { startServer } from '../host/server.mjs';

function memorySecrets() {
  const values = new Map();
  return { get: name => values.get(name) ?? null, hint: name => (values.has(name) ? `···${values.get(name).slice(-4)}` : null),
    set: (name, value) => (value === null ? values.delete(name) : values.set(name, value)) };
}

async function withHost(fetchApi, run) {
  const dataDir = await mkdtemp(join(tmpdir(), 'whale-lite-'));
  const host = new LiteHost({ dataDir, secrets: memorySecrets(), persona: '你是大肥鱼。', fetchApi });
  await host.initialize();
  try { await run(host); } finally { await host.save(); await rm(dataDir, { recursive: true, force: true }); }
}

const idle = async host => { while (host.busy || host.pending) await new Promise(resolve => setTimeout(resolve, 5)); };

test('settings switch presets, keep https, and route vision through chat by default', () => {
  const next = mergeSettings(defaultSettings(), { chat: { preset: 'qwen' } });
  assert.equal(next.chat.baseUrl, 'https://dashscope.aliyuncs.com/compatible-mode/v1');
  assert.throws(() => mergeSettings(next, { chat: { baseUrl: 'http://example.com/v1' } }), /https/);
  assert.equal(mergeSettings(next, { chat: { baseUrl: 'http://127.0.0.1:8080/v1/' } }).chat.baseUrl, 'http://127.0.0.1:8080/v1');
  const secrets = memorySecrets(); secrets.set('chatKey', 'sk-chat');
  assert.deepEqual(visionRoute(next, secrets), { baseUrl: next.chat.baseUrl, model: 'qwen-plus', key: 'sk-chat' });
  // A separate vision endpoint never receives the chat key.
  assert.equal(visionRoute(mergeSettings(next, { vision: { baseUrl: 'https://vision.example/v1' } }), secrets).key, null);
});

test('replies are parsed from fenced JSON or kept as plain text', () => {
  assert.equal(parseReply('```json\n{"text":"在呢","emotion":"happy_hop"}\n```').emotion, 'happy_hop');
  assert.deepEqual(parseReply('就是普通一句话'), { text: '就是普通一句话' });
  assert.equal(audioUrl('http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/a.wav?x=1'), 'https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/a.wav?x=1');
  assert.throws(() => audioUrl('http://evil.example/a.wav'));
  assert.equal(spokenText('第一句。'.repeat(40)).length <= 90, true);
});

test('a chat message gets one reply with emotion and animation, and keys stay out of the state', async () => {
  const calls = [];
  const fetchApi = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), auth: init.headers.authorization });
    return Response.json({ choices: [{ message: { content: '{"text":"嗯……在呢，饭也在。","animation":"food/eating_rice","emotion":"happy_hop","spoken":true}' } }] });
  };
  await withHost(fetchApi, async host => {
    assert.equal(host.status().lite.ready, false);
    await host.control({ action: 'lite-settings', chat: { preset: 'custom', baseUrl: 'http://127.0.0.1:9/v1', model: 'mock' }, keys: { chatKey: 'sk-test-1234' } });
    const state = host.status();
    assert.equal(state.lite.ready, true);
    assert.equal(state.lite.chat.keyHint, '···1234');
    assert.doesNotMatch(JSON.stringify(state), /sk-test/);
    await host.control({ action: 'chat', text: '记住：叫我小鱼' });
    await idle(host);
    const reply = host.status().messages.at(-1);
    assert.equal(reply.role, 'assistant');
    assert.equal(reply.emotion, 'happy_hop');
    assert.equal(reply.animation, 'food/eating_rice');
    assert.equal(calls[0].url, 'http://127.0.0.1:9/v1/chat/completions');
    assert.equal(calls[0].auth, 'Bearer sk-test-1234');
    assert.match(calls[0].body.messages[0].content, /叫我小鱼/);
    assert.equal(host.status().personalMemory.entries.length, 1);
  });
});

test('DeepSeek is asked not to think first; a reply lost to thinking gets a clear hint', async () => {
  const bodies = [];
  const fetchApi = async (url, init) => {
    bodies.push(JSON.parse(init.body));
    return Response.json({ choices: [{ finish_reason: 'length', message: { content: '', reasoning_content: '嗯，用户让我回复……' } }] });
  };
  const call = baseUrl => chatCompletion({ baseUrl, model: 'm', key: 'k', json: false, fetchApi, messages: [{ role: 'user', content: '在吗' }] });
  await assert.rejects(call('https://api.deepseek.com'), /思考/);
  assert.deepEqual(bodies[0].thinking, { type: 'disabled' });
  await assert.rejects(call('https://api.moonshot.cn/v1'), /思考/);
  assert.equal(bodies[1].thinking, undefined);
});

test('深度思考 is off by default and, when on, only applies to answering the user', async () => {
  assert.equal(defaultSettings().chat.thinking, false);
  assert.throws(() => mergeSettings(defaultSettings(), { chat: { thinking: 'yes' } }), /深度思考/);
  const bodies = [];
  const fetchApi = async (url, init) => {
    bodies.push(JSON.parse(init.body));
    return Response.json({ choices: [{ message: { content: '{"text":"想好了。","emotion":"neutral","animation":"none"}' } }] });
  };
  await withHost(fetchApi, async host => {
    await host.control({ action: 'lite-settings', chat: { thinking: true }, keys: { chatKey: 'sk-test-1234' } });
    assert.equal(host.status().lite.chat.thinking, true);
    await host.control({ action: 'chat', text: '帮我推一下这个式子' });
    await idle(host);
    assert.deepEqual(bodies.at(-1).thinking, { type: 'enabled' });
    assert.equal(bodies.at(-1).max_tokens, 6000);
    await host.control({ action: 'lite-test', target: 'chat' });
    assert.deepEqual(bodies.at(-1).thinking, { type: 'disabled' });
  });
});

test('a missing key becomes a friendly error instead of a reply', async () => {
  await withHost(async () => { throw new Error('should not be called'); }, async host => {
    await host.control({ action: 'chat', text: '在吗' });
    await idle(host);
    assert.match(host.status().error, /API Key/);
  });
});

test('the server needs the session cookie and the control header', async () => {
  await withHost(fetch, async host => {
    const server = await startServer(host, { petDir: tmpdir() });
    try {
      const cookie = `whale_companion=${server.token}`;
      assert.equal((await fetch(new URL('/game-companion/state', server.base))).status, 401);
      const view = await fetch(new URL('/game-companion/view', server.base), { headers: { cookie } });
      const html = await view.text();
      assert.match(html, /<html lang="zh-CN" data-lite>/);
      assert.match(html, /<title>大肥鱼<\/title>/);
      const plain = await fetch(new URL('/game-companion/control', server.base), { method: 'POST', headers: { cookie }, body: '{}' });
      assert.equal(plain.status, 403);
      const art = await fetch(new URL('/game-companion/art/portrait.png', server.base), { headers: { cookie } });
      assert.equal(art.headers.get('content-type'), 'image/png');
      const clip = await fetch(new URL('/game-companion/animations/relieved.webm', server.base), { headers: { cookie } });
      assert.equal(clip.headers.get('content-type'), 'video/webm');
    } finally { await server.close(); }
  });
});
