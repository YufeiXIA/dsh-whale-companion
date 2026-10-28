const assert=require('node:assert/strict');
const {writeFile}=require('node:fs/promises');
const path=require('node:path');
module.exports=async({win,output})=>{
  const js=code=>win.webContents.executeJavaScript(code,true);
  const synthetic=await js(`(async()=>{
    stopVoice();voiceEnabled=true;voiceChoice='fish';$('volume').value='0';
    window.streamCheck={fetch:window.fetch.bind(window),closed:false};
    window.fetch=async(url,options)=>{
      if(url!=='/game-companion/voice')return streamCheck.fetch(url,options);
      streamCheck.body=JSON.parse(options.body);
      return new Response(new ReadableStream({start(controller){
        streamCheck.controller=controller;
        const samples=new Int16Array(24000);for(let i=0;i<samples.length;i++)samples[i]=Math.sin(i*0.1)*2000;
        controller.enqueue(new Uint8Array(samples.buffer));
      },cancel(){streamCheck.closed=true;}}),{headers:{'content-type':'audio/pcm'}});
    };
    await speak({id:'stream-native',ambient:true,at:Date.now()});
    const player=audio;
    const playing=player instanceof CompanionPCMPlayer&&!player.paused&&player.context.state==='running'&&player.sources.size>0;
    $('volume').value='0.3';$('volume').oninput();const volume=player.gain.gain.value;
    $('quick-message').dispatchEvent(new Event('beforeinput'));
    await new Promise(resolve=>setTimeout(resolve,50));
    const result={playing,streamRequested:streamCheck.body.stream,volume,interrupted:player.paused&&audio===null&&voiceRequest===null,readerCanceled:streamCheck.closed};
    window.fetch=streamCheck.fetch;typingHoldUntil=0;interactionComposing=false;
    return result;
  })()`);
  assert.equal(synthetic.playing,true);assert.equal(synthetic.streamRequested,true);
  assert.ok(Math.abs(synthetic.volume-0.3)<0.001);assert.equal(synthetic.interrupted,true);assert.equal(synthetic.readerCanceled,true);
  // Real API + route + renderer; preview text only, muted, no conversation mutation.
  const live=await js(`(async()=>{
    $('volume').value='0';const start=performance.now();
    await speak({at:Date.now()},true);
    if(!(audio instanceof CompanionPCMPlayer))throw Error('Streaming player did not start: '+$('voice-status').textContent);
    window.streamCheck.player=audio;
    return {firstPlaybackMs:Math.round(performance.now()-start),context:audio.context.state,queued:audio.sources.size,stillReceiving:!audio.finished};
  })()`);
  assert.equal(live.context,'running');assert.ok(live.queued>0);
  await js(`new Promise((resolve,reject)=>{
    const deadline=Date.now()+60000;
    const check=()=>{
      if($('voice-status').textContent)return reject(Error($('voice-status').textContent));
      if(!audio&&!voiceRequest)return resolve();
      if(Date.now()>deadline)return reject(Error('Streaming did not finish'));
      setTimeout(check,100);
    };check();
  })`);
  const drained=await js('streamCheck.player.paused&&streamCheck.player.context.state==="closed"');assert.equal(drained,true);
  await writeFile(path.join(output,'stream-voice-check.json'),JSON.stringify({completed:true,synthetic,live,drained,checkedAt:new Date().toISOString()},null,2));
};
