// Targeted real-Chromium regression check; independent of the user's overlay.
const {app,BrowserWindow}=require('electron');
const {readFile,writeFile,mkdir}=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),output=path.join(root,'outputs/companion-runtime');
app.setPath('userData',path.join(output,'geometry-check-data'));
app.whenReady().then(async()=>{
  const log=await readFile(path.join(output,'host.stdout.log'),'utf8');
  const base=new URL(log.match(/dsh web: (http:\/\/[^\s]+)/)[1]);
  const landing=await fetch(base,{redirect:'manual'});
  const win=new BrowserWindow({width:420,height:493,show:false,transparent:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,partition:'geometry-check'}});
  for(const entry of landing.headers.getSetCookie()){
    const value=entry.split(';')[0],i=value.indexOf('=');
    await win.webContents.session.cookies.set({url:base.origin,name:value.slice(0,i),value:value.slice(i+1),httpOnly:true});
  }
  await win.loadURL(new URL('/game-companion/view',base).href);
  // An entirely hidden window throttles rAF; transparent/inactive keeps compositor frames running.
  win.setOpacity(0);win.showInactive();
  const report=await win.webContents.executeJavaScript(`(async()=>{
    voiceEnabled=false;stopVoice();petAnimator.desktop(false,[],false);petAnimator.suspend(false);
    const samples=[];
    function sample(){return [...document.querySelectorAll('video.pet-layer')].map(v=>{
      const r=v.getBoundingClientRect(),s=getComputedStyle(v);
      return {id:v.id,width:r.width,height:r.height,x:r.x,y:r.y,opacity:s.opacity,position:s.position};
    });}
    async function clip(action){
      petAnimator.perform(action);
      let readyAt=null;
      for(let i=0;i<300;i++){
        await new Promise(resolve=>requestAnimationFrame(resolve));
        samples.push(sample());
        if(document.getElementById('pet').src.includes(action)&&document.getElementById('pet').currentTime>0){
          readyAt??=performance.now();
          if(performance.now()-readyAt>250)return;
        }
      }
      throw Error('Clip did not start: '+action);
    }
    document.body.style.setProperty('--pet-scale','1.4');
    await clip('magic/card_magic');
    document.getElementById('pet').currentTime=document.getElementById('pet').duration-.08;
    await new Promise(resolve=>setTimeout(resolve,250));samples.push(sample());
    await clip('daily/big_stretch');await clip('idle/breathing');
    return {samples,expectedSize:420};
  })()`);
  await mkdir(output,{recursive:true});
  await writeFile(path.join(output,'layer-geometry-check.json'),JSON.stringify(report,null,2));
  await writeFile(path.join(output,'layer-geometry-preview.png'),(await win.webContents.capturePage()).toPNG());
  for(const layers of report.samples)for(const layer of layers){
    assert.equal(layer.width,report.expectedSize,`Unexpected ${layer.id} width`);
    assert.equal(layer.height,report.expectedSize,`Unexpected ${layer.id} height`);
    assert.equal(layer.position,'absolute',`Unexpected ${layer.id} positioning`);
  }
  for(const layers of report.samples){assert.equal(layers[0].x,layers[1].x);assert.equal(layers[0].y,layers[1].y);}
  console.log('Layer geometry passed: '+report.samples.length+' transition frames; both videos stay 420x420.');
  app.exit(0);
}).catch(error=>{console.error(error.name+': '+String(error.message).replace(/https?:\/\/\S+/g,'[URL]'));app.exit(1);});
