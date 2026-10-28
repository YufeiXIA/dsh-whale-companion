// Proactive chat, screen vision, voice and conversations, end to end through LiteHost
// with stand-in chat, vision and speech services and a controllable clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LiteHost } from '../host/host.mjs';
import { startServer } from '../host/server.mjs';
import { EMOTION_PRESETS, EMOTION_PREVIEW_TEXT, emotionDelivery } from '../../app/dsh-game-companion/src/voice.js';
import { toneDelivery } from '../../app/dsh-game-companion/src/voice-tones.js';

const chatBase = 'https://llm.test/v1', voiceEndpoint = 'https://voice.test/api/tts';
const audioLink = 'http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/clip.wav?Expires=1';
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3, 0xff, 0xd9]).toString('base64');

function memorySecrets() {
  const values = new Map();
  return { get: name => values.get(name) ?? null, hint: name => (values.has(name) ? `···${values.get(name).slice(-4)}` : null),
    set: (name, value) => (value === null ? values.delete(name) : values.set(name, value)) };
}

function clock() {
  let t = Date.UTC(2026, 9, 25, 2);
  const now = () => t;
  now.tick = ms => { t += ms; };
  return now;
}

function wavWithPlaceholderSizes() {
  const wav = Buffer.alloc(48);
  wav.write('RIFF', 0, 'ascii'); wav.writeUInt32LE(0xffffffff, 4); wav.write('WAVE', 8, 'ascii');
  wav.write('data', 36, 'ascii'); wav.writeUInt32LE(0xffffffff, 40);
  return wav;
}

// `reply` answers chat calls (may be async); vision calls get a fixed screen summary.
function services({ reply = () => ({ text: '嗯，在呢。', emotion: 'neutral', animation: 'none', spoken: true }), voiceStatus = 200 } = {}) {
  const calls = [];
  const fetchApi = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, auth: init.headers?.authorization, body });
    if (url.endsWith('/chat/completions')) {
      const vision = body.messages.some(message => Array.isArray(message.content));
      const content = vision ? { summary: '屏幕上是代码编辑器，打开着 main.cjs。', sensitive: false } : await reply(body);
      return Response.json({ choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }] });
    }
    if (url === voiceEndpoint) {
      return voiceStatus === 200 ? Response.json({ output: { audio: { url: audioLink } } }) : new Response('{}', { status: voiceStatus });
    }
    if (url === audioLink.replace('http:', 'https:')) return new Response(wavWithPlaceholderSizes());
    return new Response('{}', { status: 404 });
  };
  return { fetchApi, calls, chats: () => calls.filter(call => call.url === `${chatBase}/chat/completions` && !call.body.messages.some(m => Array.isArray(m.content))) };
}

async function setup(t, { fetchApi, now = clock(), secrets = memorySecrets(), dataDir } = {}) {
  dataDir ??= await mkdtemp(join(tmpdir(), 'whale-lite-'));
  const host = new LiteHost({ dataDir, secrets, persona: '你是大肥鱼。', fetchApi, now });
  await host.initialize();
  await host.control({ action: 'lite-settings', chat: { preset: 'custom', baseUrl: chatBase, model: 'mock-chat' },
    voice: { endpoint: voiceEndpoint }, keys: { chatKey: 'sk-chat-1111', voiceKey: 'sk-voice-2222' } });
  t.after(async () => { await host.save(); await rm(dataDir, { recursive: true, force: true }); });
  return { host, now, secrets, dataDir };
}

const idle = async host => { while (host.busy || host.pending) await new Promise(resolve => setTimeout(resolve, 2)); };
const sample = (extra = {}) => ({ available: true, app: 'code', idleMs: 0, contextKey: 1, captureSupported: false, background: [], ...extra });

// Samples every 10 s, as the overlay does, until she decides to speak.
async function nextLine(host, now, extra) {
  for (let i = 0; i < 300; i++) {
    const result = await host.control({ action: 'ambient-sample', sample: sample(extra) });
    if (result.capture || host.ambient.result === 'thinking') return result;
    now.tick(10000);
  }
  throw new Error('she never spoke up');
}

const systemPrompt = call => call.body.messages[0].content;

test('proactive chat stays off until turned on', async t => {
  const { fetchApi, calls } = services();
  const { host, now } = await setup(t, { fetchApi });
  assert.equal(host.status().ambient.enabled, false);
  for (let i = 0; i < 100; i++) { await host.control({ action: 'ambient-sample', sample: sample() }); now.tick(10000); }
  assert.equal(calls.length, 0);
  assert.equal(host.status().messages.length, 0);
});

test('she speaks up about the current app, then about an app opened in the background', async t => {
  const { fetchApi, chats } = services({ reply: () => ({ text: '还在写代码呀？我陪你。', emotion: 'listening_nod', animation: 'none', spoken: true }) });
  const { host, now } = await setup(t, { fetchApi });
  await host.control({ action: 'ambient-settings', enabled: true });
  const first = await nextLine(host, now);
  assert.equal(first.capture, undefined);
  await idle(host);
  const line = host.status().messages.at(-1);
  assert.equal(line.ambient, true);
  assert.equal(line.emotion, 'listening_nod');
  assert.match(systemPrompt(chats()[0]), /这次是你主动找用户说话/);
  assert.match(systemPrompt(chats()[0]), /"kind":"application","application":"代码编辑器"/);
  assert.equal(host.status().ambient.lastResult, 'said');
  assert.equal(host.status().ambient.quietUntil, now() + 5 * 60000);

  // The first list is the baseline; Steam opening afterwards becomes the next topic.
  await nextLine(host, now, { background: ['steam'] });
  await idle(host);
  const prompt = systemPrompt(chats()[1]);
  assert.match(prompt, /"kind":"background"/);
  assert.match(prompt, /"opened_in_background":"Steam"/);
  assert.equal(host.status().messages.filter(message => message.ambient).length, 2);
});

test('a message typed while she is thinking of a proactive line drops that line', async t => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const { fetchApi, chats } = services({ reply: async body => {
    if (/主动找用户说话/.test(body.messages[0].content)) { await held; return { text: '欸，你在干嘛？', emotion: 'neutral', animation: 'none' }; }
    return { text: '我在呢，你说。', emotion: 'neutral', animation: 'none' };
  } });
  const { host, now } = await setup(t, { fetchApi });
  await host.control({ action: 'ambient-settings', enabled: true });
  await nextLine(host, now);
  assert.equal(host.busy, true);
  await host.control({ action: 'chat', text: '在吗' });
  release();
  await idle(host);
  const messages = host.status().messages;
  assert.deepEqual(messages.map(message => [message.role, message.text]), [['user', '在吗'], ['assistant', '我在呢，你说。']]);
  assert.equal(chats().length, 2);
});

test('an empty proactive answer means she stays quiet', async t => {
  const { fetchApi } = services({ reply: () => ({ text: '' }) });
  const { host, now } = await setup(t, { fetchApi });
  await host.control({ action: 'ambient-settings', enabled: true });
  await nextLine(host, now);
  await idle(host);
  assert.equal(host.status().messages.length, 0);
  assert.equal(host.status().ambient.lastResult, 'quiet');
  assert.equal(host.status().error, null);
});

test('with vision on she looks once, and the summary reaches the proactive line', async t => {
  const { fetchApi, calls, chats } = services();
  const { host, now } = await setup(t, { fetchApi });
  await host.control({ action: 'ambient-settings', enabled: true, visionEnabled: true });
  const { capture } = await nextLine(host, now, { captureSupported: true });
  assert.ok(capture.ticket);
  assert.deepEqual(await host.desktopFrame({ ticket: 'wrong', jpeg, sourceApp: 'code' }), { accepted: false });
  assert.deepEqual(await host.desktopFrame({ ticket: capture.ticket, jpeg, sourceApp: 'code' }), { accepted: true, visual: true });
  await idle(host);
  const vision = calls.find(call => call.body?.messages?.some(message => Array.isArray(message.content)));
  assert.equal(vision.url, `${chatBase}/chat/completions`);
  assert.equal(vision.auth, 'Bearer sk-chat-1111');
  assert.equal(vision.body.model, 'mock-chat');
  assert.equal(vision.body.thinking, undefined);
  assert.match(systemPrompt(chats().at(-1)), /屏幕上是代码编辑器/);
  assert.equal(host.status().ambient.visionStatus, 'seen');
  assert.equal(host.status().messages.at(-1).ambient, true);
  // A used ticket cannot be replayed.
  assert.deepEqual(await host.desktopFrame({ ticket: capture.ticket, jpeg, sourceApp: 'code' }), { accepted: false });
});

test('a separate vision service gets only its own key, and none means no screenshot', async t => {
  const { fetchApi, calls } = services();
  const { host, now } = await setup(t, { fetchApi });
  await host.control({ action: 'lite-settings', vision: { baseUrl: 'https://vision.test/v1', model: 'mock-vision' } });
  await host.control({ action: 'ambient-settings', enabled: true, visionEnabled: true });
  const plain = await nextLine(host, now, { captureSupported: true });
  assert.equal(plain.capture, undefined);
  await idle(host);
  assert.equal(calls.some(call => call.url.startsWith('https://vision.test/')), false);

  await host.control({ action: 'lite-settings', keys: { visionKey: 'sk-vision-3333' } });
  const { capture } = await nextLine(host, now, { captureSupported: true });
  await host.desktopFrame({ ticket: capture.ticket, jpeg, sourceApp: 'browser' });
  await idle(host);
  const vision = calls.find(call => call.url === 'https://vision.test/v1/chat/completions');
  assert.equal(vision.auth, 'Bearer sk-vision-3333');
  assert.equal(vision.body.model, 'mock-vision');
});

test('a cancelled or unavailable screenshot never reaches the model', async t => {
  const { fetchApi, calls } = services();
  const { host, now } = await setup(t, { fetchApi });
  await host.control({ action: 'ambient-settings', enabled: true, visionEnabled: true });
  const { capture } = await nextLine(host, now, { captureSupported: true });
  await host.control({ action: 'vision-cancel' });
  assert.deepEqual(await host.desktopFrame({ ticket: capture.ticket, jpeg, sourceApp: 'code' }), { accepted: false });
  assert.equal(host.status().ambient.lastResult, 'quiet');

  const next = await nextLine(host, now, { captureSupported: true });
  assert.deepEqual(await host.desktopFrame({ ticket: next.capture.ticket, unavailable: true }), { accepted: true, visual: false });
  await idle(host);
  assert.equal(host.status().ambient.visionStatus, 'capture-unavailable');
  assert.equal(calls.some(call => call.body?.messages?.some(message => Array.isArray(message.content))), false);
  assert.equal(host.status().messages.at(-1).ambient, true);
});

test('the model picks a voice tone per reply and the voice speaks in it, turning on the last sentence', async t => {
  const replies = [{ text: '才没有等你。只是顺手。', emotion: 'neutral', tone: 'tsundere', tone_end: 'shy', animation: 'none', spoken: true },
    { text: '好。', emotion: 'neutral', tone: 'shouting_loudly', animation: 'none', spoken: true }];
  const { fetchApi, calls } = services({ reply: () => replies.shift() });
  const { host } = await setup(t, { fetchApi });
  await host.control({ action: 'chat', text: '我回来了' });
  await idle(host);
  const turned = host.status().messages.at(-1);
  assert.deepEqual([turned.tone, turned.toneEnd], ['tsundere', 'shy']);
  assert.match(calls[0].body.messages[0].content, /tone 按这句话当下的情绪选/);
  await host.speak({ messageId: turned.id });
  assert.equal(calls.at(-2).body.input.instruction, toneDelivery('tsundere', 'shy'));
  await host.control({ action: 'chat', text: '嗯' });
  await idle(host);
  assert.equal(host.status().messages.at(-1).tone, undefined, 'an unknown tone is dropped');
});

test('voice reads a reply in its emotion, caches it, and never sends the key to the audio link', async t => {
  const { fetchApi, calls } = services({ reply: () => ({ text: '才、才没有一直等你。', emotion: 'tsundere_pout', animation: 'none', spoken: true }) });
  const { host } = await setup(t, { fetchApi });
  await host.control({ action: 'chat', text: '我回来了' });
  await idle(host);
  const reply = host.status().messages.at(-1);
  const audio = await host.speak({ messageId: reply.id });
  assert.equal(audio.readUInt32LE(4), audio.length - 8);
  assert.equal(audio.readUInt32LE(40), audio.length - 44);
  const [request, download] = calls.filter(call => call.url !== `${chatBase}/chat/completions`);
  assert.equal(request.auth, 'Bearer sk-voice-2222');
  assert.deepEqual(request.body, { model: 'qwen-audio-3.1-tts-flash', input: { text: '才、才没有一直等你。', voice: 'longhua_v3.1',
    instruction: emotionDelivery('tsundere_pout'), format: 'wav', sample_rate: 24000 } });
  assert.equal(download.url, audioLink.replace('http:', 'https:'));
  assert.equal(download.auth, undefined);

  const before = calls.length;
  await host.speak({ messageId: reply.id });
  assert.equal(calls.length, before);
  // Changing the voice settings drops cached audio.
  await host.control({ action: 'lite-settings', voice: { voice: 'other_voice' } });
  await host.speak({ messageId: reply.id });
  assert.equal(calls.at(-2).body.input.voice, 'other_voice');
});

test('voice previews use the preset tones, and problems come back as plain hints', async t => {
  const { fetchApi, calls } = services();
  const { host } = await setup(t, { fetchApi });
  await host.speak({ emotionPreview: 'gentle' });
  assert.equal(calls.at(-2).body.input.text, EMOTION_PREVIEW_TEXT);
  assert.equal(calls.at(-2).body.input.instruction, EMOTION_PRESETS.gentle.delivery);
  await host.speak({ preview: true });
  await assert.rejects(host.speak({ emotionPreview: 'shouting' }), /不认识这个语气/);
  await assert.rejects(host.speak({ messageId: 'missing' }), /找不到这句话/);

  await host.control({ action: 'chat', text: '讲个长一点的' });
  await idle(host);
  const long = host.conversations[0].messages.at(-1);
  long.text = '这是很长的一句话。'.repeat(30);
  await host.speak({ messageId: long.id });
  assert.ok(calls.at(-2).body.input.text.length <= 90);

  const refused = services({ voiceStatus: 401 });
  const other = await setup(t, { fetchApi: refused.fetchApi });
  await assert.rejects(other.host.speak({ preview: true }), /语音 API Key 不对/);
  await other.host.control({ action: 'lite-settings', keys: { voiceKey: null } });
  await assert.rejects(other.host.speak({ preview: true }), /还没填语音的 API Key/);
});

test('the voice route returns wav audio, or a readable error', async t => {
  const { fetchApi } = services();
  const { host } = await setup(t, { fetchApi });
  const server = await startServer(host, { petDir: tmpdir() });
  t.after(() => server.close());
  const post = body => fetch(new URL('/game-companion/voice', server.base), { method: 'POST', body: JSON.stringify(body),
    headers: { cookie: `whale_companion=${server.token}`, 'x-companion-control': '1', 'content-type': 'application/json' } });
  const ok = await post({ preview: true });
  assert.equal(ok.headers.get('content-type'), 'audio/wav');
  assert.equal((await ok.arrayBuffer()).byteLength, 48);
  const missing = await post({ messageId: 'missing' });
  assert.equal(missing.status, 400);
  assert.deepEqual(await missing.json(), { error: '找不到这句话' });
});

test('conversations can be started, switched, renamed and deleted', async t => {
  const { fetchApi } = services();
  const { host } = await setup(t, { fetchApi });
  const firstId = host.status().sessionId;
  await host.control({ action: 'chat', text: '第一段的话' });
  await idle(host);
  await host.control({ action: 'new-conversation' });
  const secondId = host.status().sessionId;
  assert.notEqual(secondId, firstId);
  assert.equal(host.status().messages.length, 0);
  await host.control({ action: 'chat', text: '第二段的话' });
  await idle(host);
  assert.deepEqual(host.status().conversations.map(item => item.title).sort(), ['第一段的话', '第二段的话']);

  await host.control({ action: 'switch-conversation', sessionId: firstId });
  assert.equal(host.status().messages[0].text, '第一段的话');
  await host.control({ action: 'rename-conversation', sessionId: firstId, title: '周末计划' });
  assert.equal(host.status().conversations.find(item => item.sessionId === firstId).title, '周末计划');
  await assert.rejects(host.control({ action: 'rename-conversation', sessionId: firstId, title: '长'.repeat(41) }), /40 个字/);
  await assert.rejects(host.control({ action: 'switch-conversation', sessionId: 'missing' }), /找不到这段对话/);

  await host.control({ action: 'delete-conversation', sessionId: firstId });
  assert.equal(host.status().sessionId, secondId);
  await host.control({ action: 'delete-conversation', sessionId: secondId });
  assert.equal(host.status().conversations.length, 1);
  assert.equal(host.status().messages.length, 0);
});

test('conversations cannot change while she is still answering', async t => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const { fetchApi } = services({ reply: async () => { await held; return { text: '好了。' }; } });
  const { host } = await setup(t, { fetchApi });
  await host.control({ action: 'chat', text: '等我一下' });
  assert.equal(host.status().conversationBusy, true);
  await assert.rejects(host.control({ action: 'new-conversation' }), /还在回上一句/);
  release();
  await idle(host);
  assert.equal(host.status().messages.at(-1).text, '好了。');
});

test('settings, chats, memory and proactive settings survive a restart; memory can be forgotten', async t => {
  const { fetchApi } = services();
  const first = await setup(t, { fetchApi });
  await first.host.control({ action: 'chat', text: '记住：叫我小鱼' });
  await idle(first.host);
  await first.host.control({ action: 'rename-conversation', sessionId: first.host.sessionId, title: '称呼' });
  await first.host.control({ action: 'ambient-settings', enabled: true, intervalMinutes: 15 });
  await first.host.control({ action: 'reply-length', length: 'long' });
  await first.host.control({ action: 'speech-edit', enabled: false });
  await first.host.save();

  const again = new LiteHost({ dataDir: first.dataDir, secrets: first.secrets, persona: 'p', fetchApi, now: first.now });
  await again.initialize();
  const state = again.status();
  assert.equal(state.lite.chat.baseUrl, chatBase);
  assert.equal(state.lite.ready, true);
  assert.equal(state.conversations[0].title, '称呼');
  assert.equal(state.messages.length, 2);
  assert.equal(state.ambient.enabled, true);
  assert.equal(state.ambient.intervalMinutes, 15);
  assert.equal(state.replyLength, 'long');
  assert.equal(state.speechEdit, false);
  const [memory] = state.personalMemory.entries;
  assert.match(memory.text, /叫我小鱼/);
  await again.control({ action: 'forget-memory', id: memory.id });
  assert.equal(again.status().personalMemory.entries.length, 0);
});

test('what she calls the user is set from the panel, cleaned, sent with the time and kept across restart', async t => {
  const { fetchApi, chats } = services();
  const first = await setup(t, { fetchApi });
  assert.equal(first.host.status().userTitle, '你');
  await first.host.control({ action: 'user-title', title: ' 主人{{x}}\n【' });
  assert.equal(first.host.status().userTitle, '主人x');
  await first.host.control({ action: 'chat', text: '在吗' });
  await idle(first.host);
  const prompt = systemPrompt(chats().at(-1));
  assert.match(prompt, /当面叫用户时用「主人x」/);
  assert.match(prompt, /现在是 \d{4}年\d{1,2}月\d{1,2}日 \d{2}:\d{2} 周./);
  await first.host.control({ action: 'user-title', title: '' });
  assert.equal(first.host.status().userTitle, '你');
  await first.host.control({ action: 'user-title', title: '阿明' });

  const again = new LiteHost({ dataDir: first.dataDir, secrets: first.secrets, persona: 'p', fetchApi, now: first.now });
  await again.initialize();
  assert.equal(again.status().userTitle, '阿明');
});

test('the panel only gets the latest 100 messages', async t => {
  const { fetchApi } = services();
  const { host } = await setup(t, { fetchApi });
  host.current().messages.push(...Array.from({ length: 150 }, (_, i) => ({ id: String(i), role: 'user', text: `#${i}`, at: i })));
  assert.equal(host.status().messages.length, 100);
  assert.equal(host.status().messages[0].text, '#50');
});

test('a damaged state file is set aside instead of blocking startup', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'whale-lite-'));
  await writeFile(join(dataDir, 'state.json'), '{"conversations": [');
  const { fetchApi } = services();
  const { host } = await setup(t, { fetchApi, dataDir });
  assert.equal(host.status().conversations.length, 1);
  assert.ok((await readdir(dataDir)).some(name => name.startsWith('state.json.broken-')));
});

test('full transcripts survive restart and older cross-conversation evidence stays recallable', async t => {
  const { fetchApi, chats } = services();
  const { host, dataDir, secrets, now } = await setup(t, { fetchApi });
  host.current().messages.push({ id: 'education', role: 'user', text: '我在海洋大学读博士，研究鲸鱼。', at: now() });
  host.current().messages.push(...Array.from({ length: 510 }, (_, i) => ({ id: `filler-${i}`, role: 'user', text: `其他话题${i}`, at: now() })));
  await host.control({ action: 'chat', text: '今天阳光很好' });
  await idle(host);
  assert.equal(host.current().messages.length, 513);
  await host.control({ action: 'new-conversation' });
  await host.control({ action: 'chat', text: '你记得我在哪所大学读博士吗？' });
  await idle(host);
  assert.match(systemPrompt(chats().at(-1)), /海洋大学/);
  assert.doesNotMatch(systemPrompt(chats().at(-1)), /companion_recall/);
  await host.save();
  const again = new LiteHost({ dataDir, secrets, persona: 'p', fetchApi, now });
  await again.initialize();
  assert.equal(again.status().historyMemory.storedMessages, 515);
  assert.equal(again.conversations[0].messages.length, 513);
});

test('forgetting excludes the old preference and its reply from recent context and archive retrieval', async t => {
  const { fetchApi, chats } = services({ reply: () => ({ text: '原来你喜欢香菜。', animation: 'none' }) });
  const { host } = await setup(t, { fetchApi });
  await host.control({ action: 'chat', text: '记住：我喜欢香菜' });
  await idle(host);
  const entry = host.status().personalMemory.entries[0];
  await host.control({ action: 'forget-memory', id: entry.id });
  await host.control({ action: 'chat', text: '你记得我的食物偏好吗？' });
  await idle(host);
  assert.doesNotMatch(JSON.stringify(chats().at(-1).body), /香菜/);
  assert.match(host.current().messages[0].text, /香菜/, 'forgetting leaves the visible transcript intact');
  await host.control({ action: 'new-conversation' });
  await host.control({ action: 'chat', text: '食物偏好还记得吗？' });
  await idle(host);
  assert.doesNotMatch(JSON.stringify(chats().at(-1).body), /香菜/);
});

test('image-only chat uses the configured vision service and persists only its summary', async t => {
  const { fetchApi, calls, chats } = services();
  const { host, dataDir } = await setup(t, { fetchApi });
  await host.control({ action: 'lite-settings', vision: { baseUrl: 'https://vision.test/v1', model: 'image-model' }, keys: { visionKey: 'sk-image-1234' } });
  await host.control({ action: 'chat', text: '', image: { jpeg } });
  await idle(host);
  const vision = calls.find(call => call.url === 'https://vision.test/v1/chat/completions');
  assert.equal(vision.auth, 'Bearer sk-image-1234');
  assert.equal(vision.body.model, 'image-model');
  assert.equal(vision.body.max_tokens, 1200);
  assert.match(vision.body.messages[0].content, /用户主动上传/);
  assert.match(JSON.stringify(chats().at(-1).body), /图片的观察摘要/);
  assert.equal(host.current().messages[0].image.source, 'user-upload');
  await host.save();
  const { readFile } = await import('node:fs/promises');
  assert.equal((await readFile(join(dataDir, 'state.json'), 'utf8')).includes(jpeg), false);
  await assert.rejects(host.control({ action: 'chat', text: '', image: { jpeg: 'not-a-jpeg' } }), /图片格式/);
});

test('typing interrupts proactive drafting and resumes once after the direct reply has been seen', async t => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let proactiveCalls = 0;
  const { fetchApi, chats } = services({ reply: async body => {
    if (/主动找用户说话/.test(body.messages[0].content)) {
      if (++proactiveCalls === 1) await held;
      return { text: '刚才想说，今天也陪你慢慢来。', animation: 'none' };
    }
    return { text: '嗯，先听你说。', animation: 'none' };
  } });
  const { host, now } = await setup(t, { fetchApi });
  await host.control({ action: 'ambient-settings', enabled: true, intervalMinutes: 1 });
  await nextLine(host, now);
  const report = async (typing, seenReplyId) => host.control({ action: 'interaction-state', sessionId: host.sessionId,
    reportedAt: now(), typing, speaking: false, seenReplyId });
  await report(true);
  await host.control({ action: 'chat', text: '等一下，我想先说一句' });
  release();
  await idle(host);
  assert.equal(host.current().messages.filter(message => message.ambient).length, 0);
  const direct = host.current().messages.at(-1);
  now.tick(8001);
  await report(false, 'not-seen');
  assert.equal(proactiveCalls, 1);
  now.tick(1);
  await report(false, direct.id);
  await idle(host);
  assert.equal(host.current().messages.filter(message => message.ambient).length, 1);
  assert.equal(proactiveCalls, 2);
  assert.match(JSON.stringify(chats().at(-1).body), /resumed|interrupted_text/);
  now.tick(1);
  await report(false, direct.id);
  assert.equal(proactiveCalls, 2);
});

test('reply length, speech rewriting and semantic animation hints follow panel controls', async t => {
  const { fetchApi, chats, calls } = services({ reply: body => /把已有回复改成/.test(systemPrompt({ body }))
    ? { text: '先把最关键的一点讲给你听。' } : { text: '这是需要解释清楚的一段长回复。'.repeat(20), animation: 'none' } });
  const { host } = await setup(t, { fetchApi });
  await host.control({ action: 'reply-length', length: 'short' });
  await host.control({ action: 'speech-edit', enabled: false });
  await host.control({ action: 'chat', text: '赛车转弯怎么做？' });
  await idle(host);
  const prompt = systemPrompt(chats().at(-1));
  assert.match(prompt, /通常1～2句/);
  assert.match(prompt, /catalog/);
  assert.match(prompt, /racing_turn/);
  const reply = host.current().messages.at(-1);
  await assert.rejects(host.speak({ messageId: reply.id }), /VOICE_TEXT_TOO_LONG/);
  await host.control({ action: 'speech-edit', enabled: true });
  await host.speak({ messageId: reply.id });
  assert.equal(calls.at(-2).body.input.text, '先把最关键的一点讲给你听。');
  assert.equal(host.status().speechEdit, true);
});

test('pausing cancels a pending manual image without storing it or answering it', async t => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const { fetchApi } = services();
  const { host } = await setup(t, { fetchApi: async (url, init) => { await held; return fetchApi(url, init); } });
  const pending = host.control({ action: 'chat', text: '看看这个', image: { jpeg } });
  assert.equal(host.status().conversationBusy, true);
  await assert.rejects(host.control({ action: 'new-conversation' }), /还在回上一句/);
  await host.control({ action: 'pause' });
  release();
  await assert.rejects(pending, /取消/);
  assert.equal(host.current().messages.length, 0);
  assert.equal(host.status().conversationBusy, false);
});

test('the renderer receives new assets and can send an image larger than the old control limit', async t => {
  const { fetchApi } = services();
  const { host } = await setup(t, { fetchApi });
  const server = await startServer(host, { petDir: tmpdir() });
  t.after(() => server.close());
  const headers = { cookie: `whale_companion=${server.token}`, 'x-companion-control': '1', 'content-type': 'application/json' };
  for (const [path, type] of [
    ['touch-interactions.js', 'text/javascript; charset=utf-8'], ['pcm-player.js', 'text/javascript; charset=utf-8'],
    ['art/composer-trim.svg', 'image/svg+xml'], ['touch-voices/head-0.wav', 'audio/wav']
  ]) {
    const response = await fetch(new URL(`/game-companion/${path}`, server.base), { headers });
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('content-type'), type, path);
  }
  const bytes = Buffer.alloc(12000, 1);
  bytes[0] = 0xff; bytes[1] = 0xd8; bytes[2] = 0xff; bytes[bytes.length - 2] = 0xff; bytes[bytes.length - 1] = 0xd9;
  const response = await fetch(new URL('/game-companion/control', server.base), { method: 'POST', headers,
    body: JSON.stringify({ action: 'chat', text: '看看这个', image: { jpeg: bytes.toString('base64') } }) });
  assert.equal(response.status, 200);
  await idle(host);
  assert.equal(host.current().messages[0].image.source, 'user-upload');
});
