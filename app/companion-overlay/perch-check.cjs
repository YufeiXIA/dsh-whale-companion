const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {createInterface}=require('node:readline');
const {writeFile}=require('node:fs/promises');
const path=require('node:path');
const {floorY,perchRoute}=require('./desktop-life.cjs');

module.exports=async function({win,screen,output,root,tracker,perchOnWindow,getPerch,getPending,setLayout,desktopSense}){
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),js=code=>win.webContents.executeJavaScript(code);
  async function wait(check,label){for(let i=0;i<160;i++){if(await check())return;await sleep(75);}throw Error('Perch check: '+label);}
  const child=spawn(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),
    ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'tools/perch-window-fixture.ps1')],
    {windowsHide:true,stdio:['pipe','pipe','pipe']});
  let fixture=null,done=0,fixtureError='';
  child.stderr.on('data',chunk=>fixtureError+=chunk.toString());
  const lines=createInterface({input:child.stdout});
  lines.on('line',line=>{const event=JSON.parse(line);if(event.kind==='ready')fixture=event;else done++;});
  async function command(text){const before=done;child.stdin.write(text+'\n');await wait(()=>done>before,'fixture '+text.split(' ')[0]);}
  const area=screen.getPrimaryDisplay().workArea;
  const rect={x:area.x+Math.round(area.width*.2),y:area.y+Math.max(260,Math.round(area.height*.4)),width:Math.min(700,area.width*.55),height:Math.min(350,area.height*.35)};
  async function move(displayRect){const physical=screen.dipToScreenRect(null,displayRect);await command(`move a ${physical.x} ${physical.y} ${physical.width} ${physical.height}`);}
  const report={startedAt:new Date().toISOString(),checks:[],screens:screen.getAllDisplays().map(d=>({bounds:d.bounds,scale:d.scaleFactor}))};
  try{
    await wait(()=>fixture||child.exitCode!==null,'fixture ready');assert.ok(fixture,fixtureError);
    tracker.start();await move(rect);await command('focus a');
    await js("document.getElementById('pet-size').value='100';document.body.style.setProperty('--pet-scale','1');setPanel(false);petAnimator.desktop(true,[],false,'natural');petAnimator.suspend(false);void 0;");
    setLayout(false,1);win.setPosition(area.x+100,area.y+Math.round(area.height*.45));
    await sleep(250);
    const first=await tracker.select();assert.equal(first.windowId,fixture.first);
    // Focus our pet UI after sampling A; a menu/UI click must still resolve A.
    win.focus();await sleep(100);
    const selected=await tracker.select();assert.equal(selected.windowId,fixture.first);
    assert.equal(await perchOnWindow(),true);
    await wait(()=>Boolean(getPerch()),'arrive on A');
    report.checks.push('fresh target selection through pet UI focus; real animation and IPC arrival');
    const before=win.getBounds();await move({...rect,x:rect.x+90,y:rect.y+35,width:rect.width+40});
    await wait(()=>Math.abs(win.getBounds().y-before.y-35)<=2&&Math.abs(win.getBounds().x-before.x)>50,'follow movement and resize');
    report.checks.push('movement and resize followed');
    const display=screen.getPrimaryDisplay().bounds;
    const insideScreen=()=>{const b=win.getBounds();return b.x>=display.x&&b.y>=display.y&&b.x+b.width<=display.x+display.width&&b.y+b.height<=display.y+display.height;};
    await command('maximize a');
    await wait(()=>getPerch()?.placement==='inside'&&insideScreen(),'maximized app inside placement');
    report.checks.push('maximized app retains perch with whole bubble and composer carrier onscreen');
    const full=screen.dipToScreenRect(null,display);
    await command(`fullscreen a ${full.x} ${full.y} ${full.width} ${full.height}`);
    await wait(()=>getPerch()?.sample.rect.width===full.width&&insideScreen(),'borderless fullscreen follow');
    desktopSense({available:true,fullscreen:true,app:'other',windowId:fixture.first,idleMs:0});
    assert.equal(win.isVisible(),true);
    report.checks.push('borderless fullscreen placement overrides automatic fullscreen hiding for attached target');
    await command('focus a');
    assert.equal(await perchOnWindow(),true);
    await wait(()=>getPerch()?.placement==='inside','direct fullscreen command arrival');
    report.checks.push('direct command also works while target is already fullscreen');
    await move(rect);await wait(()=>getPerch()?.placement==='edge','return from fullscreen to top edge');
    const other=screen.getAllDisplays().find(d=>d.id!==screen.getPrimaryDisplay().id);
    if(other){
      await move({x:other.workArea.x+160,y:other.workArea.y+Math.max(260,Math.round(other.workArea.height*.4)),width:Math.min(600,other.workArea.width-180),height:300});
      await wait(()=>{const p=getPerch();if(!p)return false;const r=screen.screenToDipRect(null,p.sample.rect),display=screen.getDisplayMatching(r);
        const expected=perchRoute(win.getBounds(),r,display.bounds,1,p.anchor);return display.id===other.id&&expected&&Math.abs(win.getBounds().x-expected.target)<=2;},'cross display follow');
      report.checks.push('actual secondary display follow');
      await move(rect);await wait(()=>getPerch()&&win.getBounds().x>=area.x,'return to primary');
    }
    await command('focus b');await command('minimize a');
    await wait(()=>!getPerch()&&!getPending(),'background minimized detach');
    await wait(()=>{const b=win.getBounds();return Math.abs(b.y-floorY(screen.getDisplayMatching(b).workArea,b.height,1))<=2;},'fall to floor');
    report.checks.push('background minimization detected and natural fall settled');
    await command('focus a');
    await wait(async()=>(await tracker.select()).windowId===fixture.first,'restored A foreground');
    assert.equal(await perchOnWindow(),true);
    await wait(()=>Boolean(getPerch()),'second perch');assert.equal(getPerch().windowId,fixture.first);
    await command('focus b');await command('close a');
    await wait(()=>!getPerch(),'background closed detach');
    report.checks.push('background closure detected');
    const latest=await tracker.select();assert.equal(latest.windowId,fixture.second);
    report.checks.push('new current window replaces previous target immediately');
    await js('setPanel(true);void 0;');await sleep(150);assert.equal(await perchOnWindow(),false);
    await wait(()=>js("document.getElementById('perch-notice').textContent.includes('收起聊天面板')"),'visible panel rejection');
    report.checks.push('expanded panel gives visible reason');
    report.completed=true;
  }catch(error){report.completed=false;report.error=error.message;report.bounds=win.getBounds();report.target=getPerch();report.fixture=fixture;report.scale=await js("document.getElementById('pet-size').value");throw error;}
  finally{
    tracker.clear();child.stdin.write('exit\n');await sleep(200);child.kill();lines.close();
    await writeFile(path.join(output,'perch-native-check.json'),JSON.stringify(report,null,2));
  }
};
