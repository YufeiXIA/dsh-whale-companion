const assert=require('node:assert/strict');
const {readFile,writeFile}=require('node:fs/promises');
const path=require('node:path');

module.exports=async({win,output,request})=>{
  const before=await request('/game-companion/state');
  assert.equal(before.scheduler.paused,true);assert.equal(before.scheduler.active,false);
  const js=code=>win.webContents.executeJavaScript(code,true);
  // Exercise real DOM input and Audio without sending test chat or invoking cloud TTS.
  await js(`window.interactionTest={fetch:window.fetch.bind(window),reports:[],voiceCalls:0};
    window.fetch=async(url,options)=>{
      if(url==='/game-companion/control'){
        const body=JSON.parse(options.body);
        if(body.action!=='interaction-state')throw Error('Unexpected test control');
        interactionTest.reports.push(body);return new Response('{}',{status:200});
      }
      if(url==='/game-companion/voice'){
        interactionTest.voiceCalls++;
        return interactionTest.fetch('/game-companion/touch-voices/head-0.wav?v=2');
      }
      return interactionTest.fetch(url,options);
    };
    stopVoice();voiceEnabled=true;$('volume').value='0';void 0;`);
  const results=[];let speechMotion,semanticMotion;
  try{
    for(const inputId of ['quick-message','chat']){
      await js(`setPanel(${inputId==='chat'});$('${inputId}').value='';typingHoldUntil=0;interactionComposing=false;
        document.activeElement.blur();${inputId==='quick-message'?'showQuickChat();':''}void 0;`);
      await js(`speak({id:'native-${inputId}',ambient:true,at:Date.now()})`);
      const playback=await js("({playing:!!audio&&!audio.paused,status:$('voice-status').textContent,calls:interactionTest.voiceCalls,typing:typingInChat()})");
      assert.equal(playback.playing,true,JSON.stringify(playback));
      await js(`interactionTest.player=audio;$('${inputId}').focus();
        $('${inputId}').dispatchEvent(new CompositionEvent('compositionstart',{data:''}));void 0;`);
      const interrupted=await js(`({stopped:audio===null&&voiceRequest===null&&interactionTest.player.paused,
        report:interactionTest.reports.at(-1),focused:document.activeElement.id})`);
      assert.equal(interrupted.focused,inputId);assert.equal(interrupted.stopped,true);
      assert.equal(interrupted.report.typing,true);assert.equal(interrupted.report.interruptedId,`native-${inputId}`);
      assert.equal(Object.hasOwn(interrupted.report,'text'),false);
      await js(`$('${inputId}').dispatchEvent(new CompositionEvent('compositionend',{data:''}));
        $('${inputId}').value='';typingHoldUntil=0;document.activeElement.blur();void 0;`);
      await js(`speak({id:'keys-${inputId}',ambient:true,at:Date.now()})`);
      await js(`interactionTest.player=audio;${inputId==='quick-message'?'showQuickChat();':''}$('${inputId}').focus();void 0;`);
      win.webContents.sendInputEvent({type:'keyDown',keyCode:'A'});
      win.webContents.sendInputEvent({type:'char',keyCode:'a'});
      win.webContents.sendInputEvent({type:'keyUp',keyCode:'A'});
      await new Promise(resolve=>setTimeout(resolve,100));
      const typed=await js(`({value:$('${inputId}').value,stopped:audio===null&&interactionTest.player.paused,
        reported:interactionTest.reports.some(r=>r.typing&&r.interruptedId==='keys-${inputId}')})`);
      assert.equal(typed.value,'a');assert.equal(typed.stopped,true);assert.equal(typed.reported,true);
      const count=await js('interactionTest.voiceCalls');
      await js(`speak({id:'late-${inputId}',ambient:true,at:Date.now()})`);
      assert.equal(await js('interactionTest.voiceCalls'),count,'late proactive output cannot start another audio request');
      await js(`$('${inputId}').value='';typingHoldUntil=0;document.activeElement.blur();void 0;`);
      await js(`speak({id:'direct-${inputId}',at:Date.now()})`);
      assert.equal(await js('!!audio&&!audio.paused'),true);
      await js('reportInteraction();void 0;');
      assert.equal(await js('interactionTest.reports.at(-1).speaking'),true);
      // Decode/playback and native ended event must release the playback gate.
      await js(`new Promise((resolve,reject)=>{
        const player=audio;player.addEventListener('ended',resolve,{once:true});
        player.addEventListener('error',()=>reject(Error('Audio failed')),{once:true});
        player.currentTime=Math.max(0,player.duration-.15);
      })`);
      await js('reportInteraction();void 0;');
      assert.equal(await js('interactionTest.reports.at(-1).speaking'),false);
      results.push({input:inputId,compositionStopsAudio:true,nativeKeyStopsAudio:true,lateProactiveHeld:true,directPlaybackCompletes:true});
    }
    speechMotion=await js(`(async()=>{
      setPanel(false);hideQuickChat();petAnimator.listen(false);petAnimator.edge(1);
      petAnimator.desktop(true,actionChoices,false,'natural');petAnimator.suspend(false);
      const originalSource={element:$('pet'),src:$('pet').src};petAnimator.speaking();
      async function playingAfter(previous,stage){
        const until=Date.now()+8000;
        while(Date.now()<until){
          const v=$('pet');
          if((v!==previous.element||v.src!==previous.src)&&v.readyState>=3&&!v.paused&&v.currentTime>.05)return v;
          await new Promise(resolve=>setTimeout(resolve,60));
        }
        const v=$('pet');
        throw Error(JSON.stringify({stage,previous:new URL(previous.src).pathname,current:new URL(v.src).pathname,
          ready:v.readyState,paused:v.paused,time:v.currentTime,loop:v.loop}));
      }
      const talking=[],after=[];let previous=originalSource;
      for(let i=0;i<6;i++){
        const v=await playingAfter(previous,'talk-'+i);previous={element:v,src:v.src};
        if(v.loop)throw Error('Speech animation is looping');
        talking.push(new URL(v.src).pathname);v.onended();
      }
      // Real audio end -> stopVoice -> quiet must release the animation gate.
      await speak({id:'native-motion-audio',at:Date.now()});
      const talkingVideo=await playingAfter(previous,'audio');previous={element:talkingVideo,src:talkingVideo.src};
      await new Promise((resolve,reject)=>{
        const player=audio;player.addEventListener('ended',resolve,{once:true});
        player.addEventListener('error',()=>reject(Error('Audio failed')),{once:true});
        player.currentTime=Math.max(0,player.duration-.15);
      });
      for(let i=0;i<3;i++){
        const v=await playingAfter(previous,'after-'+i);previous={element:v,src:v.src};
        if(v.loop)throw Error('Edge pose remained looping after speech');
        after.push(new URL(v.src).pathname);v.onended();
      }
      petAnimator.quiet();petAnimator.edge(0);petAnimator.desktop(false,[],false);
      previous={element:$('pet'),src:$('pet').src};petAnimator.speaking({tone:'comforting'});
      const comforting=[];
      for(let i=0;i<4;i++){
        const v=await playingAfter(previous,'comfort-'+i);previous={element:v,src:v.src};
        const clip=new URL(v.src).pathname;
        if(v.loop||!/care_disguised|reluctant_pillow|casual_closer|listening_nod/.test(clip))throw Error('Wrong comforting speech clip: '+clip);
        comforting.push(clip);v.onended();
      }
      petAnimator.quiet();
      return {talking,after,comforting,audioStopped:audio===null};
    })()`);
    assert.equal(new Set(speechMotion.talking).size,6);assert.equal(new Set(speechMotion.after).size,3);
    assert.equal(new Set(speechMotion.comforting).size,4);
    assert.equal(speechMotion.audioStopped,true);
    const modelReport=JSON.parse(await readFile(path.join(output,'../chat-animation-20261025/report.json'),'utf8'));
    assert.equal(modelReport.completed,true);
    semanticMotion=await js(`(async()=>{
      const results=[];petAnimator.edge(0);petAnimator.listen(false);petAnimator.quiet();
      for(const style of ['natural','showcase']){
        petAnimator.desktop(true,actionChoices,false,style);petAnimator.suspend(false);
        const sample={sessionId:'semantic-'+style,scheduler:{paused:true,active:false},messages:[]};
        petAnimator.update(sample);
        for(const [i,reply] of ${JSON.stringify(modelReport.replies)}.entries()){
          const message={...reply,id:style+'-'+i,role:'assistant',at:Date.now()};
          sample.messages.push(message);petAnimator.update(sample);petAnimator.speaking(message);
          const expected=message.animation.startsWith('companion/')?'/game-companion/animations/'+message.animation.slice(10)+'.webm':'/whale-pet/'+message.animation+'.webm';
          const until=Date.now()+8000;let playing=false;
          while(Date.now()<until){const v=$('pet');if(new URL(v.src).pathname===expected&&v.readyState>=3&&!v.paused&&v.currentTime>.05){playing=true;break;}await new Promise(r=>setTimeout(r,60));}
          if(!playing)throw Error('Semantic playback failed: '+style+' '+message.animation);
          results.push({style,animation:message.animation,decoded:true});petAnimator.quiet();
        }
      }
      return results;
    })()`);
  }finally{
    await js("stopVoice();$('chat').value='';$('quick-message').value='';typingHoldUntil=0;interactionComposing=false;window.fetch=interactionTest.fetch;void 0;");
  }
  const after=await request('/game-companion/state');
  assert.equal(after.sessionId,before.sessionId);assert.equal(after.messages.length,before.messages.length);
  assert.deepEqual(after.budget,before.budget);
  await writeFile(path.join(output,'interaction-check.json'),JSON.stringify({at:new Date().toISOString(),completed:true,results,speechMotion,semanticMotion,
    historyUnchanged:true,modelCallsUnchanged:true,
    scope:'Real Electron input and Audio playback; activity controls and cloud TTS mocked. Host scheduling/context tested separately.'},null,2));
};
