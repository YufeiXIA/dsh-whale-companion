const assert=require('node:assert/strict');
const {writeFile}=require('node:fs/promises');
const path=require('node:path');
const {planPoint,roamPosition}=require('./roaming.cjs');

module.exports=async function({win,picker,screen,output,getRoute}){
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function waitFor(check,label){for(let i=0;i<160;i++){if(await check())return;await sleep(100);}throw Error('Point movement check timed out: '+label);}
  async function openPicker(display){
    await win.webContents.executeJavaScript("document.getElementById('pet-hit').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));void 0;");
    await waitFor(()=>{
      for(const p of picker.windows.values())p.setOpacity(0);
      return picker.windows.size>0&&[...picker.windows.values()].every(p=>!p.webContents.isLoading());
    },'picker open');
    return [...picker.windows.values()].find(p=>screen.getDisplayMatching(p.getBounds()).id===display.id);
  }
  await win.webContents.executeJavaScript('setPanel(false);petAnimator.desktop(false,[],false);void 0;');
  await sleep(150);
  const scale=await win.webContents.executeJavaScript("Number(document.getElementById('pet-size').value)/100");
  const results=[];
  for(const display of screen.getAllDisplays()){
  await win.webContents.executeJavaScript("petAnimator.perform('magic/card_magic');void 0;");
  const start=win.getBounds();
  const choice=await openPicker(display);
  const bounds=choice.getBounds();
  const area=screen.getDisplayMatching(bounds).workArea;
  let target={x:area.x+Math.round(area.width*0.45),y:area.y+Math.round(area.height*0.65)};
  let expected=roamPosition(planPoint(start,area,target,scale),1,start);
  const selectedAt=performance.now();
  await choice.webContents.executeJavaScript(`document.body.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:0,clientX:${target.x-bounds.x},clientY:${target.y-bounds.y}}));void 0;`).catch(()=>{});
  await waitFor(()=>getRoute()!==null,'route start');
  await win.webContents.executeJavaScript("window.dispatchEvent(new CustomEvent('companion-pet-near',{detail:true}));void 0;");
  await waitFor(()=>win.webContents.executeJavaScript("document.getElementById('pet').getAttribute('src').includes('target_point_run')&&document.getElementById('pet').currentTime>0"),'run decoded');
  const firstRunMs=Math.round(performance.now()-selectedAt);
  assert.ok(firstRunMs<1500,'the run introduction should replace the old action promptly: '+firstRunMs);
  assert.ok(await win.webContents.executeJavaScript("document.getElementById('pet').currentTime<2"),'keep the preparation segment');
  await waitFor(()=>Math.hypot(win.getBounds().x-start.x,win.getBounds().y-start.y)>2,'first movement');
  const firstMoveMs=Math.round(performance.now()-selectedAt);
  assert.ok(firstMoveMs>=1800,'movement follows the preserved two-second preparation');
  assert.equal(await win.webContents.executeJavaScript("document.body.classList.contains('quick-chat-open')"),false,'hover cannot cancel a point command');
  await waitFor(()=>win.webContents.executeJavaScript("document.getElementById('pet').getAttribute('src').includes('target_point_run')&&document.getElementById('pet').currentTime>0"),'run decoded');
  const clip=await win.webContents.executeJavaScript("document.getElementById('pet').getAttribute('src')");
  assert.match(clip,/target_point_run/);
  let retargeted=false;
  if(results.length===0){
    const nextChoice=await openPicker(display),nextBounds=nextChoice.getBounds(),restart=win.getBounds();
    target={x:area.x+Math.round(area.width*.7),y:area.y+Math.round(area.height*.55)};
    expected=roamPosition(planPoint(restart,area,target,scale),1,restart);
    await win.webContents.executeJavaScript("window.dispatchEvent(new CustomEvent('companion-pet-near',{detail:true}));void 0;");
    await sleep(180);
    assert.equal(await win.webContents.executeJavaScript("document.body.classList.contains('quick-chat-open')"),false);
    await nextChoice.webContents.executeJavaScript(`document.body.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:0,clientX:${target.x-nextBounds.x},clientY:${target.y-nextBounds.y}}));void 0;`).catch(()=>{});
    await waitFor(()=>getRoute()!==null,'replacement route');retargeted=true;
  }
  await waitFor(()=>getRoute()===null,'arrival');
  const end=win.getBounds();
  assert.ok(Math.abs(end.x-expected.x)<=1&&Math.abs(end.y-expected.y)<=1,'arrival matches the selected point across DPI rounding');
  await waitFor(()=>win.webContents.executeJavaScript("document.getElementById('pet').getAttribute('src').includes('arrival_wave')"),'arrival decoded');
  const arrival=await win.webContents.executeJavaScript("document.getElementById('pet').getAttribute('src')");
  assert.match(arrival,/arrival_wave/);
  assert.equal(picker.windows.size,0,'Choosing must remove all click-capture windows');
  results.push({display:display.id,dpi:display.scaleFactor,start,target,end,expected,clip,arrival,firstRunMs,firstMoveMs,retargeted});
  }
  const end=win.getBounds();
  const cancelWindow=await openPicker(screen.getDisplayMatching(end));
  await cancelWindow.webContents.executeJavaScript("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));void 0;").catch(()=>{});
  await waitFor(()=>picker.windows.size===0,'cancel');
  assert.deepEqual(win.getBounds(),end,'Cancel must not move the pet');
  await writeFile(path.join(output,'point-move-check.json'),JSON.stringify({completed:true,results,cancelled:true,
    note:'Real connected displays, Electron selection, IPC, video and window movement; synthetic pointer/keyboard events.'},null,2));
};
