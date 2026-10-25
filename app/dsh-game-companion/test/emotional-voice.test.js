import test from 'node:test';
import assert from 'node:assert/strict';
import { CompanionVoice, EMOTION_PRESETS, EMOTION_PREVIEW_TEXT, EMOTION_VOICE } from '../src/voice.js';

function fixture(block) {
  const calls = [], released = [];
  const runtime = voice => ({ voice, provider: { synthesize: async (input, signal) => {
    calls.push({ ...input, voice });
    if (block) await block(signal);
    return { audio: { mimeType: 'audio/wav' }, durationMs: 1000 };
  } }, store: { read: async () => new Uint8Array([1, 2]), releaseScope: async scope => released.push(scope) } });
  const normal = runtime(EMOTION_VOICE), emotional = runtime(EMOTION_VOICE);
  const voice = new CompanionVoice({ directory: 'unused', previewDirectory: null,
    load: async () => normal, loadEmotional: async () => emotional });
  return { voice, calls, released };
}

test('four emotional previews and normal replies use the same selected voice with distinct instructions', async () => {
  const f = fixture();
  for (const preset of Object.keys(EMOTION_PRESETS)) {
    const audio = await f.voice.previewEmotion(preset, 'same-session', new AbortController().signal);
    assert.equal(audio.voice, EMOTION_VOICE);
    assert.equal(f.calls.at(-1).text, EMOTION_PREVIEW_TEXT);
    assert.equal(f.calls.at(-1).expression.delivery, EMOTION_PRESETS[preset].delivery);
  }
  assert.equal(new Set(f.calls.map(call => call.expression.delivery)).size, 4);
  await f.voice.previewEmotion('gentle', 'same-session', new AbortController().signal);
  assert.equal(f.calls.length, 4, 'Repeated generated preview is cached');
  const normal = await f.voice.speak({ id: 'regular-reply', role: 'assistant', spoken: true,
    text: '这把本鲸陪你。', emotion: 'happy_hop' }, 'same-session', new AbortController().signal);
  assert.equal(normal.voice, EMOTION_VOICE);
  assert.equal(f.calls.at(-1).voice, EMOTION_VOICE);
  assert.equal(f.released.length, 5);
});

test('unrecognized preview input never reaches a paid provider', async () => {
  const f = fixture();
  for (const preset of ['../Momo', '__proto__', 'constructor', '', null, {}, ['gentle']]) {
    await assert.rejects(f.voice.previewEmotion(preset, 'session', new AbortController().signal), /VOICE_EMOTION_REQUIRED/);
  }
  assert.equal(f.calls.length, 0);
});

test('emotional and regular synthesis share busy and cancellation handling', async () => {
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const f = fixture(signal => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    started();
  }));
  const pending = f.voice.previewEmotion('happy', 'session', new AbortController().signal);
  await ready;
  await assert.rejects(f.voice.previewEmotion('serious', 'session', new AbortController().signal), /VOICE_BUSY/);
  f.voice.stop();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(f.voice.cache.size, 0);
  assert.equal(f.released.length, 1);
});

test('Fish Audio voice reads the local key, sends the community voice id and speaks the reply tone in brackets', async t => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { loadFishVoice, FISH_VOICE } = await import('../src/voice.js');
  const directory = await mkdtemp(join(tmpdir(), 'fish-voice-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const keyFile = join(directory, 'fish-audio-key.txt'), requests = [], settled = [];
  const fetch = async (url, init) => { requests.push({ url, ...init }); return new Response(new Uint8Array([7, 8, 9])); };
  const authorizer = { authorize: async () => ({ settle: async outcome => settled.push(outcome.status) }) };
  const voice = new CompanionVoice({ directory, previewDirectory: null, fishPreviewDirectory: null,
    loadFish: () => loadFishVoice(authorizer, { keyFile, fetch }) });
  const line = (id, extra) => ({ id, role: 'assistant', spoken: true, text: '在的在的。', emotion: 'happy_hop', ...extra });
  const sent = () => JSON.parse(requests.at(-1).body).text;
  const signal = new AbortController().signal;
  await assert.rejects(voice.speak(line('no-key'), 's', signal, null, 'fish'), /VOICE_CREDENTIAL_UNAVAILABLE/);
  assert.equal(requests.length, 0);
  await writeFile(keyFile, ' test-key \n');
  const audio = await voice.speak(line('happy', { tone: 'happy' }), 's', signal, null, 'fish');
  assert.deepEqual([...audio.bytes], [7, 8, 9]);
  assert.equal(audio.voice, FISH_VOICE);
  assert.equal(requests[0].url, 'https://api.fish.audio/v1/tts');
  assert.equal(requests[0].headers.authorization, 'Bearer test-key');
  assert.deepEqual(JSON.parse(requests[0].body), { text: '[happy] 在的在的。', reference_id: FISH_VOICE, format: 'wav', sample_rate: 24000, latency: 'balanced' });
  assert.deepEqual(settled, ['succeeded']);
  await voice.speak(line('turn', { text: '才没有等你。只是顺手多盛了一碗。', tone: 'tsundere', toneEnd: 'shy' }), 's', signal, null, 'fish');
  assert.equal(sent(), '[pouty, a little embarrassed] 才没有等你。 [shy] 只是顺手多盛了一碗。');
  await voice.speak(line('no-tone'), 's', signal, null, 'fish');
  assert.equal(sent(), '在的在的。');
  await voice.speak(line('bad-tone', { tone: 'no_such_tone' }), 's', signal, null, 'fish');
  assert.equal(sent(), '在的在的。');
  await voice.previewEmotion('tsundere', 's', signal, 'fish');
  assert.equal(sent(), '[pouty, a little embarrassed] 嗯？你回来啦……饭还热着呢。 [shy] 才没有一直等你，只是顺手多盛了一碗而已。');
  await assert.rejects(voice.previewEmotion('happy', 's', signal, 'momo'), /VOICE_EMOTION_UNAVAILABLE/);
});

test('Qwen voice speaks the reply tone, turns on the last sentence and falls back to the reply emotion', async () => {
  const { toneDelivery, VOICE_TONES, TONE_IDS } = await import('../src/voice-tones.js');
  assert.ok(TONE_IDS.length >= 20 && TONE_IDS.length <= 26);
  const f = fixture();
  const say = (id, extra) => f.voice.speak({ id, role: 'assistant', spoken: true, text: '你回来啦。', emotion: 'happy_hop', ...extra }, 's', new AbortController().signal);
  await say('sad', { tone: 'sad' });
  assert.equal(f.calls.at(-1).expression.delivery, toneDelivery('sad'));
  assert.ok(f.calls.at(-1).expression.delivery.includes(VOICE_TONES.sad.delivery));
  await say('turn', { tone: 'tsundere', toneEnd: 'shy' });
  assert.ok(f.calls.at(-1).expression.delivery.includes(`最后一句转为：${VOICE_TONES.shy.delivery}`));
  await say('old', {});
  assert.match(f.calls.at(-1).expression.delivery, /轻快、开心/);
});
