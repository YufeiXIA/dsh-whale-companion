const assert=require('node:assert/strict');
const {writeFile}=require('node:fs/promises');
const path=require('node:path');

module.exports=async({win,output,request})=>{
  const before=await request('/game-companion/state');
  assert.equal(before.scheduler.paused,true);assert.equal(before.scheduler.active,false);
  const js=code=>win.webContents.executeJavaScript(code);
  const originalVoice=await js("localStorage.getItem('companion-voice-choice')");
  try{
  const decoded=await js(`(async()=>{
    const decoder=new AudioContext(),results=[];
    try{for(const [region,{lines}] of Object.entries(CompanionTouches.regions))for(let index=0;index<lines.length;index++){
      const response=await fetch('/game-companion/touch-voices/'+region+'-'+index+'.wav?v='+CompanionTouches.audioVersion);
      if(!response.ok)throw Error('Local voice missing');
      const buffer=await decoder.decodeAudioData(await response.arrayBuffer());
      results.push({region,index,seconds:buffer.duration,channels:buffer.numberOfChannels,sampleRate:buffer.sampleRate});
    }}finally{await decoder.close();}return results;
  })()`);
  assert.equal(decoded.length,21);assert.ok(decoded.every(item=>item.seconds>1&&item.seconds<15&&item.channels===1));
  await js("stopVoice();voiceChoice='longhua';renderVoiceChoice();voiceEnabled=true;document.getElementById('volume').value='0.2';setPanel(false);void 0;");
  const point=await js("(()=>{const r=document.getElementById('pet-hit').getBoundingClientRect();return {x:Math.round(r.left+r.width*.5),y:Math.round(r.top+r.height*.12)};})()");
  win.webContents.sendInputEvent({type:'mouseMove',...point});
  win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});
  win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});
  await new Promise(resolve=>setTimeout(resolve,700));
  const head=await js("({compact:document.body.classList.contains('compact'),text:document.getElementById('bubble-text').textContent,source:audio?.getAttribute('src'),playing:!!audio&&!audio.paused,currentTime:audio?.currentTime})");
  assert.equal(head.compact,true);assert.match(head.source,/touch-voices\/head-\d.wav\?v=2$/);assert.equal(head.playing,true);assert.ok(head.currentTime>0);
  await writeFile(path.join(output,'touch-interaction-preview.png'),(await win.webContents.capturePage()).toPNG());
  // The remaining hit regions exercise the real click handler without repeating audible previews.
  await js('stopVoice();voiceEnabled=false;void 0;');
  const regions=await js(`(async()=>{
    const result=[];for(const [x,y,region] of [[.1,.3,'ear'],[.5,.4,'cheek'],[.1,.6,'hand'],[.5,.65,'belly'],[.1,.9,'tail'],[.5,.94,'feet']]){
      lastTouchAt=0;const r=document.getElementById('pet-hit').getBoundingClientRect();
      document.getElementById('pet-hit').dispatchEvent(new MouseEvent('click',{detail:1,clientX:r.left+x*r.width,clientY:r.top+y*r.height}));
      result.push({region,compact:document.body.classList.contains('compact'),text:document.getElementById('bubble-text').textContent,
        matches:CompanionTouches.regions[region].lines.includes(document.getElementById('bubble-text').textContent),silent:audio===null});
    }return result;
  })()`);
  assert.ok(regions.every(item=>item.compact&&item.matches&&item.silent));
  await js("document.getElementById('quick-panel').click();void 0;");
  assert.equal(await js("document.body.classList.contains('compact')"),false);
  const momo=await js(`(async()=>{
    const select=document.getElementById('voice-choice');select.value='momo';select.dispatchEvent(new Event('change'));
    const decoder=new AudioContext(),clips=[];
    try{for(const [region,{lines}] of Object.entries(CompanionTouches.regions))for(let index=0;index<lines.length;index++){
      const response=await fetch('/game-companion/touch-voices/momo/'+region+'-'+index+'.wav?v=2');
      if(!response.ok)throw Error('Momo interaction missing');
      const buffer=await decoder.decodeAudioData(await response.arrayBuffer());clips.push(buffer.duration);
    }}finally{await decoder.close();}
    let previewRequest,actualVoice;
    const originalFetch=window.fetch;
    window.fetch=async(url,options)=>{const response=await originalFetch(url,options);
      if(url==='/game-companion/voice'){previewRequest=JSON.parse(options.body);actualVoice=response.headers.get('x-companion-voice');}return response;};
    try{
      document.getElementById('preview-voice').click();
      const until=Date.now()+60000;
      while(Date.now()<until&&(!audio||audio.paused)){
        if(!voiceRequest&&!audio)throw Error('Momo preview failed');
        await new Promise(resolve=>setTimeout(resolve,200));
      }
      if(!audio||audio.paused)throw Error('Momo preview timed out');
      stopVoice();voiceEnabled=true;setPanel(false);lastTouchAt=0;await touchPet('ear');
      const source=audio?.getAttribute('src'),playing=!!audio&&!audio.paused;
      stopVoice();
      return {clips:clips.length,decoded:clips.every(seconds=>seconds>1&&seconds<15),previewRequest,actualVoice,
        source,playing,selected:voiceChoice,saved:localStorage.getItem('companion-voice-choice'),emotionPreviewsHidden:document.getElementById('emotion-previews').hidden};
    }finally{window.fetch=originalFetch;}
  })()`);
  assert.equal(momo.clips,21);assert.equal(momo.decoded,true);assert.equal(momo.actualVoice,'Momo');
  assert.equal(momo.previewRequest.voiceId,'momo');assert.equal(momo.selected,'momo');assert.equal(momo.saved,'momo');
  assert.equal(momo.emotionPreviewsHidden,true);assert.equal(momo.playing,true);assert.match(momo.source,/touch-voices\/momo\/ear-/);
  const after=await request('/game-companion/state');
  assert.deepEqual(after.messages,before.messages);assert.deepEqual(after.budget,before.budget);
  await writeFile(path.join(output,'touch-ui-check.json'),JSON.stringify({completed:true,checkedAt:new Date().toISOString(),decoded,head,regions,momo,
    panelButtonOpened:true,chatAndBudgetPreserved:true},null,2));
  }finally{
    await js(`stopVoice();voiceChoice=${JSON.stringify(originalVoice==='momo'?'momo':'longhua')};renderVoiceChoice();${originalVoice===null?"localStorage.removeItem('companion-voice-choice')":`localStorage.setItem('companion-voice-choice',${JSON.stringify(originalVoice)})`};void 0;`);
  }
};
