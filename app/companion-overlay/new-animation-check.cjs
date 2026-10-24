const assert=require('node:assert/strict');
const {writeFile}=require('node:fs/promises');
const path=require('node:path');

module.exports=async function({win,output}){
  const js=code=>win.webContents.executeJavaScript(code);
  async function wait(check,label){
    for(let i=0;i<80;i++){
      if(await check())return;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    const video=await js("(()=>{const v=document.getElementById('pet');return {path:new URL(v.src).pathname,time:v.currentTime,duration:v.duration,loop:v.loop,ended:v.ended,paused:v.paused,focus:document.activeElement.id};})()");
    throw Error('New animation check: '+label+' '+JSON.stringify(video));
  }
  await js("setPanel(false);document.getElementById('chat').blur();stopVoice();petAnimator.listen(false);petAnimator.quiet();petAnimator.desktop(false,[],false);petAnimator.suspend(false);petAnimator.update({scheduler:{paused:true},messages:[]});void 0;");
  assert.equal(await js("document.getElementById('pet-action').options.length"),164);
  const {generalGameExpressions,naturalGameExpressions}=await import('../dsh-game-companion/src/general-game-expressions.js');
  const clips=[];
  const natural=new Set(['listening_nod','bright_idea','relieved','controller_play','card_strategy',...naturalGameExpressions]);
  for(const emotion of [...natural,'shield_ready','potion_offer','map_route','loot_proud',...Object.keys(generalGameExpressions).filter(name=>!natural.has(name))]){
    await js(`petAnimator.update({scheduler:{paused:true},messages:[{id:${JSON.stringify(emotion)},role:'assistant',emotion:${JSON.stringify(emotion)},at:Date.now()}]});void 0;`);
    const playing=()=>js(`(()=>{const v=document.getElementById('pet');return v.src.includes('/animations/${emotion}.webm')&&v.currentTime>.2&&!v.paused;})()`);
    await wait(playing,emotion+' chat playback');
    const actual=await js("(()=>{const v=document.getElementById('pet');return {width:v.videoWidth,height:v.videoHeight,layers:document.querySelectorAll('video.pet-layer').length};})()");
    assert.equal(actual.width,640);assert.equal(actual.height,360);assert.equal(actual.layers,2);
    await js("document.getElementById('pet').currentTime=4;void 0;");
    await wait(()=>js("(()=>{const v=document.getElementById('pet');return !v.seeking&&v.currentTime>=4&&v.readyState>=3;})()"),emotion+' action peak');
    await writeFile(path.join(output,`new-animation-${emotion}.png`),(await win.webContents.capturePage()).toPNG());
    await js("document.getElementById('pet').currentTime=document.getElementById('pet').duration-.08;void 0;");
    await wait(()=>js("document.getElementById('pet').src.includes('/idle/breathing.webm')"),emotion+' return to idle');
    const mode=natural.has(emotion)?'natural':'showcase';
    await js(`petAnimator.desktop(true,['companion/${emotion}'],false,${JSON.stringify(mode)});void 0;`);
    // Natural mode may legitimately choose idle/turn before this action.
    for(let i=0;i<50;i++){
      await new Promise(resolve=>setTimeout(resolve,150));
      if(await js(`document.getElementById('pet').src.includes('/animations/${emotion}.webm')`))break;
      await js("document.getElementById('pet').onended?.();void 0;");
    }
    await wait(playing,emotion+' '+mode+' playback');
    clips.push({emotion,...actual,chatTriggered:true,desktopMode:mode,desktopTriggered:true,returnedToIdle:true});
    await js("petAnimator.desktop(false,[],false);void 0;");
  }
  await writeFile(path.join(output,'new-animations-check.json'),JSON.stringify({completed:true,clips,
    note:'Real Electron assets, decode, chat emotion events, natural-chain playback and return to idle; no paid model or voice requests.'},null,2));
};
