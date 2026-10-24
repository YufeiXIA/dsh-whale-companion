const assert=require('node:assert/strict');
const {writeFile}=require('node:fs/promises');
const path=require('node:path');
module.exports=async function({win,output,getRoute,getFacing,startInertia,stopInertia}){
  const js=code=>win.webContents.executeJavaScript(code);
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function wait(check,label){for(let i=0;i<100;i++){if(await check())return;await sleep(100);}throw Error('Motion check: '+label);}
  await js("setPanel(false);petAnimator.desktop(false,[],false);petAnimator.perform('magic/card_magic');void 0;");
  await wait(()=>js("document.getElementById('pet').src.includes('card_magic')&&document.getElementById('pet').currentTime>.4"),'first clip');
  const layers=await js("document.querySelectorAll('video.pet-layer').length");assert.equal(layers,2);
  const replay=await js("document.getElementById('pet').currentTime=6;petAnimator.perform('magic/card_magic');document.getElementById('pet').currentTime");
  assert.ok(replay>=5.9,'old frame remains while new clip loads');
  await wait(()=>js("document.getElementById('pet').src.includes('card_magic')&&document.getElementById('pet').currentTime<1"),'replay from start');
  // Put enough room on either side so this tests movement, not edge rejection.
  win.setPosition(600,350);
  await js("petAnimator.desktop(true,['magic/card_magic'],true,'natural');petAnimator.suspend(false);void 0;");
  // Advance actual clip boundaries until the weighted natural chain chooses movement.
  for(let i=0;i<100&&!getRoute();i++){
    await sleep(150);
    if(!getRoute())await js("document.getElementById('pet').onended?.();void 0;");
  }
  await wait(()=>Boolean(getRoute()),'route created');
  const before=win.getBounds();
  await js("document.getElementById('pet').currentTime=3;document.getElementById('pet-hit').dispatchEvent(new MouseEvent('mousemove',{bubbles:true}));void 0;");
  await sleep(350);
  assert.ok(getRoute(),'hover must not cancel a running route');
  const after=win.getBounds();assert.notEqual(after.x,before.x);
  const direction=getFacing();
  await js("petAnimator.perform('daily/big_stretch');void 0;");
  await wait(()=>getRoute()===null,'manual action stops movement');
  assert.equal(getFacing(),direction,'stopping preserves facing');
  await js("petAnimator.desktop(false,[],false);petAnimator.perform('turn/looking_around');void 0;");
  await wait(()=>js("document.getElementById('pet').src.includes('looking_around')&&document.getElementById('pet').currentTime>0"),'turn decoded');
  await js("document.getElementById('pet').currentTime=document.getElementById('pet').duration-.1;void 0;");
  await wait(()=>getFacing()===-direction,'turn changes logical direction');
  const flingStart=win.getBounds();startInertia({vx:1.5,vy:.2});
  await wait(()=>js("document.getElementById('pet').src.includes('turn_into_ball')&&document.getElementById('pet').currentTime>=2"),'ball seek');
  await sleep(250);assert.notEqual(win.getBounds().x,flingStart.x);stopInertia();
  await wait(()=>js("document.getElementById('pet').src.includes('breathing')"),'settle');
  const options=await js("[...document.getElementById('desktop-mode').options].map(o=>o.value)");
  assert.deepEqual(options,['natural','showcase']);
  await writeFile(path.join(output,'natural-motion-check.json'),JSON.stringify({completed:true,layers,
    sameActionRestart:true,hoverContinuesMovement:true,facingPreserved:true,turnFacing:true,inertia:true,options,
    note:'Real Electron decoding, IPC and native movement with synthetic events; no physical-mouse or mixed-DPI acceptance.'},null,2));
};
