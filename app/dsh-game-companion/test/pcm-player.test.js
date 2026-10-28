import test from 'node:test';
import assert from 'node:assert/strict';
import PCMPlayer from '../public/pcm-player.cjs';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
  let stream;
  const sources=[];
  class Context {
    constructor(options){assert.equal(options.sampleRate,24000);}
    currentTime=0;destination={};closed=false;
    createGain(){return {gain:{value:1},connect(){}};}
    createBuffer(_channels,count,rate){const samples=new Float32Array(count);return {samples,rate,getChannelData:()=>samples};}
    createBufferSource(){const source={connect(){},disconnect(){},start(at){this.at=at;},stop(){this.stopped=true;}};sources.push(source);return source;}
    async resume(){}
    async close(){this.closed=true;}
  }
  const body=new ReadableStream({start(controller){stream=controller;}});
  return {player:new PCMPlayer(body,Context),sources,get stream(){return stream;}};
}
test('PCM starts before the response ends, joins split samples, preserves order and drains before ending',async()=>{
  const f=fixture();let ended=false;f.player.onended=()=>{ended=true;};f.player.volume=0.4;
  const start=f.player.play();f.stream.enqueue(new Uint8Array([0,128,255]));await start;
  assert.equal(f.sources.length,1);assert.equal(f.sources[0].buffer.samples[0],-1);
  assert.equal(f.player.finished,false);assert.equal(ended,false);
  f.stream.enqueue(new Uint8Array([127,0,0]));await flush();f.stream.close();await flush();
  assert.deepEqual([...f.sources[1].buffer.samples],[32767/32768,0]);
  assert.equal(f.sources[1].at,f.sources[0].at+1/24000);
  assert.equal(f.player.gain.gain.value,0.4);assert.equal(ended,false);
  for(const source of f.sources)source.onended();
  assert.equal(ended,true);assert.equal(f.player.context.closed,true);
});
test('interrupting PCM cancels the reader and stops every queued audio segment',async()=>{
  const f=fixture();const start=f.player.play();f.stream.enqueue(new Uint8Array(4800));await start;
  f.stream.enqueue(new Uint8Array(4800));await flush();f.player.pause();await flush();
  assert.equal(f.player.paused,true);assert.ok(f.sources.every(s=>s.stopped));assert.equal(f.player.context.closed,true);
  assert.throws(()=>f.stream.enqueue(new Uint8Array(2)),/closed/);
});
test('a late network chunk keeps the audio contiguous while queued samples are still playing',async()=>{
  const f=fixture();const start=f.player.play();f.stream.enqueue(new Uint8Array(4800));await start;
  const expected=f.sources[0].at+0.1;
  f.player.context.currentTime=expected-0.07;
  f.stream.enqueue(new Uint8Array(4800));await flush();
  assert.equal(f.sources[1].at,expected,'a shrinking buffer must not insert silence into ongoing speech');
  f.player.pause();
});
test('a genuinely empty buffer is primed again instead of scheduling audio in the past',async()=>{
  const f=fixture();const start=f.player.play();f.stream.enqueue(new Uint8Array(4800));await start;
  f.player.context.currentTime=2;
  f.stream.enqueue(new Uint8Array(4800));await flush();assert.equal(f.sources[1].at,2.12);
  f.player.pause();
});
test('empty, truncated and failed streams report errors instead of remaining busy',async()=>{
  for(const bytes of [new Uint8Array(),new Uint8Array([1])]){
    const f=fixture();const start=f.player.play();f.stream.enqueue(bytes);f.stream.close();
    await assert.rejects(start,/VOICE_UNAVAILABLE/);assert.equal(f.player.paused,true);
  }
  const f=fixture();let error;f.player.onerror=e=>{error=e;};
  const start=f.player.play();f.stream.enqueue(new Uint8Array(2));await start;
  f.stream.error(new Error('network stopped'));await flush();
  assert.match(error.message,/network stopped/);assert.equal(f.sources[0].stopped,true);
});
