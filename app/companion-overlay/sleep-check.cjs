const assert=require('node:assert/strict');
const {writeFile}=require('node:fs/promises');
const {once}=require('node:events');
const path=require('node:path');
module.exports=async({win,output})=>{
  const js=code=>win.webContents.executeJavaScript(code,true);
  const waitForSleep=()=>js(`new Promise((resolve,reject)=>{
    const deadline=Date.now()+10000;
    const check=()=>{const pet=$('pet');
      if(pet.currentSrc.endsWith('/sleep_loop.webm')&&pet.readyState>=2&&!pet.paused)return resolve({src:pet.currentSrc,duration:pet.duration,loop:pet.loop,saved:localStorage.getItem('companion-sleep')});
      if(Date.now()>deadline)return reject(Error('Sleep clip did not start'));setTimeout(check,50);
    };check();
  })`);
  const before=await js(`JSON.stringify(['companion-free-roam','companion-random-roam','companion-desktop-mode','companion-stroll','companion-voice'].map(key=>localStorage.getItem(key)))`);
  await js('setSleep(true)');const started=await waitForSleep();assert.equal(started.loop,true);
  const loopCheck=await js(`new Promise((resolve,reject)=>{
    const started=performance.now();let previous=-1,wraps=0,samples=0;
    const check=()=>{
      const pet=$('pet');samples++;
      if(!pet.currentSrc.endsWith('/sleep_loop.webm')||!pet.loop||pet.paused)return reject(Error('Sleep was interrupted'));
      if(previous>=0&&pet.currentTime<previous-0.2)wraps++;previous=pet.currentTime;
      if(wraps>=3)return resolve({wraps,samples,elapsedMs:Math.round(performance.now()-started)});
      if(performance.now()-started>25000)return reject(Error('Not looping'));
      setTimeout(check,50);
    };check();
  })`);
  await js(`petAnimator.listen(true);petAnimator.speaking();petAnimator.touch();petAnimator.drag(true);petAnimator.drag(false);
    petAnimator.perform('clicks/happy_hop');petAnimator.tick();void 0;`);
  const interrupted=await waitForSleep();assert.equal(interrupted.loop,true);
  const silence=await js(`({noVoice:audio===null&&voiceRequest===null,quiet:quietActive(),moveDisabled:$('free-roam').disabled})`);
  assert.equal(silence.noVoice,true);assert.equal(silence.quiet,true);assert.equal(silence.moveDisabled,true);
  await writeFile(path.join(output,'sleep-mode-live.png'),(await win.capturePage()).toPNG());
  await js('setSleep(false)');
  await js(`new Promise((resolve,reject)=>{const deadline=Date.now()+5000;const check=()=>{
    if(!$('pet').currentSrc.endsWith('/sleep_loop.webm'))return resolve();if(Date.now()>deadline)return reject(Error('Did not wake'));setTimeout(check,50);
  };check();})`);
  assert.equal(await js(`JSON.stringify(['companion-free-roam','companion-random-roam','companion-desktop-mode','companion-stroll','companion-voice'].map(key=>localStorage.getItem(key)))`),before);
  await js('setSleep(true)');await waitForSleep();
  const loaded=once(win.webContents,'did-finish-load');win.webContents.reloadIgnoringCache();await loaded;
  await js('initialState.then(()=>undefined)');const restored=await waitForSleep();assert.equal(restored.saved,'true');
  await writeFile(path.join(output,'sleep-check.json'),JSON.stringify({completed:true,started,loopCheck,silence,wakeRestoresPreferences:true,restored,checkedAt:new Date().toISOString()},null,2));
};
