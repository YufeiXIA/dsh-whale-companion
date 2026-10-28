// Real Chromium layout regression; isolated from the user's overlay and chat.
const {app,BrowserWindow}=require('electron');
const {readFile,writeFile,mkdir}=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {compactFooter}=require('./roaming.cjs');
const root=path.resolve(__dirname,'../..'),output=path.join(root,'outputs/companion-runtime');
app.setPath('userData',path.join(output,'quick-geometry-data'));
app.whenReady().then(async()=>{
  const log=await readFile(path.join(output,'host.stdout.log'),'utf8');
  const base=new URL(log.match(/dsh web: (http:\/\/[^\s]+)/)[1]);
  const landing=await fetch(base,{redirect:'manual'});
  const win=new BrowserWindow({width:300,height:332,show:false,transparent:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,partition:'quick-geometry'}});
  for(const entry of landing.headers.getSetCookie()){
    const value=entry.split(';')[0],i=value.indexOf('=');
    await win.webContents.session.cookies.set({url:base.origin,name:value.slice(0,i),value:value.slice(i+1),httpOnly:true});
  }
  await win.loadURL(new URL('/game-companion/view',base).href);
  win.setOpacity(0);win.showInactive();
  await win.webContents.executeJavaScript('initialState.then(()=>undefined)');
  const samples=[];
  for(const scale of [.5,.8,1,1.6,3,5]){
    win.setSize(Math.max(300,Math.round(300*scale)),Math.round(202*scale+250+compactFooter(scale)));
    await win.webContents.executeJavaScript(`voiceEnabled=false;stopVoice();petAnimator.desktop(false,[],false);setPanel(false);document.body.style.setProperty('--pet-scale','${scale}');document.body.classList.add('quick-chat-open');petAnimator.perform('idle/breathing');void 0;`);
    await new Promise(resolve=>setTimeout(resolve,600));
    const sample=await win.webContents.executeJavaScript(`(()=>{
      const form=document.getElementById('quick-chat'),input=form.getBoundingClientRect();
      const video=document.getElementById('pet'),r=video.getBoundingClientRect();
      const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(video,0,0);
      const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      let top=canvas.height,bottom=0;
      for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(pixels[(y*canvas.width+x)*4+3]>100){top=Math.min(top,y);bottom=Math.max(bottom,y);}
      const fit=Math.min(r.width/canvas.width,r.height/canvas.height),offset=(r.height-canvas.height*fit)/2;
      return {scale:${scale},input:{top:input.top,bottom:input.bottom,left:input.left,right:input.right},
        pet:{top:r.top+offset+top*fit,bottom:r.top+offset+(bottom+1)*fit},
        viewport:{width:innerWidth,height:innerHeight},decoded:video.readyState>=2};
    })()`);
    samples.push(sample);
    await writeFile(path.join(output,`quick-chat-size-${Math.round(scale*100)}.png`),(await win.webContents.capturePage()).toPNG());
  }
  await mkdir(output,{recursive:true});
  await writeFile(path.join(output,'quick-chat-geometry-check.json'),JSON.stringify({samples,at:new Date().toISOString()},null,2));
  for(const sample of samples){
    assert.equal(sample.decoded,true);
    assert.ok(sample.pet.bottom+8<=sample.input.top,`Input covers pet at ${sample.scale*100}%: input top ${sample.input.top}, pet bottom ${sample.pet.bottom}`);
    assert.ok(sample.input.top-sample.pet.bottom<=22,'Input must stay close to the visible feet');
    assert.ok(sample.input.top>=0&&sample.input.left>=0&&sample.input.right<=sample.viewport.width,'Input must stay inside the window');
  }
  const model=JSON.parse(await readFile(path.join(root,'outputs/chat-animation-20261024/report.json'),'utf8'));
  assert.equal(model.completed,true);
  await win.webContents.executeJavaScript(`
    document.body.classList.remove('quick-chat-open');
    globalThis.animationFixture={...state,sessionId:'isolated-animation-preview',messages:[],scheduler:{paused:true}};
    const nativeFetch=window.fetch;
    window.fetch=(url,...args)=>url==='/game-companion/state'?new Promise(()=>{}):nativeFetch(url,...args);
    petAnimator.update(animationFixture);void 0;`);
  const clips=[];
  for(const [i,reply] of model.replies.entries()){
    await win.webContents.executeJavaScript(`animationFixture.messages.push({...${JSON.stringify(reply)},id:'preview-${i}',role:'assistant',at:Date.now()});petAnimator.update(animationFixture);void 0;`);
    const clip=reply.animation.startsWith('companion/')?'/game-companion/animations/'+reply.animation.slice(10)+'.webm':'/whale-pet/'+reply.animation+'.webm';
    let actual;
    for(let attempt=0;attempt<60;attempt++){
      actual=await win.webContents.executeJavaScript(`(()=>{const v=document.getElementById('pet');return {path:new URL(v.src).pathname,time:v.currentTime,decoded:v.readyState>=2,playing:!v.paused,layers:document.querySelectorAll('video.pet-layer').length};})()`);
      if(actual.path===clip&&actual.time>.2&&actual.playing)break;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.equal(actual.path,clip);assert.equal(actual.decoded,true,'Clip did not decode '+JSON.stringify(actual));assert.equal(actual.playing,true,'Clip did not play '+JSON.stringify(actual));assert.equal(actual.layers,2);
    clips.push({animation:reply.animation,...actual});
    // Original pet routes do not seek; play through the actual ended event instead.
    await win.webContents.executeJavaScript('document.getElementById("pet").playbackRate=4;void 0;');
    let returned=false;
    for(let attempt=0;attempt<80;attempt++){
      await new Promise(resolve=>setTimeout(resolve,100));
      if(await win.webContents.executeJavaScript('document.getElementById("pet").src.includes("/idle/breathing.webm")')){returned=true;break;}
    }
    assert.equal(returned,true,'Chat clip must return to idle: '+reply.animation);
  }
  await writeFile(path.join(output,'chat-animation-playback-check.json'),JSON.stringify({completed:true,clips,layoutSamples:samples.length,at:new Date().toISOString()},null,2));
  console.log('Quick chat stays below the pet at five sizes; three real model replies play the matching clips and return to idle.');app.exit(0);
}).catch(error=>{console.error(String(error.stack).replace(/https?:\/\/\S+/g,'[URL]'));app.exit(1);});
