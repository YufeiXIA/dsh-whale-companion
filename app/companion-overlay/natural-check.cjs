const assert=require('node:assert/strict');
const {writeFile}=require('node:fs/promises');
const path=require('node:path');

module.exports=async({win,output,request})=>{
  const before=await request('/game-companion/state');
  assert.equal(before.scheduler.paused,true);assert.equal(before.scheduler.active,false);
  const js=code=>win.webContents.executeJavaScript(code);
  const clips=['casual_closer','rice_share','controller_search','hold_thought','saved_seat','knew_it_notes',
    'snack_stubborn','flourish_retry','setup_pride','claimed_spot','care_disguised','reluctant_pillow'];
  const results=await js(`(async()=>{
    stopVoice();setPanel(false);petAnimator.listen(false);petAnimator.quiet();petAnimator.mood(false,false);
    petAnimator.desktop(true,actionChoices,false,'natural');petAnimator.suspend(false);
    const count=petAnimator.naturalCount(),wanted=${JSON.stringify(clips)},seen=[],results=[];
    let previousSource=document.getElementById('pet').src;
    petAnimator.desktop(true,wanted.map(name=>'companion/'+name),false,'natural');
    for(let attempt=0;attempt<60&&seen.length<wanted.length;attempt++){
      const until=Date.now()+8000;
      while(Date.now()<until){
        const v=document.getElementById('pet');
        if(v.src!==previousSource&&v.readyState>=3&&!v.paused&&!v.seeking&&v.currentTime>.05)break;
        await new Promise(resolve=>setTimeout(resolve,80));
      }
      const v=document.getElementById('pet'),name=new URL(v.src).pathname.split('/').at(-1).replace('.webm','');
      if(v.readyState<3||v.paused)throw Error('Animation did not start: '+name);
      if(wanted.includes(name)){
        if(seen.includes(name))throw Error('Natural action repeated: '+name+' after '+seen.join(','));
        seen.push(name);results.push({name,seconds:v.duration,playing:!v.paused});
      }
      previousSource=v.src;petAnimator.mood(false,false);v.onended?.();await new Promise(resolve=>setTimeout(resolve,100));
    }
    petAnimator.desktop(true,actionChoices,false,'natural');
    return {count,results,compact:document.body.classList.contains('compact')};
  })()`);
  assert.equal(results.count,111);assert.equal(results.results.length,12);assert.equal(results.compact,true);
  const thinking=await js(`(async()=>{
    const realFetch=window.fetch.bind(window),testState=structuredClone(state);testState.scheduler.active=true;
    window.fetch=(url,options)=>url==='/game-companion/state'?Promise.resolve(new Response(JSON.stringify(testState))):realFetch(url,options);
    const samples=[];
    try{
      hideQuickChat();petAnimator.listen(false);petAnimator.quiet();petAnimator.desktop(false,[],false);
      let previous=$('pet').src;petAnimator.update(testState);
      for(const side of [0,-1,1]){
        petAnimator.edge(side);const seen=[];
        for(let i=0;i<(side?4:7);i++){
          const until=Date.now()+8000;
          while(Date.now()<until){
            const v=$('pet');
            if(v.src!==previous&&v.readyState>=3&&!v.paused&&!v.seeking&&v.currentTime>.05)break;
            await new Promise(resolve=>setTimeout(resolve,60));
          }
          const v=$('pet'),clip=new URL(v.src).pathname;
          if(v.src===previous||v.readyState<3||v.paused||v.loop||seen.includes(clip))throw Error('Thinking clip did not rotate/play: '+JSON.stringify({side,i,clip,seen,ready:v.readyState,paused:v.paused,loop:v.loop}));
          if(side&&!/manual_scroll|hold_thought|attentive_listening|looking_around/.test(clip))throw Error('Wrong edge thinking clip');
          seen.push(clip);previous=v.src;samples.push({side,clip,seconds:v.duration,playing:!v.paused});if(i<(side?3:6))v.onended();
        }
      }
    }finally{window.fetch=realFetch;petAnimator.edge(0);petAnimator.update(state);}
    return samples;
  })()`);
  await writeFile(path.join(output,'thinking-animation-check.json'),JSON.stringify({completed:true,checkedAt:new Date().toISOString(),samples:thinking,scope:'Actual Electron video decoding; simulated waiting state, no model calls.'},null,2));
  await writeFile(path.join(output,'natural-animation-preview.png'),(await win.webContents.capturePage()).toPNG());
  const after=await request('/game-companion/state');assert.deepEqual(after.messages,before.messages);assert.deepEqual(after.budget,before.budget);
  await writeFile(path.join(output,'natural-animation-check.json'),JSON.stringify({completed:true,checkedAt:new Date().toISOString(),...results,historyPreserved:true},null,2));
};
