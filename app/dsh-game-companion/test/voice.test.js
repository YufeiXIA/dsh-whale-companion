import test from 'node:test';
import assert from 'node:assert/strict';
import { CompanionVoice } from '../src/voice.js';

const message = { id: 'reply-one', role: 'assistant', text: '我来收尾，你留点格挡。', emotion: 'tsundere_pout', spoken: true };
test('voice selection isolates caches, preserves the default and rejects unsupported emotional Momo previews',async()=>{
  const calls=[];
  const runtime=voice=>({voice,model:'test',provider:{synthesize:async()=>{calls.push(voice);return {audio:{mimeType:'audio/wav'}};}},
    store:{read:async()=>new Uint8Array([1]),releaseScope:async()=>{}}});
  const voice=new CompanionVoice({directory:'unused',load:async()=>runtime('longhua_v3.1'),loadMomo:async()=>runtime('Momo')});
  const signal=new AbortController().signal;
  assert.equal((await voice.speak(message,'session',signal)).voice,'longhua_v3.1');
  assert.equal((await voice.speak(message,'session',signal,null,'momo')).voice,'Momo');
  assert.equal((await voice.speak(message,'session',signal)).voice,'longhua_v3.1');
  assert.deepEqual(calls,['longhua_v3.1','Momo']);
  await assert.rejects(voice.speak(message,'session',signal,null,'other'),/VOICE_SELECTION_REQUIRED/);
  await assert.rejects(voice.previewEmotion('happy','session',signal,'momo'),/VOICE_EMOTION_UNAVAILABLE/);
});
function fixture(synthesize) {
  const calls = [], released = [];
  const runtime = { voice: 'Momo', provider: { synthesize: async (input, signal) => {
    calls.push(input);
    if (synthesize) await synthesize(input, signal);
    return { audio: { mimeType: 'audio/wav' }, durationMs: 1200 };
  } }, store: { read: async () => new Uint8Array([1, 2]), releaseScope: async scope => released.push(scope) } };
  return { voice: new CompanionVoice({ directory: 'unused', load: async () => runtime }), calls, released };
}
test('same message uses one synthesis, preserving text, Momo voice and scope cleanup', async () => {
  const f = fixture();
  const first = await f.voice.speak(message, 'game-session', new AbortController().signal);
  assert.equal(first.voice, 'Momo');
  assert.equal(await f.voice.speak(message, 'game-session', new AbortController().signal), first);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].text, message.text);
  assert.equal(f.calls[0].scope.sessionId, 'game-session');
  assert.match(f.calls[0].expression.delivery, /傲娇/);
  assert.equal(f.released.length, 1);
});
test('cancellation and concurrent playback cannot create duplicate synthesis or cache late audio', async () => {
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const f = fixture((_input, signal) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true }); started();
  }));
  const speaking = f.voice.speak(message, 'game-session', new AbortController().signal);
  await ready;
  await assert.rejects(f.voice.speak(message, 'game-session', new AbortController().signal), /VOICE_BUSY/);
  f.voice.stop();
  await assert.rejects(speaking, { name: 'AbortError' });
  assert.equal(f.voice.cache.size, 0);
  assert.equal(f.released.length, 1);
  assert.equal(f.calls.length, 1);
});
test('historical diagnostics, absent messages and user inputs never reach the provider', async () => {
  const f = fixture();
  for (const value of [undefined, { ...message, role: 'user' }, { ...message, spoken: false },
    { ...message, spoken: undefined }, { ...message, text: '说明'.repeat(151) }]) {
    await assert.rejects(f.voice.speak(value, 'game-session', new AbortController().signal), /VOICE_/);
  }
  assert.equal(f.calls.length, 0);
});

test('longer selected speech reaches Momo intact up to 180 characters', async () => {
  const f=fixture();
  await f.voice.speak({...message,text:'鲸'.repeat(180)},'game-session',new AbortController().signal);
  assert.equal(f.calls[0].text.length,180);
});

test('proactive paragraphs are voiced intact up to 240 characters without changing the selected voice',async()=>{
  const f=fixture();
  await f.voice.speak({...message,ambient:true,text:'鲸'.repeat(240)},'game-session',new AbortController().signal);
  assert.equal(f.calls[0].text.length,240);
  await assert.rejects(f.voice.speak({...message,id:'too-long',ambient:true,text:'鲸'.repeat(241)},'game-session',new AbortController().signal),/VOICE_TEXT_TOO_LONG/);
});
