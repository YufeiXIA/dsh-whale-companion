import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CompanionVoice,loadFishVoice} from '../src/voice.js';

test('Fish forwards the first PCM chunk before synthesis finishes and shares cancellation/busy handling',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'fish-stream-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const keyFile=join(directory,'key');await writeFile(keyFile,'test');
  const chunks=[],requests=[];let stream,first;
  const ready=new Promise(resolve=>{first=resolve;});
  const voice=new CompanionVoice({directory,loadFish:auth=>loadFishVoice(auth,{keyFile,fetch:async(_url,init)=>{
    requests.push(init);return new Response(new ReadableStream({start(controller){stream=controller;controller.enqueue(new Uint8Array([1,2]));}}));
  }})});
  const message={id:'stream',role:'assistant',spoken:true,text:'你回来啦。',tone:'happy'};
  const signal=new AbortController().signal;
  const speaking=voice.speak(message,'test',signal,null,'fish',chunk=>{chunks.push([...chunk]);first();});
  await ready;
  assert.deepEqual(chunks,[[1,2]]);assert.ok(voice.active);
  assert.equal(JSON.parse(requests[0].body).format,'pcm');
  assert.equal(JSON.parse(requests[0].body).text,'[happy] 你回来啦。');
  await assert.rejects(voice.speak(message,'test',signal,null,'fish'),/VOICE_BUSY/);
  stream.enqueue(new Uint8Array([3,4]));stream.close();
  assert.equal((await speaking).streamed,true);assert.deepEqual(chunks,[[1,2],[3,4]]);
  assert.equal(voice.cache.size,0);assert.equal(voice.active,null);
  const canceled=voice.speak({...message,id:'cancel'},'test',signal,null,'fish',()=>voice.stop());
  await new Promise(resolve=>setImmediate(resolve));
  // Closing the mock body unblocks its read; real fetch abort also closes the body.
  while(requests.length<2)await new Promise(resolve=>setImmediate(resolve));
  stream.close();await assert.rejects(canceled,{name:'AbortError'});assert.equal(voice.active,null);
});
