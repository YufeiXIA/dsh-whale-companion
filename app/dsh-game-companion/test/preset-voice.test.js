import test from 'node:test';
import assert from 'node:assert/strict';
import { PresetVoiceProvider, COMPANION_VOICE, COMPANION_VOICE_MODEL } from '../src/preset-voice.js';

const input = { scope: { sessionId: 'chat', turnId: 'one', generation: 0 }, text: '下局也带上我。',
  expression: { delivery: '轻轻嘴硬，后半句放软。', emotion: 'tsundere_pout' } };

function fixture(finishReason = 'stop') {
  const calls = [], stored = [];
  const config = { model: COMPANION_VOICE_MODEL, voice: COMPANION_VOICE, audioUrl: value => value };
  const bytes = new Uint8Array([1, 2]);
  const provider = new PresetVoiceProvider(config, {
    put: async (...args) => { stored.push(args); return { id: 'audio', mimeType: 'audio/wav' }; }
  }, {
    request: async (...args) => { calls.push(args); return { output: { finish_reason: finishReason, audio: { url: 'https://example.test/audio.wav' } } }; },
    downloadAudio: async () => bytes
  }, { normalizeAudio: value => value, inspectWav: () => ({ sampleRate: 24000, channels: 1, durationMs: 800 }) });
  return { provider, calls, stored, bytes };
}

test('selected preset voice sends text and emotion instructions through the accepted Qwen Audio model', async () => {
  const f = fixture();
  const result = await f.provider.synthesize(input, new AbortController().signal);
  assert.equal(f.calls[0][0].model, 'qwen-audio-3.1-tts-flash');
  assert.deepEqual(f.calls[0][3].input, { text: input.text, voice: 'longhua_v3.1', instruction: input.expression.delivery, format: 'wav', sample_rate: 24000 });
  assert.deepEqual(f.stored[0], [input.scope, f.bytes, 'audio/wav']);
  assert.equal(result.durationMs, 800);
});

test('incomplete or already cancelled synthesis cannot publish an audio clip', async () => {
  const f = fixture('length');
  await assert.rejects(f.provider.synthesize(input, new AbortController().signal), /incomplete/);
  assert.equal(f.stored.length, 0);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(f.provider.synthesize(input, controller.signal), { name: 'AbortError' });
  assert.equal(f.calls.length, 1);
});
