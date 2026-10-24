import test from 'node:test';
import assert from 'node:assert/strict';
import { gameVoiceModel, gameVoiceTransport } from '../src/qwen-compat.js';

test('verified Flash mapping preserves the pet wire, credentials and Momo; removes unsupported instructions', async () => {
  const config = { model: 'qwen3-tts-instruct-flash-2026-01-26', endpoint: 'https://example.test/tts', apiKey: () => 'test', authorizer: {} };
  const body = { input: { text: '本鲸来啦。', voice: 'Momo', language_type: 'Chinese', instructions: '俏皮', optimize_instructions: false } };
  let sent;
  const wire = gameVoiceTransport({ request: async (...args) => { sent = args; return 'ok'; } }, bytes => bytes);
  const scope = {}, signal = new AbortController().signal;
  assert.equal(await wire.request(config, scope, 'tts', body, signal, 9), 'ok');
  assert.equal(sent[0].model, 'qwen3-tts-flash');
  assert.equal(sent[0].endpoint, config.endpoint);
  assert.equal(sent[0].apiKey, config.apiKey);
  assert.equal(sent[0].authorizer, config.authorizer);
  assert.deepEqual(sent.slice(1), [scope, 'tts', { input: { text: '本鲸来啦。', voice: 'Momo', language_type: 'Chinese' } }, signal, 9]);
  assert.equal(config.model, 'qwen3-tts-instruct-flash-2026-01-26');
  assert.equal(body.input.instructions, '俏皮');
  assert.equal(gameVoiceModel('qwen3-tts-instruct-flash'), 'qwen3-tts-flash');
  assert.equal(gameVoiceModel('qwen3-tts-instruct-flash-2026-10-01'), 'qwen3-tts-instruct-flash-2026-10-01');
});

test('provider errors propagate once without automatic retries or changing voices', async () => {
  let calls = 0;
  const failure = new Error('Provider HTTP 401');
  const wire = gameVoiceTransport({ request: async () => { calls++; throw failure; } }, bytes => bytes);
  await assert.rejects(wire.request({ model: 'qwen3-tts-instruct-flash' }, {}, 'tts', { input: { text: '喂', voice: 'Momo' } }), error => error === failure);
  assert.equal(calls, 1);
});

test('download uses existing pet normalization and clears only the replaced temporary buffer', async () => {
  const raw = new Uint8Array([1, 2, 3]), normalized = new Uint8Array([3, 2, 1]);
  const wire = gameVoiceTransport({ downloadAudio: async () => raw }, bytes => { assert.equal(bytes, raw); return normalized; });
  assert.equal(await wire.downloadAudio('https://example.test/audio'), normalized);
  assert.deepEqual([...raw], [0, 0, 0]);
  const standard = new Uint8Array([4, 5]);
  const unchanged = gameVoiceTransport({ downloadAudio: async () => standard }, bytes => bytes);
  assert.equal(await unchanged.downloadAudio('https://example.test/audio'), standard);
  assert.deepEqual([...standard], [4, 5]);
});
