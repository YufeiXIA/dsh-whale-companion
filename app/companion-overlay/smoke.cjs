const assert = require('node:assert/strict');
const { writeFile } = require('node:fs/promises');
const path = require('node:path');

module.exports = async function smoke({ win, output, request, nativeState, setClickThrough, showWithoutFocus, closeSafely, appearanceTest=false, checkPointMovement }) {
  const before = await request('/game-companion/state');
  if(!appearanceTest)assert.equal(before.scheduler.paused, true, 'Smoke test requires paused companion');
  else await win.webContents.executeJavaScript(`
    voiceEnabled=false;stopVoice();
    const frozenState=${JSON.stringify(before)};
    const originalFetch=window.fetch;
    window.fetch=(url,options)=>url==='/game-companion/state'?Promise.resolve(new Response(JSON.stringify(frozenState))):originalFetch(url,options);
    render(frozenState);void 0;
  `);
  showWithoutFocus();
  // Capture the renderer without flashing diagnostic dialogue over the user's game.
  win.setOpacity(0);
  for (let attempt = 0; attempt < 40; attempt++) {
    const ready = await win.webContents.executeJavaScript('Boolean(document.getElementById("nativebar") && document.getElementById("status").textContent !== "正在连接…" && document.getElementById("pet").currentTime > 0.5)');
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const compact = await win.webContents.executeJavaScript(`({
    enabled:document.body.classList.contains('compact'),
    panelHidden:getComputedStyle(document.querySelector('.companion-card')).display==='none',
    barHidden:getComputedStyle(document.getElementById('nativebar')).display==='none',
    noHistoryBubble:document.getElementById('bubble-text').textContent===''
  })`);
  assert.ok(Object.values(compact).every(Boolean),'Default must show only the pet, without old speech or controls: '+JSON.stringify(compact));
  const savedSize=await win.webContents.executeJavaScript("Number(document.getElementById('pet-size').value)");
  await win.webContents.executeJavaScript("document.getElementById('pet-size').value='100';document.getElementById('pet-size').dispatchEvent(new Event('input'));");
  await writeFile(path.join(output,'overlay-pet-preview.png'),(await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript("document.getElementById('pet-hit').click()");
  for(let attempt=0;attempt<40;attempt++){
    if(await win.webContents.executeJavaScript("document.getElementById('pet').currentTime>0.6"))break;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  const rendered = await win.webContents.executeJavaScript(`({
    nativeBar: Boolean(document.getElementById('nativebar')),
    status: document.getElementById('status').textContent,
    messages: document.querySelectorAll('#messages article').length,
    deliveryLabels: document.querySelectorAll('#messages article small').length,
    budget: document.getElementById('budget').textContent,
    focused: document.body.classList.contains('focus'),
    detailsClosed: !document.getElementById('technical').open,
    voiceButton: document.getElementById('voice').textContent,
    ambientToggle: document.getElementById('ambient-enabled').checked,
    voicePreference: localStorage.getItem('companion-voice') === 'on',
    voicePolicy: document.getElementById('sound-settings').textContent,
    deliveryHidden: [...document.querySelectorAll('.delivery')].every(el => getComputedStyle(el).display === 'none'),
    petReady: document.getElementById('pet').readyState,
    petTime: document.getElementById('pet').currentTime,
    drag: getComputedStyle(document.getElementById('nativebar')).webkitAppRegion,
    buttonDrag: getComputedStyle(document.getElementById('native-close')).webkitAppRegion,
    nodeExposed: typeof window.require !== 'undefined'
  })`);
  assert.equal(rendered.nativeBar, true);
  assert.equal(rendered.messages, before.messages.length);
  assert.equal(rendered.deliveryLabels, before.messages.filter(message => before.chatDelivery?.some(delivery => delivery.id === message.id)).length);
  assert.match(rendered.budget, /模型调用/);
  assert.equal(rendered.focused, true);
  assert.equal(rendered.detailsClosed, true);
  assert.equal(rendered.voiceButton, rendered.voicePreference ? '语音已开' : '开启语音');
  assert.equal(rendered.ambientToggle, before.ambient?.enabled === true);
  assert.match(rendered.voicePolicy, /长文字留在屏幕上/);
  assert.equal(rendered.deliveryHidden, true);
  assert.equal(rendered.nodeExposed, false);
  assert.equal(rendered.petReady, 4);
  assert.ok(rendered.petTime > 0.5);
  assert.equal(rendered.drag, 'drag'); assert.equal(rendered.buttonDrag, 'no-drag');
  const panelDesign=await win.webContents.executeJavaScript(`(()=>{
    const button=document.getElementById('hide-panel'),r=button.getBoundingClientRect();
    return {integratedBar:document.querySelector('.companion-card').contains(document.getElementById('nativebar')),
      collapseLabel:button.textContent,collapseHeight:r.height,
      collapseClickable:button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};
  })()`);
  assert.equal(panelDesign.integratedBar,true);
  assert.match(panelDesign.collapseLabel,/回到桌宠/);
  assert.ok(panelDesign.collapseHeight>=32 && panelDesign.collapseClickable);
  const portraitMode=await win.webContents.executeJavaScript(`(()=>{
    const saved=localStorage.getItem('companion-portrait-mode');
    const result={saved,restored:(document.body.dataset.portraitMode==='animated')===(saved==='animated')};
    document.getElementById('portrait-animated').click();
    const button=document.getElementById('portrait-animated'),r=button.getBoundingClientRect();
    result.animated=getComputedStyle(document.getElementById('stage')).visibility==='visible';
    result.artHidden=getComputedStyle(document.getElementById('card-art')).visibility==='hidden';
    result.savedAnimated=localStorage.getItem('companion-portrait-mode')==='animated';
    result.clickable=button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
    return result;
  })()`);
  assert.ok(portraitMode.restored&&portraitMode.animated&&portraitMode.artHidden&&portraitMode.savedAnimated&&portraitMode.clickable);
  const animationTime=await win.webContents.executeJavaScript("document.getElementById('pet').currentTime");
  await new Promise(resolve=>setTimeout(resolve,200));
  assert.notEqual(await win.webContents.executeJavaScript("document.getElementById('pet').currentTime"),animationTime,'Header animation must play');
  await writeFile(path.join(output,'overlay-animated-preview.png'),(await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript("document.getElementById('portrait-static').click()");
  assert.equal(await win.webContents.executeJavaScript("getComputedStyle(document.getElementById('stage')).visibility==='hidden' && getComputedStyle(document.getElementById('card-art')).visibility==='visible' && localStorage.getItem('companion-portrait-mode')==='static'"),true);
  const characterCard=await win.webContents.executeJavaScript(`(async()=>{
    const art=document.getElementById('card-art');await art.decode();
    document.getElementById('portrait-card').click();
    const sheet=document.getElementById('character-sheet');
    await document.getElementById('profile-art').decode();
    const result={open:sheet.open,artLoaded:art.naturalWidth>0,credit:sheet.textContent.includes('ZipZipPipe')};
    return result;
  })()`);
  assert.ok(Object.values(characterCard).every(Boolean),'Character card must open with its illustration and credit');
  await new Promise(resolve=>setTimeout(resolve,120));
  await writeFile(path.join(output,'character-card-preview.png'),(await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript("document.getElementById('close-character').click()");
  assert.equal(await win.webContents.executeJavaScript("document.getElementById('character-sheet').open"),false);
  await win.webContents.executeJavaScript("document.getElementById('portrait-card').click()");
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});
  win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
  await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(await win.webContents.executeJavaScript("document.getElementById('character-sheet').open"),false,'Escape closes the character card before releasing game focus');
  assert.equal(win.isAlwaysOnTop(), true, JSON.stringify({ visible: win.isVisible(), minimized: win.isMinimized(), focused: win.isFocused(), bounds: win.getBounds() }));
  assert.equal(win.isFocused(), false);
  assert.equal(nativeState().toggleAvailable, true);
  setClickThrough(true); assert.equal(win.isFocusable(), false);
  setClickThrough(false); assert.equal(win.isFocusable(), true);
  assert.equal(win.isAlwaysOnTop(), true);
  const bounds = win.getBounds();
  win.setPosition(bounds.x - 20, bounds.y + 20);
  assert.equal(win.getBounds().x, bounds.x - 20);
  assert.equal(win.getBounds().y, bounds.y + 20);
  win.webContents.send('companion-focus-chat');
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(await win.webContents.executeJavaScript('document.activeElement.id'), 'chat');
  // Exercise the smallest supported window, where controls must leave room for chat.
  win.setSize(350, 520);
  await new Promise(resolve => setTimeout(resolve, 100));
  const layout = await win.webContents.executeJavaScript(`(() => {
    const chat=document.getElementById('chat').getBoundingClientRect();
    const messages=document.getElementById('messages').getBoundingClientRect();
    document.getElementById('sound-settings').open=true;
    const settings=document.querySelector('#sound-settings .settings-popover').getBoundingClientRect();
    document.getElementById('sound-settings').open=false;
    return {chatVisible:chat.bottom<=innerHeight && chat.left>=0 && chat.right<=innerWidth,
      messageHeight:messages.height,settingsVisible:settings.left>=0 && settings.right<=innerWidth && settings.bottom<=innerHeight,
      overflow:document.body.scrollWidth>innerWidth,background:getComputedStyle(document.body).backgroundColor};
  })()`);
  assert.equal(layout.chatVisible, true);
  assert.ok(layout.messageHeight >= 80, 'Compact window must retain readable chat space');
  assert.equal(layout.settingsVisible, true);
  assert.equal(layout.overflow, false);
  assert.equal(layout.background, 'rgba(0, 0, 0, 0)');
  await writeFile(path.join(output,'overlay-small-preview.png'),(await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript("document.getElementById('portrait-animated').click()");
  await new Promise(resolve=>setTimeout(resolve,150));
  assert.equal(win.getBounds().width,350,'Switching portrait must preserve the window size');
  await writeFile(path.join(output,'overlay-small-animated-preview.png'),(await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript("document.getElementById('portrait-static').click()");
  win.setSize(bounds.width, bounds.height);
  await new Promise(resolve => setTimeout(resolve, 100));
  let voicePlayback = null;
  const chatCalibration = process.env.COMPANION_CHAT_CALIBRATION === '1';
  if (process.env.COMPANION_VOICE_SMOKE === '1' || chatCalibration) {
    // Explicit opt-in only: real preview or real model chat, with audible playback.
    await win.webContents.executeJavaScript(`
      globalThis.voiceCheck={playing:false,ended:false,duration:null};
      const originalAudio=window.Audio;
      window.Audio=function(...args){
        const player=new originalAudio(...args);
        player.addEventListener('playing',()=>{voiceCheck.playing=true;voiceCheck.duration=player.duration;});
        player.addEventListener('ended',()=>{voiceCheck.ended=true;});
        return player;
      };
      void 0;
    `);
    if (chatCalibration) {
      await win.webContents.executeJavaScript(`
        if(document.getElementById('voice').getAttribute('aria-pressed')!=='true')document.getElementById('voice').click();
        document.getElementById('chat').value='大肥鱼，你刚才打得好菜哦。';
        document.querySelector('form').requestSubmit(document.querySelector('form button'));
      `);
    } else await win.webContents.executeJavaScript("document.getElementById('preview-voice').click()");
    for (let attempt = 0; attempt < 160; attempt++) {
      voicePlayback = await win.webContents.executeJavaScript('({...voiceCheck, muted:audio?.muted ?? false, volume:Number(document.getElementById("volume").value)})');
      if (voicePlayback.ended) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.equal(voicePlayback.playing, true, 'Preview must reach real HTML Audio playback');
    assert.equal(voicePlayback.ended, true, 'Preview must finish');
    assert.equal(voicePlayback.muted, false);
    assert.ok(voicePlayback.duration > 0);
    if (chatCalibration) {
      const after = await request('/game-companion/state');
      const previous = new Set(before.messages.map(message => message.id));
      voicePlayback.modelReplies = after.messages.filter(message => message.role === 'assistant' && !previous.has(message.id));
      assert.ok(voicePlayback.modelReplies.some(message => message.spoken === true));
      assert.equal(after.scheduler.paused, true, 'Calibration must leave game actions paused');
    }
  }
  await writeFile(path.join(output, 'overlay-preview.png'), (await win.webContents.capturePage()).toPNG());
  const gameControls=await win.webContents.executeJavaScript(`(()=>{
    document.getElementById('technical').open=true;
    const button=document.getElementById('exit-whale-game'),r=button.getBoundingClientRect();
    return {label:button.textContent,visible:r.top>=0&&r.bottom<=innerHeight,autoExit:document.getElementById('auto-exit-game').checked};
  })()`);
  assert.equal(gameControls.label,'退出鲸鱼游戏');assert.equal(gameControls.visible,true);
  await writeFile(path.join(output,'game-controls-preview.png'),(await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript("document.getElementById('technical').open=false");
  await win.webContents.executeJavaScript("document.getElementById('pet-size').value='140';document.getElementById('pet-size').dispatchEvent(new Event('input'));");
  await new Promise(resolve=>setTimeout(resolve,150));
  await writeFile(path.join(output,'overlay-140-preview.png'),(await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript("document.getElementById('pet-size').value='100';document.getElementById('pet-size').dispatchEvent(new Event('input'));");
  await win.webContents.executeJavaScript("document.getElementById('hide-panel').click();showBubble('先别急，等我一下。');");
  await new Promise(resolve=>setTimeout(resolve,1400));
  const bubbleLayout=await win.webContents.executeJavaScript(`(()=>{const e=document.getElementById('speech-bubble'),r=e.getBoundingClientRect();return {width:r.width,top:r.top,bottom:r.bottom,tail:getComputedStyle(e,':after').content};})()`);
  assert.ok(bubbleLayout.width<220,'Short speech should fit its words instead of stretching across the window');
  assert.ok(bubbleLayout.top>=0 && bubbleLayout.bottom<340);
  assert.notEqual(bubbleLayout.tail,'none');
  await writeFile(path.join(output,'overlay-bubble-preview.png'),(await win.webContents.capturePage()).toPNG());
  await new Promise(resolve=>setTimeout(resolve,12000));
  assert.equal(await win.webContents.executeJavaScript("getComputedStyle(document.getElementById('speech-bubble')).opacity"),'0','Temporary speech must fade away');
  assert.equal(win.getBounds().height,412,'Closing chat must shrink the native window');
  const sizes=[];
  for(const size of [60,160]){
    await win.webContents.executeJavaScript(`document.getElementById('pet-size').value='${size}';document.getElementById('pet-size').dispatchEvent(new Event('input'));`);
    await new Promise(resolve=>setTimeout(resolve,100));
    const actual=await win.webContents.executeJavaScript(`({video:document.getElementById('pet').getBoundingClientRect().width,hit:document.getElementById('pet-hit').getBoundingClientRect().width,saved:localStorage.getItem('companion-pet-size')})`);
    assert.ok(Math.abs(actual.video-300*size/100)<1);
    assert.ok(Math.abs(actual.hit-130*size/100)<1);
    assert.equal(actual.saved,String(size));
    assert.equal(win.getBounds().height,Math.round(202*size/100+210));
    const longBubble=await win.webContents.executeJavaScript(`(()=>{showBubble('鲸'.repeat(120));const r=document.getElementById('speech-bubble').getBoundingClientRect();return {top:r.top,left:r.left,right:r.right,height:r.height};})()`);
    assert.ok(longBubble.top>=0 && longBubble.left>=0 && longBubble.right<=win.getBounds().width,'Long speech must stay inside the scaled window');
    sizes.push({size,...actual});
  }
  await new Promise(resolve=>{win.webContents.once('did-finish-load',resolve);win.webContents.reload();});
  await new Promise(resolve=>setTimeout(resolve,150));
  assert.equal(await win.webContents.executeJavaScript("document.getElementById('pet-size').value"),'160','Size survives reload');
  await win.webContents.executeJavaScript(`document.getElementById('pet-size').value='${savedSize}';document.getElementById('pet-size').dispatchEvent(new Event('input'));`);
  await new Promise(resolve=>setTimeout(resolve,100));
  if(appearanceTest){
    win.setBounds({width:960,height:620});
    await win.webContents.executeJavaScript(`
      globalThis.animationProof=[...new Set([...createPetAnimator.toString().matchAll(/['"]([a-z_]+\\/[a-z_]+)['"]/g)].map(m=>m[1]))];
      const proof=document.createElement('div');proof.id='animation-proof';
      proof.style.cssText='position:fixed;inset:0;z-index:9999;background:#eaf0fa;display:grid;grid-template-columns:repeat(6,1fr);gap:4px;padding:6px';
      for(const path of animationProof){const cell=document.createElement('div'),v=document.createElement('video'),label=document.createElement('div');
        v.src=path.startsWith('companion/')?'/game-companion/animations/'+path.slice(10)+'.webm':'/whale-pet/'+path+'.webm';v.muted=true;v.autoplay=true;v.loop=true;v.style.cssText='width:100%;height:80px;object-fit:contain';
        label.textContent=path;label.style.cssText='text-align:center;font-size:9px;color:#52607c';cell.append(v,label);proof.append(cell);}
      document.body.append(proof);void 0;
    `);
    for(let attempt=0;attempt<80;attempt++){
      if(await win.webContents.executeJavaScript("[...document.querySelectorAll('#animation-proof video')].every(v=>v.readyState>=3&&v.currentTime>0.4)"))break;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    const assets=await win.webContents.executeJavaScript("[...document.querySelectorAll('#animation-proof video')].map(v=>({path:new URL(v.src).pathname,ready:v.readyState,time:v.currentTime,error:v.error?.code}))");
    assert.ok(assets.length>=33&&assets.every(v=>v.ready>=3&&v.time>0.4&&!v.error),'Every automatic animation must decode and play');
    await writeFile(path.join(output,'animation-assets-check.json'),JSON.stringify(assets,null,2));
    await writeFile(path.join(output,'animation-preview.png'),(await win.webContents.capturePage()).toPNG());
    const manual=await win.webContents.executeJavaScript(`(()=>{
      document.getElementById('animation-proof').remove();
      document.getElementById('pet-action').value='magic/card_magic';
      document.getElementById('perform-action').click();
      return {count:document.getElementById('pet-action').options.length,path:document.getElementById('pet').getAttribute('src'),compact:document.body.classList.contains('compact')};
    })()`);
    assert.equal(manual.count,164);assert.equal(manual.compact,true);
    for(let i=0;i<50;i++){
      if(await win.webContents.executeJavaScript("document.getElementById('pet').getAttribute('src')==='/whale-pet/magic/card_magic.webm'&&document.getElementById('pet').currentTime>0"))break;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.equal(await win.webContents.executeJavaScript("document.getElementById('pet').getAttribute('src')"),'/whale-pet/magic/card_magic.webm');
    // Keep this appearance run read-only while exercising the real desktop toggle.
    await win.webContents.executeJavaScript(`
      globalThis.savedRoamPreference=localStorage.getItem('companion-free-roam');
      const desktopFetch=window.fetch;
      window.fetch=(url,options)=>url==='/game-companion/control'&&JSON.parse(options.body).action==='pause'
        ?Promise.resolve(new Response(JSON.stringify({...state,scheduler:{...state.scheduler,paused:true,active:false}})))
        :desktopFetch(url,options);
      setPanel(true);document.getElementById('animation-settings').open=true;
      document.getElementById('free-roam').checked=true;document.getElementById('free-roam').dispatchEvent(new Event('change'));void 0;
    `);
    await new Promise(resolve=>setTimeout(resolve,150));
    await writeFile(path.join(output,'desktop-settings-preview.png'),(await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript("document.getElementById('desktop-play').click()");
    await new Promise(resolve=>setTimeout(resolve,200));
    assert.equal(await win.webContents.executeJavaScript("desktopEnabled&&document.body.classList.contains('compact')"),true);
    await win.webContents.executeJavaScript(`
      globalThis.savedDesktopMode=localStorage.getItem('companion-desktop-mode');
      setPanel(true);
      document.getElementById('desktop-mode').value='showcase';
      document.getElementById('desktop-mode').dispatchEvent(new Event('change'));void 0;
    `);
    assert.equal(await win.webContents.executeJavaScript("document.getElementById('free-roam').disabled"),true);
    await win.webContents.executeJavaScript(`
      document.getElementById('desktop-mode').value='natural';
      document.getElementById('desktop-mode').dispatchEvent(new Event('change'));void 0;
    `);
    assert.equal(await win.webContents.executeJavaScript("document.getElementById('free-roam').disabled"),false);
    await win.webContents.executeJavaScript(`
      document.getElementById('desktop-play').click();
      document.getElementById('free-roam').checked=savedRoamPreference==='on';
      document.getElementById('free-roam').dispatchEvent(new Event('change'));
      if(savedRoamPreference===null)localStorage.removeItem('companion-free-roam');
      document.getElementById('desktop-mode').value=savedDesktopMode==='showcase'?'showcase':'natural';
      document.getElementById('desktop-mode').dispatchEvent(new Event('change'));
      if(savedDesktopMode===null)localStorage.removeItem('companion-desktop-mode');
      setPanel(false);void 0;
    `);
  }
  await checkPointMovement();
  const report = { completed: true, mode:appearanceTest?'appearance-only':'paused-integration', electron: process.versions.electron, sessionId: before.sessionId,
    rendered, compact, layout, panelDesign, portraitMode, bubbleLayout, sizes, voicePlayback, shortcuts: nativeState(), alwaysOnTop: win.isAlwaysOnTop(),
    checks: ['existing session rendered', 'Node isolated', 'drag region CSS', 'topmost', 'shown without focus',
      'click-through changes focusability', 'programmatic window move', 'chat input focus', ...(appearanceTest?[]:['close handler confirms pause']),
      'focus mode default', 'technical details collapsed', 'delivery diagnostics hidden', 'selective voice respects saved opt-in'],
    notTested: ['physical drag', 'physical mouse pass-through to game', 'exclusive fullscreen', ...(chatCalibration ? [] : ['real model chat']),
      ...(voicePlayback ? ['user confirmation of sound and timbre'] : ['Qwen synthesis and audible playback'])] };
  // The actual close handler acknowledges pause before publishing success.
  await win.webContents.executeJavaScript(`document.getElementById(${JSON.stringify(portraitMode.saved==='animated'?'portrait-animated':'portrait-static')}).click();${portraitMode.saved===null?"localStorage.removeItem('companion-portrait-mode');":''}`);
  if (process.env.COMPANION_RESTORE_VOICE === '1') {
    await win.webContents.executeJavaScript("if(document.getElementById('voice').getAttribute('aria-pressed')!=='true')document.getElementById('voice').click()");
  }
  await closeSafely(async () => {
    if(!appearanceTest)assert.equal((await request('/game-companion/state')).scheduler.paused, true);
    await writeFile(path.join(output, 'overlay-smoke.json'), JSON.stringify(report, null, 2));
  });
  console.log(appearanceTest?'Native appearance checks passed; game controls untouched.':'Native overlay smoke passed; existing session paused.');
};
