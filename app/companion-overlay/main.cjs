const { app, BrowserWindow, desktopCapturer, dialog, globalShortcut, ipcMain, Menu, nativeImage, powerMonitor, screen, shell, systemPreferences, Tray } = require('electron');
const { readFile, mkdir, rm } = require('node:fs/promises');
const path = require('node:path');
const { planRoam, planPoint, roamPosition, compactFooter } = require('./roaming.cjs');
const {releaseVelocity,stepInertia}=require('./inertia.cjs');
const { createPointPicker } = require('./point-picker.cjs');
const { createGameLifecycle } = require('./game-lifecycle.cjs');
const { createActivitySensor } = require('./activity.cjs');
const { createWindowTracker } = require('./window-tracker.cjs');
const { createScreenCapture } = require('./screen-capture.cjs');
const { activityCommand } = require('./native-platform.cjs');
const { windowRect, createDesktopPermissions } = require('./macos-desktop.cjs');
const { edgeSnap } = require('./edge-snap.cjs');
const { floorY, quickChatY, strollRoute, perchRoute, perchFailure, perchKeepsVisible, stepFall, createHealthClock } = require('./desktop-life.cjs');
const execFile=require('node:util').promisify(require('node:child_process').execFile);

const root = path.resolve(__dirname, '../..');
const lite = global.whaleLite ?? null;
const output = lite?.output ?? path.join(root, 'outputs/companion-runtime');
const data = lite?.data ?? path.join(root, 'app/companion-test/overlay-data');
// Machine-specific paths live in companion.config.json at the project root (see companion.config.example.json).
const config = lite ? {} : (() => { try { return JSON.parse(require('node:fs').readFileSync(path.join(root, 'companion.config.json'), 'utf8')); } catch { return {}; } })();
const hostPort = String(config.port || 19388);
// Same folder as the plugin's dataDir; the plugin writes a fresh session token there on every start.
const companionData = config.dataDir || path.join(config.dshHome || process.env.DSH_HOME || path.join(require('node:os').homedir(), '.dsh'), 'game-companion');
app.setPath('userData', data);
app.setPath('sessionData', data);
app.commandLine.appendSwitch('disk-cache-dir', path.join(data, 'cache'));
const appearanceTest = process.argv.includes('--appearance-test');
const animationCheck = process.argv.includes('--animation-check');
const conversationCheck = process.argv.includes('--conversation-check');
const emotionCheck = process.argv.includes('--emotion-check');
const ambientCheck = process.argv.includes('--ambient-check');
const touchCheck = process.argv.includes('--touch-check');
const naturalCheck = process.argv.includes('--natural-check');
const interactionCheck = process.argv.includes('--interaction-check');
const composerCheck = process.argv.includes('--composer-check');
const pointCheck = process.argv.includes('--point-check');
const edgeCheck = process.argv.includes('--edge-check');
const perchCheck = process.argv.includes('--perch-check');
const motionCheck = process.argv.includes('--motion-check');
const streamVoiceCheck = process.argv.includes('--stream-voice-check');
const sleepCheck = process.argv.includes('--sleep-check');
const releaseCheck = process.argv.includes('--release-check');
const smoke = releaseCheck || process.argv.includes('--smoke-test') || appearanceTest || animationCheck || conversationCheck || emotionCheck || ambientCheck || touchCheck || naturalCheck || interactionCheck || composerCheck || pointCheck || edgeCheck || perchCheck || motionCheck || streamVoiceCheck || sleepCheck;
let win, base, cookie, closing = false, allowClose = false, clickThrough = false, pointerIgnored=false;
let startupFailed = false;
let toggleAvailable = false, focusAvailable = false, quickWasClickThrough = null;
let dragStart, dragOrigin=null, quickLift=null;
let panelOpen=false, roamRoute=null, layoutKey='';
let pointRoute=null,pointPicker,pointSelecting=false,petScale=1;
let facing=-1,hoverFacing=null,inertiaTimer=null,dragSamples=[],motionGeneration=0;
let gameLifecycle, gameTimer, activitySensor, screenCapture, activityHeartbeat = 0;
let edge=null,edgeX=null,tucked=false,slideTimer=null,slideTarget=null,desktopMotionAllowed=true,tray,quietState={focusUntil:0,quietUntil:0,visionPausedUntil:0};
// The sampler runs for the desktop behaviours; only ambient chat forwards its coarse app label to the service.
let lastSampleWindow=null,ambientWanted=false,forwarded=false,lastForwardAt=0,perch=null,perchPending=null,windowTracker,perchRequest=0;
let hiddenForFullscreen=false,fullscreenOverride=null,desktopPrefs={stroll:false,fullscreenHide:true},sessionBlocked=false;
const health=createHealthClock();
const desktopPermissions=createDesktopPermissions({systemPreferences,desktopCapturer,openExternal:url=>shell.openExternal(url),isSessionActive:()=>!sessionBlocked});
async function inspectActivity(primary=false) {
  const command=activityCommand(root,{once:true,primary,excludeProcessId:process.pid});
  const {stdout}=await execFile(command.file,command.args,{windowsHide:true,timeout:5000});
  return JSON.parse(stdout.replace(/^\uFEFF/,''));
}
async function gameProcess(action,onlyIfHumanAbsent=false) {
  const powershell=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
  const args=['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'tools/companion-game-process.ps1'),'-Action',action];
  if(onlyIfHumanAbsent)args.push('-OnlyIfHumanAbsent');
  const {stdout}=await execFile(powershell,args,{windowsHide:true,timeout:20000});
  return JSON.parse(stdout.replace(/^\uFEFF/,''));
}
function setFacing(direction){facing=edge?-edge.side:direction;win.webContents.send('companion-facing',-facing);}
function stopRoam(){roamRoute=null;}
function stopInertia(){
  motionGeneration++;
  if(inertiaTimer){clearInterval(inertiaTimer);inertiaTimer=null;win.webContents.send('companion-settle');}
}
function startInertia(velocity){
  const size=win.getBounds(),area=screen.getDisplayMatching(size).workArea;
  let motion={x:size.x,y:size.y,...velocity},last=performance.now();
  win.webContents.send('companion-fling');
  inertiaTimer=setInterval(()=>{
    const now=performance.now(),dt=Math.min(40,now-last);last=now;
    motion=stepInertia(motion,area,size,dt);
    win.setPosition(Math.round(motion.x),Math.round(motion.y));
    if(motion.bounced)win.webContents.send('companion-bounce');
    if(motion.done){stopInertia();snapToEdge();}
  },16);
}
// Falling shares the inertia timer, so drags and other motions cancel it the same way.
function fall(){
  if(edge)return;
  stopRoam();stopPoint();stopInertia();clearEdge();clearPerch();
  const size=win.getBounds(),area=screen.getDisplayMatching(size).workArea,floor=floorY(area,size.height,petScale);
  if(size.y>=floor-2)return;
  let motion={y:size.y,vy:0,bounced:false},last=performance.now();
  win.webContents.send('companion-fling');
  inertiaTimer=setInterval(()=>{
    const now=performance.now(),before=motion.bounced;motion=stepFall(motion,floor,Math.min(40,now-last));last=now;
    win.setPosition(size.x,Math.round(motion.y));
    if(motion.bounced!==before)win.webContents.send('companion-bounce');
    if(motion.done)stopInertia();
  },16);
}
function perchNotice(text){if(win&&!win.isDestroyed())win.webContents.send('companion-perch-message',text);}
function clearPerch(){perch=null;perchPending=null;windowTracker?.clear();}
function perchBlocked(){
  if(edge)return '我还缩在屏幕边呢。先把我拖出来，再叫我爬上去吧。';
  if(panelOpen)return '先收起聊天面板，我才能挪到窗口上哦。';
  if(dragStart)return '你还拎着我呢，先松手再叫我爬吧。';
  if(pointSelecting)return '还在选要跑去的位置，先完成或取消这次选点吧。';
  if(!desktopMotionAllowed)return '这会儿还不能移动，等当前交互结束再试一下吧。';
  return null;
}
function perchGeometry(sample,anchor=null){
  const rect=windowRect(sample,screen);
  const display=rect&&screen.getDisplayMatching(rect).bounds;
  const reason=perchFailure(rect,display,petScale);
  return {reason,route:reason?null:perchRoute(win.getBounds(),rect,display,petScale,anchor)};
}
const perchReasons={missing:'还没找到可以停靠的窗口。先点一下目标窗口，再叫我爬上去吧。',
  offscreen:'这个窗口已经完全在屏幕外了，把它移回来再叫我吧。'};
async function perchOnWindow(){
  if(!win.isVisible()){
    if(hiddenForFullscreen){hiddenForFullscreen=false;fullscreenOverride=lastSampleWindow;win.webContents.send('companion-fullscreen',false);}
    showWithoutFocus();
  }
  const blocked=perchBlocked();if(blocked){perchNotice(blocked);return false;}
  if(process.platform==='darwin'&&!desktopPermissions.status().accessibility){
    const permission=await desktopPermissions.perform('accessibility');
    if(!permission.accessibility){perchNotice('请在系统设置的「隐私与安全性 → 辅助功能」里允许大肥鱼，再叫我爬上去吧。');return false;}
  }
  const attempt=++perchRequest,generation=motionGeneration;
  try{
    const [state,target]=await Promise.all([request('/game-companion/state'),windowTracker.select()]);
    if(attempt!==perchRequest)return false;
    const changed=perchBlocked();
    if(changed||generation!==motionGeneration){perchNotice(changed||'位置刚刚变了，这次先停下，再叫我一次吧。');return false;}
    if(!state.scheduler.paused||state.scheduler.active){perchNotice('我正在回复或处理游戏操作，等这一下忙完再叫我爬吧。');return false;}
    const {reason,route}=perchGeometry(target.status==='visible'?target:null);
    if(reason){perchNotice(perchReasons[reason]);return false;}
    stopInertia();stopPoint();stopRoam();clearEdge();clearPerch();
    pointRoute=route;perchPending={windowId:target.windowId,processId:target.processId,anchor:route.anchor,placement:route.placement,sample:target};
    hiddenForFullscreen=false;fullscreenOverride=target.windowId;showWithoutFocus();win.webContents.send('companion-fullscreen',false);
    windowTracker.track(target);
    setFacing(route.direction);win.webContents.send('companion-point-run');return true;
  }catch{perchNotice('这次没能确认窗口状态，暂时爬不上去。请稍后再试一下。');return false;}
}
function followPerch(sample){
  const target=perchPending||perch;
  if(!target||!win||win.isDestroyed()||(sample.windowId&&sample.windowId!==target.windowId))return;
  if(sample.status!=='visible'){
    const text=sample.status==='minimized'?'窗口收起来啦，我先落回下面。':sample.status==='closed'?'窗口关掉啦，我先下来。':'这会儿跟不上这个窗口了，我先安全落下来。';
    clearPerch();fall();perchNotice(text);return;
  }
  const {route,reason}=perchGeometry(sample,target.anchor);
  if(reason){clearPerch();fall();perchNotice('这里放不下我啦，我先落回下面。');return;}
  target.sample=sample;target.placement=route.placement;
  if(perchPending&&pointRoute){pointRoute.target=route.target;pointRoute.targetY=route.targetY;}
  else if(perch&&!dragStart&&!panelOpen){win.setPosition(route.target,route.targetY);}
}
function desktopSense(sample){
  if(!win||win.isDestroyed())return;
  const fullscreen=desktopPrefs.fullscreenHide&&sample.available&&sample.fullscreen&&!sample.captureOverlay&&sample.app!=='companion'&&!perchKeepsVisible(sample,perchPending||perch);
  if(!fullscreen)fullscreenOverride=null;
  if(fullscreen&&!hiddenForFullscreen&&win.isVisible()&&sample.windowId!==fullscreenOverride){
    hiddenForFullscreen=true;win.hide();win.webContents.send('companion-fullscreen',true);buildTray();
  } else if(!fullscreen&&hiddenForFullscreen){
    hiddenForFullscreen=false;showWithoutFocus();win.webContents.send('companion-fullscreen',false);buildTray();
  }
  const reminder=health.sample(sample);
  if(reminder)win.webContents.send('companion-health',reminder);
}
// Docked characters stay half hidden until a real drag releases them.
function clearEdge(){
  stopEdgeMotion();
  if(edge&&!win.isDestroyed()){
    const bounds=win.getBounds();
    setWindowBounds({...bounds,x:Math.round(edgeX),width:edge.baseWidth});
    win.webContents.send('companion-edge','');win.webContents.send('companion-peek','0');
  }
  edge=null;edgeX=null;tucked=false;
}
function setPointerPassthrough(value){
  if(pointerIgnored===value)return;
  win.setIgnoreMouseEvents(value,{forward:true});pointerIgnored=value;
}
function setWindowBounds(bounds){
  const restore=pointerIgnored;setPointerPassthrough(false);
  try{win.setBounds(bounds);}finally{setPointerPassthrough(restore);}
}
function stopEdgeMotion(){
  clearInterval(slideTimer);slideTimer=null;slideTarget=null;
}
// The carrier stays inside the work area. Only the character anchor crosses its edge.
function sendEdge(){
  if(!edge)return;
  const bounds=win.getBounds(),area=screen.getDisplayMatching(bounds).workArea;
  const anchor=edgeX+edge.baseWidth/2-bounds.x;
  const bottom=Math.max(7,bounds.y+bounds.height-area.y-area.height+7);
  win.webContents.send('companion-edge',`${edge.side},${anchor},${bottom}`);
}
function slideTo(x){
  if(slideTimer!==null&&slideTarget===x)return;
  clearInterval(slideTimer);slideTimer=null;slideTarget=null;
  const from=edgeX,start=performance.now(),current=edge;
  if(from===x){sendEdge();return;}
  const duration=Math.min(240,Math.max(120,Math.abs(x-from)*.7));
  slideTarget=x;
  slideTimer=setInterval(()=>{
    if(edge!==current||win.isDestroyed()){stopEdgeMotion();return;}
    const t=Math.min(1,(performance.now()-start)/duration),eased=1-(1-t)**3;
    edgeX=t===1?x:from+(x-from)*eased;
    sendEdge();
    if(t===1){clearInterval(slideTimer);slideTimer=null;slideTarget=null;}
  },16);
}
function placeEdge(){
  if(!edge||dragStart||panelOpen||!desktopMotionAllowed)return;
  if(!tucked){tucked=true;win.webContents.send('companion-peek','1');}
  slideTo(edge.peekX);
}
function allowDesktopMotion(value){
  const changed=desktopMotionAllowed!==value;
  desktopMotionAllowed=value;
  if(!value)stopEdgeMotion();
  else if(changed)placeEdge();
}
// Tray shortcut: slip to the nearer side of this screen and peek in right away.
function hideAtEdge(){
  if(edge)return;
  if(panelOpen||dragStart||pointSelecting||!desktopMotionAllowed)return;
  stopInertia();stopPoint();stopRoam();clearEdge();clearPerch();
  const bounds=win.getBounds();
  attachEdge(bounds,Infinity);
}
function attachEdge(bounds,reach=48){
  const area=screen.getDisplayMatching(bounds).workArea;
  const next=edgeSnap(bounds,area,petScale,reach);
  if(!next)return;
  edge={...next,baseWidth:bounds.width};edgeX=bounds.x;
  setWindowBounds({...bounds,x:area.x,width:area.width});
  sendEdge();setFacing(-edge.side);placeEdge();
}
function snapToEdge(){
  if(edge)return;
  if((smoke&&!edgeCheck)||panelOpen||dragStart||!desktopMotionAllowed)return;
  const bounds=win.getBounds();
  attachEdge(bounds);
}
function refreshDock(){
  if(!edge||win.isDestroyed())return;
  const bounds=win.getBounds(),area=screen.getDisplayMatching(bounds).workArea,baseWidth=edge.baseWidth,side=edge.side;
  stopEdgeMotion();edgeX=(side<0?area.x:area.x+area.width)-baseWidth/2;
  edge={...edgeSnap({...bounds,x:edgeX,width:baseWidth},area,petScale,Infinity),baseWidth};
  setWindowBounds({...bounds,x:area.x,width:area.width,y:Math.max(area.y,Math.min(bounds.y,area.y+area.height-bounds.height))});
  sendEdge();
}
function stopPoint(){
  pointPicker?.cancel();if(perchPending){perchPending=null;windowTracker?.clear();}
  if(pointRoute){pointRoute=null;win.webContents.send('companion-point-stop');}
}
async function pickPoint(){
  if(edge){win.webContents.send('companion-dock-locked');return;}
  if(pointSelecting)return;
  pointSelecting=true;
  try{
    const state=await request('/game-companion/state');
    if(!state.scheduler.paused||state.scheduler.active)return;
    stopInertia();stopPoint();stopRoam();clearEdge();clearPerch();
    const point=await pointPicker.pick();
    if(!point||panelOpen||dragStart)return;
    const current=await request('/game-companion/state');
    if(!current.scheduler.paused||current.scheduler.active)return;
    pointRoute=planPoint(win.getBounds(),screen.getDisplayNearestPoint(point).workArea,point,petScale);
    setFacing(pointRoute.direction);
    win.webContents.send('companion-point-run');
    return true;
  }finally{pointSelecting=false;}
}

function setLayout(expanded,scale=1,composeExtra=0) {
  if(edge&&expanded)return;
  // Quick chat toggles body classes too; that must not pull her off the edge.
  // Class changes that leave the layout as it was (quick chat, peeking) must not cancel a run or a walk.
  const key=expanded+','+scale+','+composeExtra;if(key===layoutKey)return;layoutKey=key;
  const keepEdge=edge&&!expanded&&!panelOpen;
  const centre=keepEdge?edgeX+edge.baseWidth/2:null;
  quickLift=null;
  const attached=perch;
  panelOpen=expanded;petScale=scale;stopInertia();stopPoint();stopRoam();
  if(keepEdge)stopEdgeMotion();else clearEdge();
  clearPerch();
  const area=screen.getDisplayMatching(win.getBounds()).workArea;
  const old=win.getBounds(),compactWidth=Math.max(300,Math.round(300*scale)),compactHeight=Math.round(202*scale+250+compactFooter(scale)+composeExtra);
  const width=keepEdge?area.width:expanded?410:compactWidth,height=expanded?Math.min(720,area.height-40):compactHeight;
  win.setMinimumSize(expanded?350:compactWidth,expanded?520:compactHeight);
  setWindowBounds({x:keepEdge?area.x:Math.max(area.x,Math.min(old.x+old.width-width,area.x+area.width-width)),
    y:Math.max(area.y,Math.min(old.y,area.y+area.height-height)),width,height});
  if(keepEdge){
    edgeX=centre-compactWidth/2;
    edge={...edgeSnap({...win.getBounds(),x:edgeX,width:compactWidth},area,scale,Infinity),baseWidth:compactWidth};
    sendEdge();placeEdge();
  }
  if(attached&&!expanded){perch=attached;windowTracker.track(attached);followPerch(attached.sample);}
}

function placeQuickChat(open){
  if(edge){sendEdge();return;}
  const bounds=win.getBounds();
  if(open){
    const y=quickChatY(bounds,screen.getDisplayMatching(bounds).workArea);
    if(y!==bounds.y){quickLift={y:bounds.y,lifted:y};win.setPosition(bounds.x,y);}
  }else if(quickLift){
    if(bounds.y===quickLift.lifted)win.setPosition(bounds.x,quickLift.y);
    quickLift=null;
  }
}
function hoverQuickChat(value){
  setPointerPassthrough(!value);
  placeQuickChat(value||quickWasClickThrough!==null);
}

async function request(route, body, timeoutMs=8000) {
  const url = new URL(route, base);
  const headers = { cookie, 'content-type': 'application/json' };
  if (body) headers['x-companion-control'] = '1';
  const response = await fetch(url, { method: body ? 'POST' : 'GET', headers,
    ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`搭子服务返回 HTTP ${response.status}`);
  return response.json();
}

function nativeState() { return { clickThrough, toggleAvailable, focusAvailable, platform:process.platform, desktopLaunch:process.argv.includes('--desktop-companion') }; }
function showWithoutFocus() {
  win.showInactive();
  win.setAlwaysOnTop(true, 'screen-saver');
}
async function checkDesktopLaunch() {
  let result;
  for(let attempt=0;attempt<50;attempt++){
    result=await win.webContents.executeJavaScript(`({enabled:desktopEnabled,compact:document.body.classList.contains('compact'),
      paused:state?.scheduler?.paused,playing:document.getElementById('pet').currentTime>0.2&&!document.getElementById('pet').paused,
      clip:document.getElementById('pet').getAttribute('src'),mode:document.getElementById('desktop-mode').value,
      freeRoam:document.getElementById('free-roam').checked,randomRoam:document.getElementById('random-roam').checked,
      stroll:document.getElementById('stroll').checked,sleeping,layers:document.querySelectorAll('video.pet-layer').length})`);
    if(result.enabled&&result.compact&&result.paused&&result.playing)break;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  await require('node:fs/promises').writeFile(path.join(output,'desktop-launch-check.json'),JSON.stringify({...result,checkedAt:new Date().toISOString()},null,2));
}
function setClickThrough(value) {
  if (value && !toggleAvailable) return nativeState();
  clickThrough = value;
  stopInertia();stopPoint();
  setPointerPassthrough(value);
  win.setFocusable(!value);
  if (value) win.blur();
  win.webContents.send('companion-window-state', nativeState());
  return nativeState();
}

async function closeSafely(onPaused) {
  if (closing) return;
  closing = true;
  stopPoint();
  try {
    const state = await request('/game-companion/control', { action: 'pause' });
    if (!state.scheduler?.paused) throw new Error('搭子服务没有确认暂停');
  } catch {
    if (smoke) { closing = false; throw new Error('Close did not confirm the companion was paused'); }
    const { response } = await dialog.showMessageBox(win, { type: 'warning',
      message: '尚未确认游戏控制已暂停', detail: '无法连接搭子服务。保留浮窗后可重试，或去 DSH 手动暂停。仅关闭窗口不会停止后台搭子。',
      buttons: ['保留浮窗', '仅关闭窗口'], defaultId: 0, cancelId: 0 });
    if (response === 0) { closing = false; return; }
  }
  if (onPaused) await onPaused();
  await activitySensor?.close();
  screenCapture?.close();
  allowClose = true;
  win.close();
}

function loginItem(){
  if(process.platform==='darwin')return {};
  if(lite)return {path:process.execPath,args:app.isPackaged?[]:[app.getAppPath()]};
  // The launcher needs PowerShell 7; Windows PowerShell 5.1 misreads the UTF-8 script.
  const pwsh=config.pwshExe||path.join(process.env.ProgramFiles??'C:\\Program Files','PowerShell/7/pwsh.exe');
  return {path:pwsh,args:['-NoProfile','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',path.join(root,'tools/start-whale-companion.ps1'),'-DesktopOnly']};
}
function focusChat(){setClickThrough(false);win.show();win.setAlwaysOnTop(true,'screen-saver');win.focus();win.webContents.send(edge?'companion-focus-quick':'companion-focus-chat');}
function buildTray(){
  if(smoke||win.isDestroyed())return;
  if(!tray){
    const icon=process.platform==='darwin'?nativeImage.createFromPath(path.join(__dirname,'assets/whale-gaming-icon-v3.png')).resize({width:18,height:18}):path.join(__dirname,'assets/whale-gaming-v3.ico');
    tray=new Tray(icon);tray.setToolTip('大肥鱼');
    tray.on('click',()=>{showWithoutFocus();buildTray();});
  }
  const time=Date.now(),send=command=>()=>{if(!win.isDestroyed())win.webContents.send('companion-tray',command);};
  const login=process.platform==='darwin'||require('node:fs').existsSync(loginItem().path)?app.getLoginItemSettings(loginItem()):null;
  tray.setContextMenu(Menu.buildFromTemplate([
    {label:'打开聊天',click:focusChat},
    ...(lite?[{label:'模型与语音设置',click:()=>{focusChat();send('settings')();}}]:[]),

    {label:win.isVisible()?'先藏起来':'叫她出来',click:()=>{
      if(win.isVisible())win.hide();
      else{if(hiddenForFullscreen){hiddenForFullscreen=false;fullscreenOverride=lastSampleWindow;win.webContents.send('companion-fullscreen',false);}showWithoutFocus();}
      buildTray();}},
    {label:'爬到当前窗口上',click:()=>void perchOnWindow()},
    {label:'躲到屏幕边偷看',click:hideAtEdge},
    {label:desktopPrefs.sleeping?'叫醒小鲸':'睡眠模式',type:'checkbox',checked:Boolean(desktopPrefs.sleeping),click:send('sleep')},
    {label:'沿着任务栏散步',type:'checkbox',checked:desktopPrefs.stroll,enabled:!desktopPrefs.sleeping,click:send('stroll')},
    ...(process.platform==='darwin'?[{label:'macOS 权限',submenu:[
      {label:'允许看屏幕',click:()=>void desktopPermissions.perform('screen')},
      {label:'允许窗口停靠',click:()=>void desktopPermissions.perform('accessibility')},
      {label:'屏幕录制设置',click:()=>void desktopPermissions.perform('screen-settings')},
      {label:'辅助功能设置',click:()=>void desktopPermissions.perform('accessibility-settings')}
    ]}]:[]),
    {type:'separator'},
    {label:quietState.focusUntil>time?'结束专注':'专注 25 分钟',click:send('focus')},
    {label:quietState.quietUntil>time?'取消免打扰':'免打扰 1 小时',click:send('quiet')},
    {label:quietState.visionPausedUntil>time?'现在可以看屏幕了':'一小时内别看屏幕',click:send('vision-pause')},
    {type:'separator'},
    {label:'开机时叫醒她',type:'checkbox',checked:Boolean(login?.openAtLogin),enabled:Boolean(login),
      click:item=>{app.setLoginItemSettings({...loginItem(),openAtLogin:item.checked});buildTray();}},
    {label:'退出',click:()=>void closeSafely()}
  ]));
}

async function start() {
  await mkdir(data, { recursive: true });
  await mkdir(output, { recursive: true });
  let cookies;
  if (lite) {
    const host = await lite.ready;
    base = new URL(host.base);
    cookies = [`whale_companion=${host.token}`];
  } else {
    const log = await readFile(path.join(output, 'host.stdout.log'), 'utf8');
    const address = log.match(/dsh web: (http:\/\/[^\s]+)/)?.[1];
    if (!address) throw new Error('请先启动 companion-test DSH 宿主');
    base = new URL(address);
    if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(base.hostname) || base.port !== hostPort) {
      throw new Error(`搭子宿主必须位于本机 ${hostPort} 端口`);
    }
    const landing = await fetch(base, { redirect: 'manual', signal: AbortSignal.timeout(8000) });
    const session = (await readFile(path.join(companionData, 'overlay-session.txt'), 'utf8')).trim();
    if (!/^[\w-]{43}$/.test(session)) throw new Error('搭子插件还没写出会话令牌，请先在 DSH 里启用它');
    cookies = [...landing.headers.getSetCookie().map(value => value.split(';')[0]), `whale_companion=${session}`];
  }
  cookie = cookies.join('; ');
  base.search = ''; base.hash = '';
  await request('/game-companion/state');
  // Older builds kept frames on disk; frames now live only in memory.
  await rm(path.join(output,'screen-cache'),{recursive:true,force:true});
  screenCapture = createScreenCapture({onCapture:()=>{if(win&&!win.isDestroyed())win.webContents.send('companion-vision-capture');},
    isAllowed:()=>ambientWanted&&Date.now()-activityHeartbeat<=20000&&Date.now()>=quietState.visionPausedUntil&&desktopPermissions.screenAllowed(),
    getSources:options=>desktopCapturer.getSources(options),inspect:()=>inspectActivity(true),getPrimaryDisplay:()=>screen.getPrimaryDisplay(),
    upload:body=>request('/game-companion/vision',body,18000)});
  let lastActivityApp,lastActivityWindow,activityContext=0;
  activitySensor = createActivitySensor({ root, publish: async sample => {
    if(sessionBlocked)sample={available:false};
    lastSampleWindow=sample.available?sample.windowId:null;
    desktopSense(sample);
    if (!ambientWanted || Date.now() - activityHeartbeat > 20000) {
      if (!forwarded) return;
      forwarded = false; sample = { available: false };
    }
    const changed=sample.app!==lastActivityApp||sample.windowId!==lastActivityWindow;
    // The sampler ticks every 2 s for the desktop; the service keeps its 10 s rhythm.
    if(sample.available&&!changed&&Date.now()-lastForwardAt<10000)return;
    if(sample.available){forwarded=true;lastForwardAt=Date.now();}
    if(changed)activityContext++;
    // Typing owns focus-related interruptions; focusing this window alone must
    // not stop a deferred topic that is now continuing after the user's reply.
    if (win && !win.isDestroyed() && !sample.available) {
      win.webContents.send('companion-activity-invalid');
    }
    lastActivityApp = sample.available ? sample.app : undefined;
    lastActivityWindow=sample.available?sample.windowId:undefined;
    const result=await request('/game-companion/control', {action:'ambient-sample',sample:sample.available?
      {available:true,app:sample.app,idleMs:sample.idleMs,contextKey:activityContext,captureSupported:Date.now()>=quietState.visionPausedUntil,
        background:Array.isArray(sample.background)?sample.background:[]}:{available:false}});
    if(result.capture)await screenCapture.capture(result.capture.ticket,await inspectActivity(true));
    return result;
  } });
  const area = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({ x: area.x + area.width - 320, y: area.y + 30,
    width: 300, height: 412, minWidth: 300, minHeight: 412,
    frame: false, show: false, resizable: false, alwaysOnTop: true, transparent: true, hasShadow: false, backgroundColor: '#00000000',
    title: '鲸鱼合作搭子', webPreferences: { preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling:process.platform!=='darwin', partition: 'persist:companion-overlay' } });
  if(process.platform==='darwin'){
    app.dock?.hide();
    win.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true,skipTransformProcessType:true});
    win.setHiddenInMissionControl(true);
  }
  if(process.platform==='darwin')Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:'大肥鱼',submenu:[{role:'about'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{role:'quit'}]},
    {role:'editMenu'},{role:'windowMenu'}
  ]));
  else win.setMenu(null);
  windowTracker=createWindowTracker({root,excludeProcessId:process.pid,update:followPerch});
  if(!smoke)windowTracker.start();
  win.setContentProtection(false);
  setPointerPassthrough(true);
  screen.on('display-metrics-changed',refreshDock);
  screen.on('display-removed',refreshDock);
  if(process.platform==='darwin'){
    const session=blocked=>{
      sessionBlocked=blocked;
      if(!smoke)activitySensor.setEnabled(!blocked);
      if(blocked){
        win.webContents.send('companion-activity-invalid');
        void request('/game-companion/control',{action:'ambient-sample',sample:{available:false}}).catch(()=>{});
      }
    };
    session(powerMonitor.getSystemIdleState(1)==='locked');
    powerMonitor.on('lock-screen',()=>session(true));powerMonitor.on('suspend',()=>session(true));
    powerMonitor.on('unlock-screen',()=>session(false));powerMonitor.on('resume',()=>session(powerMonitor.getSystemIdleState(1)==='locked'));
  }
  if (!smoke) { activitySensor.setEnabled(!sessionBlocked); setInterval(() => activitySensor.setEnabled(!sessionBlocked), 60000).unref(); }
  pointPicker=createPointPicker({BrowserWindow,ipcMain,screen});
  gameLifecycle=lite?{snapshot:()=>({known:false,humanRunning:false,whaleRunning:false,automatic:false,busy:false,message:''}),
    setAutomatic(){return this.snapshot();},exitGame:async()=>{throw new Error('No game in the standalone app');},poll:async()=>{}}:createGameLifecycle({
    inspect:()=>gameProcess('Status'),
    stop:async automatic=>{
      const result=await gameProcess('StopWhale',automatic);
      await require('node:fs/promises').writeFile(path.join(output,'game-exit-check.json'),JSON.stringify({...result,automatic,at:new Date().toISOString()},null,2));
      return result;
    },
    pause:async()=>{
      const result=await request('/game-companion/control',{action:'pause'});
      if(!result.scheduler?.paused)throw new Error('Pause not confirmed');
    },
    publish:status=>{if(!win.isDestroyed())win.webContents.send('companion-game-state',status);}
  });
  for (const entry of cookies) {
    const split = entry.indexOf('=');
    await win.webContents.session.cookies.set({ url: base.origin, name: entry.slice(0, split),
      value: entry.slice(split + 1), path: '/', httpOnly: true, sameSite: 'strict' });
  }
  win.webContents.session.setPermissionRequestHandler((_web, _permission, callback) => callback(false));
  win.webContents.setWindowOpenHandler(({ url }) => {
    const target = new URL(url);
    if (['https:', 'http:'].includes(target.protocol) && !target.username && !target.password) void shell.openExternal(target.href);
    return { action: 'deny' };
  });
  const view = new URL('/game-companion/view', base).href;
  win.webContents.on('will-navigate', (event, url) => { if (url !== view) event.preventDefault(); });
  win.webContents.on('will-redirect', event => event.preventDefault());
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  win.webContents.on('render-process-gone', () => {
    ambientWanted = false;
    request('/game-companion/control', { action: 'pause' }).catch(() => {
      console.error('浮窗渲染中断，未能确认后台暂停；请在 DSH 中检查。');
    });
  });
  ipcMain.handle('companion-window', async (event, action, value, scale, composeExtra=0) => {
    if(win.isDestroyed())return;
    if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('Unknown window');
    if (action === 'state') return nativeState();
    if (action === 'mac-permissions') return desktopPermissions.perform(value);
    if (action === 'quick-hover') {hoverQuickChat(value===true);return;}
    if (action === 'quick-focus') {
      if(quickWasClickThrough===null)quickWasClickThrough=clickThrough;
      stopRoam();stopInertia();setClickThrough(false);
      placeQuickChat(true);
      win.show();win.focus();return;
    }
    if (action === 'quick-release') {
      const hadFocus=quickWasClickThrough!==null;
      if(quickWasClickThrough!==null){setClickThrough(quickWasClickThrough);quickWasClickThrough=null;}
      placeQuickChat(false);
      if(hadFocus)win.blur();
      // Hover already owns passthrough; focused input restored its saved state above.
      return;
    }
    if (action === 'activity') {
      activityHeartbeat = Date.now();
      ambientWanted = value === true && !desktopPrefs.sleeping;
      return;
    }
    if (action === 'desktop-prefs') {
      if(!value||typeof value.stroll!=='boolean'||typeof value.fullscreenHide!=='boolean')throw new Error('Invalid desktop preferences');
      desktopPrefs={stroll:value.stroll,fullscreenHide:value.fullscreenHide,sleeping:value.sleeping===true};
      if(desktopPrefs.sleeping){ambientWanted=false;stopInertia();stopPoint();stopRoam();allowDesktopMotion(false);}
      buildTray();return;
    }
    if (action === 'perch') return perchOnWindow();
    if (action === 'fall') {if(!pointRoute&&!dragStart&&!panelOpen)fall();return;
    }
    if (action === 'point-pick') return pickPoint();
    if (action === 'motion-state') {allowDesktopMotion(value===true);return;}
    if (action === 'quiet-state') {
      if(!value||![value.focusUntil,value.quietUntil,value.visionPausedUntil].every(Number.isFinite))throw new Error('Invalid quiet state');
      const cancelCapture=value.visionPausedUntil>Date.now()&&value.visionPausedUntil!==quietState.visionPausedUntil;
      quietState={focusUntil:value.focusUntil,quietUntil:value.quietUntil,visionPausedUntil:value.visionPausedUntil};buildTray();
      if(cancelCapture)await request('/game-companion/control',{action:'vision-cancel'});
      return;
    }
    if (action === 'point-step') {
      if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1)throw Error('Invalid movement progress');
      if(pointRoute&&!panelOpen&&!dragStart)win.setBounds({...roamPosition(pointRoute,value,pointRoute),width:pointRoute.width,height:pointRoute.height});
      return;
    }
    if (action === 'point-end') {
      if(pointRoute&&value==='complete'){
        win.setBounds({...roamPosition(pointRoute,1,pointRoute),width:pointRoute.width,height:pointRoute.height});
        if(perchPending){perch=perchPending;win.webContents.send('companion-perched',perch.placement);}
      }
      if(perchPending&&value!=='complete'){clearPerch();perchNotice('这次移动被打断了，等当前交互结束再叫我吧。');}
      pointRoute=null;perchPending=null;return;
    }
    if (action === 'game-state') return gameLifecycle.snapshot();
    if (action === 'game-auto-exit') return gameLifecycle.setAutomatic(value===true);
    if (action === 'game-exit') {
      if(smoke)throw new Error('Game exit is disabled during appearance checks');
      return gameLifecycle.exitGame();
    }
    if (action === 'layout') {
      if(typeof scale!=='number'||!Number.isFinite(scale)||scale<0.5||scale>5)throw new Error('Invalid pet size');
      if(!Number.isFinite(composeExtra)||composeExtra<0||composeExtra>320)throw new Error('Invalid composer height');
      setLayout(value===true,scale,composeExtra);return;
    }
    if (action === 'roam') {
      if(value===false){stopRoam();return;}
      if(!['moves/floating_steps','moves/crab_walk','moves/running_trip','moves/target_point_run'].includes(value))return;
      if(desktopPrefs.sleeping||panelOpen||dragStart||pointRoute||pointSelecting||inertiaTimer)return;
      if(edge||perch){win.webContents.send('companion-roam-blocked');return;}
      const cursor=!desktopPrefs.stroll&&value==='moves/target_point_run'?screen.getCursorScreenPoint():null;
      const area=(cursor?screen.getDisplayNearestPoint(cursor):screen.getDisplayMatching(win.getBounds())).workArea;
      roamRoute=desktopPrefs.stroll?strollRoute(win.getBounds(),area,facing,Math.random,petScale):planRoam(win.getBounds(),area,facing,
        cursor,Math.random,petScale);
      if(roamRoute){roamRoute.smooth=true;setFacing(roamRoute.direction);}
      else win.webContents.send('companion-roam-blocked');
      return;
    }
    if (action === 'roam-step') {
      if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1)throw new Error('Invalid movement progress');
      if(roamRoute&&!panelOpen&&!dragStart){
        const p=roamPosition(roamRoute,value,roamRoute);
        win.setBounds({...p,width:roamRoute.width,height:roamRoute.height});
      }return;
    }
    if (action === 'turn') {if(!pointRoute&&!inertiaTimer&&!edge)setFacing(-facing);return;}
    if (action === 'hover') {
      if(value===true)hoverFacing=facing;
      else {if(hoverFacing!==null&&!roamRoute&&!pointRoute&&!inertiaTimer)setFacing(hoverFacing);hoverFacing=null;}
      if(!clickThrough)setPointerPassthrough(value!==true);return;
    }
    if (action === 'look') {
      if(edge)return;
      if(hoverFacing!==null&&!roamRoute&&!pointRoute&&!dragStart&&!inertiaTimer){
        const b=win.getBounds(),direction=screen.getCursorScreenPoint().x<b.x+b.width/2?-1:1;
        if(direction!==facing)setFacing(direction);
      }return;
    }
    if (action === 'motion-stop') {stopInertia();return;}
    if (action === 'drag-prepare') {dragOrigin=screen.getCursorScreenPoint();return;}
    if (action === 'drag-start') {
      quickLift=null;
      stopInertia();stopPoint();stopRoam();clearEdge();clearPerch();
      const cursor=dragOrigin??screen.getCursorScreenPoint();dragOrigin=null;
      dragStart={cursor,bounds:win.getBounds()};dragSamples=[{...cursor,t:performance.now()}];return;
    }
    if (action === 'drag-move') {
      if(dragStart){const p=screen.getCursorScreenPoint();win.setPosition(Math.round(dragStart.bounds.x+p.x-dragStart.cursor.x),Math.round(dragStart.bounds.y+p.y-dragStart.cursor.y));
        dragSamples.push({...p,t:performance.now()});dragSamples=dragSamples.slice(-10);}
      return;
    }
    if (action === 'drag-end') {
      dragOrigin=null;
      if(!dragStart)return;
      dragStart=null;dragSamples.push({...screen.getCursorScreenPoint(),t:performance.now()});
      const velocity=releaseVelocity(dragSamples),generation=motionGeneration;
      if(velocity&&!panelOpen&&value===true&&!desktopPrefs.sleeping){
        const current=await request('/game-companion/state');
        if(generation===motionGeneration&&!dragStart&&!panelOpen&&current.scheduler.paused&&!current.scheduler.active){startInertia(velocity);return;}
      }
      snapToEdge();return;
    }
    if (action === 'toggle') return setClickThrough(!clickThrough);
    if (action === 'release') return setClickThrough(true);
    if (action === 'close') { void closeSafely(); return; }
    throw new Error('Unknown window action');
  });
  toggleAvailable = globalShortcut.register('Control+Alt+Space', () => setClickThrough(!clickThrough));
  focusAvailable = globalShortcut.register('Control+Alt+Enter', focusChat);
  win.on('close', event => { if (!allowClose) { event.preventDefault(); void closeSafely(); } });
  await win.loadURL(view);
  if (releaseCheck) {
    win.setOpacity(0);showWithoutFocus();
    await require('../../lite/release-check.cjs')({win,output,standalone:Boolean(lite)});
    allowClose=true;win.close();
  } else if (sleepCheck) {
    win.setOpacity(0);showWithoutFocus();
    await win.webContents.executeJavaScript('initialState.then(()=>undefined)');
    await require('./sleep-check.cjs')({win,output});
    allowClose=true;win.close();
  } else if (streamVoiceCheck) {
    win.setOpacity(0);showWithoutFocus();
    await win.webContents.executeJavaScript('initialState.then(()=>undefined)');
    await require('./stream-voice-check.cjs')({win,output});
    allowClose=true;win.close();
  } else if (motionCheck) {
    win.setOpacity(0);showWithoutFocus();
    await win.webContents.executeJavaScript('initialState.then(()=>undefined)');
    await require('./motion-check.cjs')({win,output,getRoute:()=>roamRoute,getFacing:()=>facing,startInertia,stopInertia});
    allowClose=true;win.close();
  } else if (perchCheck) {
    win.setOpacity(0);showWithoutFocus();
    await win.webContents.executeJavaScript('initialState.then(()=>undefined)');
    await require('./perch-check.cjs')({win,screen,output,root,tracker:windowTracker,perchOnWindow,getPerch:()=>perch,getPending:()=>perchPending,setLayout,desktopSense});
    allowClose=true;win.close();
  } else if (composerCheck) {
    win.setOpacity(0);showWithoutFocus();
    await win.webContents.executeJavaScript('initialState.then(()=>undefined)');
    await require('./composer-check.cjs')({win,output,request,screen,hideAtEdge,clearEdge,getEdge:()=>edge});
    allowClose=true;win.close();
  } else if (interactionCheck) {
    win.setOpacity(0);showWithoutFocus();
    await win.webContents.executeJavaScript('initialState.then(()=>undefined)');
    await require('./interaction-check.cjs')({win,output,request});
    allowClose=true;win.close();
  } else if (naturalCheck) {
    win.setOpacity(0);showWithoutFocus();
    await win.webContents.executeJavaScript('initialState.then(()=>undefined)');
    await require('./natural-check.cjs')({win,output,request});
    allowClose=true;win.close();
  } else if (touchCheck) {
    win.setOpacity(0);showWithoutFocus();
    await win.webContents.executeJavaScript('initialState.then(()=>undefined)');
    await require('./touch-check.cjs')({win,output,request});
    allowClose=true;win.close();
  } else if (ambientCheck) {
    win.setOpacity(0);showWithoutFocus();
    await win.webContents.executeJavaScript('initialState.then(()=>undefined)');
    await require('./ambient-check.cjs')({win,output,request,setClickThrough,nativeState});
    allowClose=true;win.close();
  } else if (emotionCheck) {
    win.setOpacity(0);showWithoutFocus();
    await win.webContents.executeJavaScript('initialState.then(()=>undefined)');
    await require('./emotion-check.cjs')({win,output,request});
    allowClose=true;win.close();
  } else if (conversationCheck) {
    win.setOpacity(0);showWithoutFocus();
    await win.webContents.executeJavaScript('initialState.then(()=>undefined)');
    await require('./conversation-check.cjs')({win,output,request});
    allowClose=true;win.close();
  } else if (edgeCheck) {
    showWithoutFocus();
    await win.webContents.executeJavaScript('initialState.then(()=>undefined)');
    await require('./dock-check.cjs')({win,output,hideAtEdge,getEdge:()=>edge,getEdgeX:()=>edgeX,getTucked:()=>tucked,
      hover:hoverQuickChat,allowDesktopMotion,setLayout,getScale:()=>petScale,clearEdge});
    allowClose=true;win.close();
  } else if (pointCheck) {
    win.setOpacity(0);showWithoutFocus();
    await win.webContents.executeJavaScript('initialState.then(()=>undefined)');
    await require('./point-move-check.cjs')({win,picker:pointPicker,screen,output,getRoute:()=>pointRoute});
    allowClose=true;win.close();
  } else if (animationCheck) {
    win.setOpacity(0);showWithoutFocus();
    await win.webContents.executeJavaScript('initialState.then(()=>undefined)');
    await require('./new-animation-check.cjs')({win,output});
    allowClose=true;win.close();
  } else if (smoke) {
    const finish=appearanceTest?async callback=>{await callback();allowClose=true;win.close();}:closeSafely;
    await require('./smoke.cjs')({ win, output, request, nativeState, setClickThrough, showWithoutFocus, closeSafely:finish, appearanceTest,
      checkPointMovement:async()=>{
        await require('./point-move-check.cjs')({win,picker:pointPicker,screen,output,getRoute:()=>pointRoute});
        await require('./motion-check.cjs')({win,output,getRoute:()=>roamRoute,getFacing:()=>facing,startInertia,stopInertia});
        await require('./new-animation-check.cjs')({win,output});
      } });
  } else {
    showWithoutFocus();buildTray();
    // Each check spawns PowerShell, so idle desktops are checked less often.
    const pollGame=async()=>{
      await gameLifecycle.poll();
      const game=gameLifecycle.snapshot();
      gameTimer=setTimeout(pollGame,!game.known||game.whaleRunning||game.humanRunning?5000:30000);
    };
    if(!lite)void pollGame();
    if(process.argv.includes('--desktop-companion'))await checkDesktopLaunch();
    if(process.argv.includes('--bubble-ui-check'))await require('./bubble-ui-check.cjs')({win,output,request});
    if(process.argv.includes('--visual-review'))await require('./visual-review-check.cjs')({win,output});
    const replyCheck=process.argv.includes('--reply-check');
    if(process.argv.includes('--voice-check')||replyCheck){
      for(let attempt=0;attempt<40;attempt++){
        if(await win.webContents.executeJavaScript('Boolean(state?.sessionId)'))break;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      await win.webContents.executeJavaScript(`
        globalThis.voiceCheck={playing:false,ended:false};
        const OriginalAudio=window.Audio;
        window.Audio=function(...args){const player=new OriginalAudio(...args);
          player.addEventListener('playing',()=>Object.assign(voiceCheck,{playing:true,duration:player.duration,muted:player.muted,volume:player.volume}));
          player.addEventListener('ended',()=>voiceCheck.ended=true);return player;};
        if(document.getElementById('voice').getAttribute('aria-pressed')!=='true')document.getElementById('voice').click();
        ${replyCheck ? '' : "document.getElementById('preview-voice').click();"}void 0;
      `);
      for(let attempt=0;attempt<240;attempt++){
        await new Promise(resolve=>setTimeout(resolve,250));
        const result=await win.webContents.executeJavaScript(`({...voiceCheck,enabled:localStorage.getItem('companion-voice')==='on',status:document.getElementById('voice-status').textContent})`);
        if(result.ended||attempt===239){await require('node:fs/promises').writeFile(path.join(output,replyCheck?'reply-voice-check.json':'voice-live-check.json'),JSON.stringify(result,null,2));break;}
      }
    }
  }
}

if (!app.requestSingleInstanceLock()) app.exit(smoke ? 2 : 0);
else app.whenReady().then(start).catch(async error => {
  startupFailed = true;
  await require('node:fs/promises').writeFile(path.join(output,smoke?'overlay-test-failure.json':'overlay-startup-error.json'),JSON.stringify({
    checkedAt:new Date().toISOString(),name:error.name,message:String(error.message).replace(/https?:\/\/\S+/g,'[URL]').slice(0,1000)
  }));
  // Do not log request URLs, cookies, or private access tokens.
  console.error(`Companion overlay: ${error.code || 'startup failed'}`);
  if (smoke && error.code === 'ERR_ASSERTION') console.error(error.stack);
  if (!smoke && (await dialog.showMessageBox({ type: 'warning', title: '大肥鱼没能启动', message: '桌宠启动失败',
    detail: `${lite?'可以点「重试」再试一次。':'最常见的原因是 DSH 里的游戏搭子还没启动。先打开它，再点「重试」。'}\n\n原因：${error.code || String(error.message).replace(/https?:\/\/\S+/g,'[URL]').slice(0,200)}`,
    buttons: ['重试', '退出'], defaultId: 0, cancelId: 1 })).response === 0) app.relaunch();
  app.exit(1);
});
app.on('second-instance', (_event,args) => {
  // The first attempt may have failed before creating a window. A later
  // shortcut launch must recover instead of disappearing into its held lock.
  if(startupFailed){app.relaunch();app.exit(1);return;}
  if(!win)return;
  showWithoutFocus();
  if(args.includes('--desktop-companion')){
    win.webContents.send('companion-desktop-start');
    void checkDesktopLaunch().catch(()=>console.error('Desktop companion readiness check failed.'));
  }
});
app.on('window-all-closed', () => app.quit());
app.on('activate',()=>{if(win&&!win.isDestroyed())showWithoutFocus();});
app.on('will-quit', () => {tray?.destroy();clearEdge();windowTracker?.close();screenCapture?.close();void activitySensor?.close();clearTimeout(gameTimer);clearInterval(inertiaTimer);globalShortcut.unregisterAll();});
