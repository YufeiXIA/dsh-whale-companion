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
