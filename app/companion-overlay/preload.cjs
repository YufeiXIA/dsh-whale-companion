const { ipcRenderer } = require('electron');

window.addEventListener('DOMContentLoaded', async () => {
  const style = document.createElement('style');
  style.textContent = `#nativebar{display:flex;align-items:center;gap:6px;height:34px;padding:5px 12px 0;flex-shrink:0;-webkit-app-region:drag;user-select:none;font-size:10px}
    #nativebar button{-webkit-app-region:no-drag;font-size:10px;padding:4px 8px;min-height:27px;border-radius:8px;background:transparent;border:0;color:#c1cee5}#nativehint{flex:1;color:#a9bbd7;padding-left:7px}#native-close{width:27px;font-size:19px!important;padding:0!important}#native-close:hover{background:#ffffff18;color:#f0d4c4}`;
  document.head.append(style);
  const bar = document.createElement('div'); bar.id = 'nativebar';
  const hint = document.createElement('span'); hint.id = 'nativehint';
  const toggle = document.createElement('button'); toggle.id = 'native-toggle';
  const close = document.createElement('button'); close.id = 'native-close'; close.textContent = '×';
  close.title = '暂停并关闭'; close.setAttribute('aria-label', '暂停并关闭');
  function render(state) {
    const shortcut = state.platform === 'darwin' ? '⌘⌥⇧Space' : 'Ctrl+Alt+Space';
    toggle.disabled = !state.toggleAvailable;
    toggle.textContent = state.clickThrough ? '点透中' : '启用点透';
    hint.textContent = state.clickThrough ? `${shortcut} 恢复点击` : '⠿ 挪个窝';
    bar.title = state.focusAvailable ? 'Ctrl+Alt+Enter 聚焦聊天；Esc 释放键鼠' : '聊天快捷键被占用，请点击输入框';
    toggle.title = state.toggleAvailable ? `${shortcut} 切换` : '快捷键被占用，已禁用点透以便恢复操作';
  }
  toggle.onclick = async () => render(await ipcRenderer.invoke('companion-window', 'toggle'));
  close.onclick = () => ipcRenderer.invoke('companion-window', 'close');
  bar.append(hint, toggle, close); document.querySelector('.companion-card').prepend(bar);
  const initialNativeState=await ipcRenderer.invoke('companion-window', 'state');
  if(initialNativeState.platform==='darwin'){
    document.getElementById('stroll-label').textContent='沿屏幕底部散步';
    document.getElementById('mac-permissions').hidden=false;
    const status=document.getElementById('mac-permission-status');
    async function permission(action='status'){
      try{
        const result=await ipcRenderer.invoke('companion-window','mac-permissions',action);
        status.textContent=`屏幕录制：${result.screen==='granted'?'已允许':'未允许'} · 窗口停靠：${result.accessibility?'已允许':'未允许'}。聊天无需授权；修改系统权限后可能需要退出再打开。`;
      }catch{status.textContent='权限状态暂时不可用，可以从菜单栏的 macOS 权限入口打开系统设置。';}
    }
    document.getElementById('mac-screen-permission').onclick=()=>void permission('screen');
    document.getElementById('mac-window-permission').onclick=()=>void permission('accessibility');
    document.getElementById('mac-screen-settings').onclick=()=>void permission('screen-settings');
    document.getElementById('mac-window-settings').onclick=()=>void permission('accessibility-settings');
    window.addEventListener('companion-request-vision-permission',()=>void permission('screen'));
    window.addEventListener('focus',()=>void permission());
    void permission();
  }
  window.addEventListener('companion-activity', event => { void ipcRenderer.invoke('companion-window', 'activity', event.detail === true); });
  ipcRenderer.on('companion-activity-invalid',()=>window.dispatchEvent(new CustomEvent('companion-activity-invalid')));
  // The panel announced these before this script attached, so seed them from its saved settings.
  const saved=key=>{try{return JSON.parse(localStorage.getItem(key)??'null');}catch{return null;}};
  void ipcRenderer.invoke('companion-window','quiet-state',{focusUntil:Number(saved('companion-focus-until'))||0,quietUntil:Number(saved('companion-quiet-until'))||0,
    visionPausedUntil:Number(saved('companion-vision-paused-until'))||0});
  window.addEventListener('companion-quiet-state',event=>{
    const [focusUntil,quietUntil,visionPausedUntil]=String(event.detail).split(',').map(Number);
    void ipcRenderer.invoke('companion-window','quiet-state',{focusUntil,quietUntil,visionPausedUntil});
  });
  ipcRenderer.on('companion-vision-capture',()=>window.dispatchEvent(new CustomEvent('companion-vision-capture')));
  for(const name of ['fullscreen','health','edge','peek'])ipcRenderer.on('companion-'+name,(_event,value)=>window.dispatchEvent(new CustomEvent('companion-'+name,{detail:value})));
  ipcRenderer.on('companion-perched',(_event,placement)=>window.dispatchEvent(new CustomEvent('companion-perched',{detail:placement})));
  ipcRenderer.on('companion-perch-message',(_event,text)=>window.dispatchEvent(new CustomEvent('companion-perch-message',{detail:text})));
  ipcRenderer.on('companion-dock-locked',()=>window.dispatchEvent(new CustomEvent('companion-dock-locked')));
  const desktopPrefs=detail=>{const [stroll,fullscreenHide,sleeping]=String(detail).split(',');return {stroll:stroll==='1',fullscreenHide:fullscreenHide!=='0',sleeping:sleeping==='1'};};
  void ipcRenderer.invoke('companion-window','desktop-prefs',desktopPrefs((saved('companion-stroll')===true?'1':'0')+','+(saved('companion-fullscreen-hide')===false?'0':'1')+','+(saved('companion-sleep')===true?'1':'0')));
  window.addEventListener('companion-desktop-prefs',event=>void ipcRenderer.invoke('companion-window','desktop-prefs',desktopPrefs(event.detail)));
  ipcRenderer.on('companion-tray',(_event,command)=>window.dispatchEvent(new CustomEvent('companion-tray',{detail:command})));
  render(initialNativeState);
  const exitGame=document.getElementById('exit-whale-game'),autoExit=document.getElementById('auto-exit-game'),gameStatus=document.getElementById('game-status');
  function renderGame(state){
    if(state.busy)window.dispatchEvent(new CustomEvent('companion-game-exiting'));
    exitGame.disabled=state.busy||!state.known||!state.whaleRunning;
    gameStatus.textContent=state.message;
  }
  autoExit.checked=localStorage.getItem('companion-auto-exit-game')!=='off';
  autoExit.onchange=()=>{
    localStorage.setItem('companion-auto-exit-game',autoExit.checked?'on':'off');
    void ipcRenderer.invoke('companion-window','game-auto-exit',autoExit.checked);
  };
  exitGame.onclick=async()=>{
    exitGame.disabled=true;
    renderGame(await ipcRenderer.invoke('companion-window','game-exit'));
  };
  ipcRenderer.on('companion-game-state',(_event,state)=>renderGame(state));
  renderGame(await ipcRenderer.invoke('companion-window','game-auto-exit',autoExit.checked));
  ipcRenderer.on('companion-window-state', (_event, state) => { render(state);inside=undefined; });
  const body=document.body,pet=document.getElementById('pet-hit');
  const pickPoint=()=>window.dispatchEvent(new CustomEvent('companion-pick-point'));
  const moveButton=document.createElement('button');moveButton.id='pick-point';moveButton.textContent='跑到指定位置';
  moveButton.title='选择桌面目的地；Esc 取消';moveButton.onclick=pickPoint;
  document.getElementById('free-roam').parentElement.insertAdjacentElement('afterend',moveButton);
  const perchButton=document.createElement('button');perchButton.id='perch-window';perchButton.textContent='爬到窗口上';
  perchButton.title='停靠当前窗口并跟随它移动；关闭或最小化时落下来';perchButton.onclick=()=>void ipcRenderer.invoke('companion-window','perch');
  moveButton.insertAdjacentElement('afterend',perchButton);
  pet.title='单击身体互动 · 鲸鱼按钮打开面板 · 拖动挪窝 · 右键选择目的地';
  pet.addEventListener('contextmenu',event=>{event.preventDefault();pickPoint();});
  window.addEventListener('companion-pick-ready',async()=>{
    try{if(!await ipcRenderer.invoke('companion-window','point-pick'))window.dispatchEvent(new CustomEvent('companion-point-selection-cancel'));}
    catch{window.dispatchEvent(new CustomEvent('companion-point-error'));}
  });
  ipcRenderer.on('companion-point-run',()=>window.dispatchEvent(new CustomEvent('companion-point-run')));
  ipcRenderer.on('companion-point-stop',()=>window.dispatchEvent(new CustomEvent('companion-point-stop')));
  for(const name of ['roam-blocked','fling','settle'])ipcRenderer.on('companion-'+name,()=>window.dispatchEvent(new CustomEvent('companion-'+name)));
  ipcRenderer.on('companion-bounce',()=>document.getElementById('pet').animate([{scale:'1.08 .92'},{scale:'1 1'}],{duration:220}));
  window.addEventListener('companion-turn',()=>void ipcRenderer.invoke('companion-window','turn'));
  window.addEventListener('companion-motion-stop',()=>void ipcRenderer.invoke('companion-window','motion-stop'));
  window.addEventListener('companion-motion-state',event=>void ipcRenderer.invoke('companion-window','motion-state',event.detail===true));
  let pointFrame;
  window.addEventListener('companion-point-motion',event=>{
    cancelAnimationFrame(pointFrame);
    if(event.detail!=='start'){void ipcRenderer.invoke('companion-window','point-end',event.detail);return;}
    const video=document.getElementById('pet');
    const step=()=>{
      if(Number.isFinite(video.duration)&&video.duration>4&&!video.paused){
        const progress=Math.max(0,Math.min(1,(video.currentTime-2)/(video.duration-4)));
        void ipcRenderer.invoke('companion-window','point-step',progress);
        if(progress===1){window.dispatchEvent(new CustomEvent('companion-point-arrived'));return;}
      }
      pointFrame=requestAnimationFrame(step);
    };
    pointFrame=requestAnimationFrame(step);
  });
  let composeExtra=0;
  window.addEventListener('companion-composer-resize',event=>{composeExtra=Number(event.detail);syncLayout();});
  function syncLayout(){
    inside=undefined;
    void ipcRenderer.invoke('companion-window','layout',!body.classList.contains('compact'),Number(document.getElementById('pet-size').value)/100,composeExtra);
    window.dispatchEvent(new CustomEvent('companion-panel',{detail:!body.classList.contains('compact')}));
  }
  new MutationObserver(syncLayout).observe(body,{attributes:true,attributeFilter:['class']});
  let dragging=false,moved=false,startX=0,startY=0,inside;
  document.getElementById('pet-size').addEventListener('input',syncLayout);
  syncLayout();
  let roamFrame;
  window.addEventListener('companion-roam',event=>{
    cancelAnimationFrame(roamFrame);
    void ipcRenderer.invoke('companion-window','roam',event.detail);
    if(!event.detail)return;
    const video=document.getElementById('pet');
    const step=()=>{
      if(Number.isFinite(video.duration)&&video.duration>4&&!video.paused){
        const progress=Math.max(0,Math.min(1,(video.currentTime-2)/(video.duration-4)));
        void ipcRenderer.invoke('companion-window','roam-step',progress);
      }
      roamFrame=requestAnimationFrame(step);
    };
    roamFrame=requestAnimationFrame(step);
  });
  ipcRenderer.on('companion-facing',(_event,direction)=>window.dispatchEvent(new CustomEvent('companion-facing',{detail:direction})));
  const desktopStart=()=>window.dispatchEvent(new CustomEvent('companion-desktop-start'));
  ipcRenderer.on('companion-desktop-start',desktopStart);
  if(initialNativeState.desktopLaunch)desktopStart();
  pet.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    dragging=true;moved=false;startX=event.screenX;startY=event.screenY;
    void ipcRenderer.invoke('companion-window','drag-prepare');
    pet.setPointerCapture(event.pointerId);
  });
  pet.addEventListener('pointermove',event=>{
    if(!dragging)return;
    if(!moved&&Math.abs(event.screenX-startX)+Math.abs(event.screenY-startY)>5){
      moved=true;window.dispatchEvent(new CustomEvent('companion-drag',{detail:true}));
      void ipcRenderer.invoke('companion-window','drag-start');
    }
    if(moved)void ipcRenderer.invoke('companion-window','drag-move');
  });
  const endDrag=()=>{dragging=false;inside=undefined;if(moved)window.dispatchEvent(new CustomEvent('companion-drag',{detail:false}));void ipcRenderer.invoke('companion-window','drag-end',moved&&!matchMedia('(prefers-reduced-motion: reduce)').matches);};
  pet.addEventListener('pointerup',endDrag);pet.addEventListener('pointercancel',endDrag);
  pet.addEventListener('click',event=>{if(moved){event.stopImmediatePropagation();event.preventDefault();}},true);
  const quickForm=document.getElementById('quick-chat'),quickInput=document.getElementById('quick-message');
  const focusQuick=()=>void ipcRenderer.invoke('companion-window','quick-focus').then(()=>quickInput.focus());
  window.addEventListener('companion-focus-quick',focusQuick);
  ipcRenderer.on('companion-focus-quick',()=>{window.dispatchEvent(new CustomEvent('companion-open-quick'));focusQuick();});
  quickInput.addEventListener('pointerdown',event=>{
    if(document.activeElement!==quickInput){event.preventDefault();focusQuick();}
  });
  window.addEventListener('companion-quick-closed',()=>{inside=undefined;void ipcRenderer.invoke('companion-window','quick-release');});
  document.addEventListener('mousemove',event=>{
    const compact=body.classList.contains('compact'),r=pet.getBoundingClientRect();
    const near=compact&&event.clientX>=r.left-24&&event.clientX<=r.right+24&&event.clientY>=r.top-24&&event.clientY<=r.bottom+24;
    const quick=compact&&quickForm.contains(event.target);
    const hit=dragging||(!compact?Boolean(event.target.closest('.companion-card,#nativebar')):near||quick);
    if(hit!==inside){inside=hit;void ipcRenderer.invoke('companion-window',compact?'quick-hover':'hover',hit);
      window.dispatchEvent(new CustomEvent('companion-pet-near',{detail:near||quick}));}
    if(hit&&body.classList.contains('compact'))void ipcRenderer.invoke('companion-window','look');
  });
  ipcRenderer.on('companion-focus-chat', () => {
    if(body.hasAttribute('data-edge')){window.dispatchEvent(new CustomEvent('companion-open-quick'));focusQuick();return;}
    body.classList.remove('compact');document.getElementById('chat')?.focus();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.isComposing) {
      if(body.classList.contains('compact')&&body.classList.contains('quick-chat-open')){
        event.preventDefault();quickInput.blur();window.dispatchEvent(new CustomEvent('companion-pet-near',{detail:false}));
        void ipcRenderer.invoke('companion-window','quick-release');return;
      }
      const characterSheet=document.getElementById('character-sheet');
      if(characterSheet.open){event.preventDefault();characterSheet.close();return;}
      event.preventDefault(); void ipcRenderer.invoke('companion-window', 'release');
    }
  });
});
