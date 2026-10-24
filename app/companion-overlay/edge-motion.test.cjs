const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {edgeSnap}=require('./edge-snap.cjs');
const {compactFooter}=require('./roaming.cjs');
const {quickChatY}=require('./desktop-life.cjs');
const main=fs.readFileSync(require.resolve('./main.cjs'),'utf8');

function fixture(x=-60,y=200){
  let time=0,id=0,bounds={x,y,width:300,height:473},handler;
  const area={x:0,y:0,width:1920,height:1040},timers=new Map(),changes=[],events=[];
  const schedule=(fn,delay)=>{const key=++id;timers.set(key,{fn,at:time+delay,delay});return key;};
  const context={edge:null,edgeX:null,tucked:false,slideTimer:null,slideTarget:null,desktopMotionAllowed:true,
    dragStart:null,dragSamples:[],panelOpen:false,layoutKey:'false,1',quickLift:null,quickWasClickThrough:null,
    pointSelecting:false,perch:null,petScale:1,smoke:false,edgeCheck:false,clickThrough:false,pointerIgnored:false,
    edgeSnap,compactFooter,quickChatY,performance:{now:()=>time},
    setInterval:schedule,clearInterval:key=>timers.delete(key),
    screen:{getDisplayMatching:()=>({workArea:area}),getCursorScreenPoint:()=>({x:50,y:500})},
    win:{isDestroyed:()=>false,getBounds:()=>({...bounds}),setMinimumSize(){},
      setBounds:next=>{bounds={...next};changes.push({...bounds});},setPosition:(x,y)=>{bounds={...bounds,x,y};changes.push({...bounds});},
      webContents:{mainFrame:{},send:(...args)=>events.push(args)},show(){},focus(){},blur(){},setIgnoreMouseEvents(){}},
    setFacing(){},stopInertia(){},stopPoint(){},stopRoam(){},buildTray(){},
    setClickThrough(value){context.clickThrough=value;},ipcMain:{handle:(_name,callback)=>{handler=callback;}}};
  const edgeFunctions=main.slice(main.indexOf('function clearEdge('),main.indexOf('function stopPoint('));
  const layoutFunctions=main.slice(main.indexOf('function setLayout('),main.indexOf('async function request('));
  const picking=main.slice(main.indexOf('async function pickPoint('),main.indexOf('function setLayout('));
  const registration=main.slice(main.indexOf("ipcMain.handle('companion-window'"),main.indexOf('  toggleAvailable = globalShortcut.register'));
  vm.runInNewContext(edgeFunctions+'\n'+picking+'\n'+layoutFunctions+'\n'+registration,context);
  return {context,events,changes,get bounds(){return {...bounds};},get centre(){return context.edge?context.edgeX+context.edge.baseWidth/2:bounds.x+bounds.width/2;},
    invoke:(action,value,scale)=>handler({sender:context.win.webContents,senderFrame:context.win.webContents.mainFrame},action,value,scale),
    advance(ms){const until=time+ms;for(;;){const next=[...timers].filter(([,v])=>v.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;
      const [key,timer]=next;time=timer.at;timer.at+=timer.delay;timer.fn();}time=until;},
    dock(){context.snapToEdge();this.advance(300);}};
}

test('docking moves only the character anchor; the carrier remains inside the work area',()=>{
  const f=fixture();const centre=f.centre;f.context.snapToEdge();
  assert.equal(f.centre,centre,'expanding the carrier preserves the character world position');
  assert.equal(f.bounds.x,0);assert.equal(f.bounds.width,1920);
  const changes=f.changes.length;f.advance(300);
  assert.equal(f.centre,0);assert.equal(f.changes.length,changes,'animation does not call native window movement per frame');
  assert.ok(f.context.tucked);
});

test('repeated placement and hover never restart or reveal a docked character',()=>{
  const f=fixture(600);f.context.hideAtEdge();
  for(let i=0;i<10;i++){f.advance(30);f.context.placeEdge();f.context.hoverQuickChat(i%2===0);}
  assert.equal(f.centre,0);assert.equal(f.context.slideTimer,null);
  const bounds=f.bounds;f.context.hideAtEdge();f.context.hoverQuickChat(true);f.advance(500);
  assert.deepEqual(f.bounds,bounds);assert.equal(f.centre,0);
});

test('active proactive replies, input focus and release keep both dock and carrier fixed',async()=>{
  const f=fixture();f.dock();const bounds=f.bounds;
  f.context.allowDesktopMotion(false);await f.invoke('quick-focus');f.advance(500);
  assert.equal(f.centre,0);assert.deepEqual(f.bounds,bounds);
  await f.invoke('quick-release');f.context.allowDesktopMotion(true);f.advance(500);
  assert.equal(f.centre,0);assert.deepEqual(f.bounds,bounds);
});

test('only an actual drag restores compact bounds without a character jump',async()=>{
  const f=fixture();f.dock();const centre=f.centre;
  await f.invoke('drag-start',{x:15,y:450});
  assert.equal(f.context.edge,null);assert.equal(f.bounds.width,300);assert.equal(f.centre,centre);
  assert.equal(f.context.dragStart.cursor.x,15);
});

test('chat expansion, destination picking and size changes preserve the dock',async()=>{
  for(const x of [-60,1700]){
    const f=fixture(x);f.dock();const centre=f.centre,side=f.context.edge.side;
    await f.invoke('layout',true,1);await f.invoke('point-pick');assert.equal(f.centre,centre);
    assert.ok(f.events.some(([name])=>name==='companion-dock-locked'));
    f.context.setLayout(false,1.6);f.advance(300);
    assert.equal(f.context.edge.side,side);assert.equal(f.centre,centre);assert.equal(f.bounds.width,1920);
  }
});

test('motion suspension cancels an in-flight anchor and resumes the same edge',()=>{
  const f=fixture(600);f.context.hideAtEdge();f.advance(64);
  f.context.allowDesktopMotion(false);const centre=f.centre;f.advance(400);assert.equal(f.centre,centre);
  f.context.allowDesktopMotion(true);f.advance(300);assert.equal(f.centre,0);
});

test('taskbar chat uses a safe bottom inset without moving the character vertically',()=>{
  const f=fixture(-60,627);f.dock();const bounds=f.bounds;
  f.context.placeQuickChat(true);assert.deepEqual(f.bounds,bounds);
  const event=f.events.filter(([name])=>name==='companion-edge').at(-1);
  assert.equal(Number(event[1].split(',')[2]),67);
});

test('closing a hover-only input changes neither focus nor native mouse hooks',async()=>{
  const f=fixture();f.dock();let blur=0,hooks=0;
  f.context.win.blur=()=>blur++;f.context.win.setIgnoreMouseEvents=()=>hooks++;
  await f.invoke('quick-release');assert.equal(blur,0);assert.equal(hooks,0);
  f.context.quickWasClickThrough=false;await f.invoke('quick-release');assert.equal(blur,1);
});

test('display changes rebuild the carrier and preserve the selected screen side',()=>{
  const f=fixture(1700);f.dock();
  f.context.screen.getDisplayMatching=()=>({workArea:{x:-1280,y:0,width:1280,height:720}});
  f.context.refreshDock();assert.equal(f.context.edge.side,1);assert.equal(f.centre,0);
  assert.equal(f.bounds.x,-1280);assert.equal(f.bounds.width,1280);
});
