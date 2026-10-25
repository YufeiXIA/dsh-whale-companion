const assert=require('node:assert/strict');
const {writeFile}=require('node:fs/promises');
const path=require('node:path');

// Real carrier and production handlers; synthetic replies never leave this renderer.
module.exports=async function({win,output,hideAtEdge,getEdge,getEdgeX,getTucked,hover,setLayout,getScale,clearEdge}){
  assert.equal(win.isResizable(),false,'native edge and corner resize grips must be disabled');
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const js=code=>win.webContents.executeJavaScript(code);
  async function waitFor(check,label){for(let i=0;i<100;i++){if(await check())return;await sleep(20);}throw Error('Dock check timed out: '+label);}
  const page=()=>js(`(()=>{const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
    return {side:document.body.getAttribute('data-edge'),bodyClip:document.body.style.clipPath,pet:rect('pet-hit'),bubble:rect('speech-bubble'),quick:rect('quick-chat'),
      width:innerWidth,height:innerHeight,edgeFacing:getComputedStyle(document.getElementById('stage')).getPropertyValue('--edge-facing').trim(),compact:document.body.classList.contains('compact'),quickOpen:document.body.classList.contains('quick-chat-open'),focused:document.activeElement?.id,active:state?.scheduler?.active};})()`);
  const fits=(r,p)=>r.left>=-.01&&r.right<=p.width+.01&&r.top>=-.01&&r.bottom<=p.height+.01;
  async function screenshot(name,side){
    const bounds=win.getBounds(),width=Math.min(440,bounds.width);
    await writeFile(path.join(output,name),(await win.webContents.capturePage({x:side<0?0:bounds.width-width,y:0,width,height:bounds.height})).toPNG());
  }
  await js('voiceEnabled=false;stopVoice();setPanel(false);petAnimator.desktop(false,[],false);globalThis.dockReviewState=state;void 0;');
  const scale=getScale(),results=[];
  let ignored;
  const originalIgnore=win.setIgnoreMouseEvents.bind(win);
  win.setIgnoreMouseEvents=(value,options)=>{ignored=value;return originalIgnore(value,options);};
  for(const display of require('electron').screen.getAllDisplays())for(const side of [-1,1]){
    clearEdge();
    hover(true);
    const area=display.workArea;
    win.setPosition(side<0?area.x+10:area.x+area.width-win.getBounds().width-10,Math.max(area.y+40,win.getBounds().y));
    await sleep(80);
    hideAtEdge();await waitFor(()=>getTucked()&&getEdgeX()===getEdge().peekX,'half dock');
    const carrier=win.getBounds();assert.equal(getEdge().side,side);assert.ok(Math.abs(carrier.x-area.x)<=1);assert.ok(Math.abs(carrier.width-area.width)<=1,'native DIP bounds may round by one pixel at 150%');
    for(const size of [.6,1.6,scale]){
      await js(`document.body.style.setProperty('--pet-scale',${size});document.getElementById('pet-size').value=${size*100};void 0;`);
      setLayout(false,size);await waitFor(()=>getEdgeX()===getEdge().peekX,'scaled dock');
      const fixed=win.getBounds(),fixedAnchor=getEdgeX();
      for(let i=0;i<4;i++){hover(i%2===0);await sleep(20);}
      await js(`render({...dockReviewState,scheduler:{...dockReviewState.scheduler,paused:true,active:true},messages:[...dockReviewState.messages,
        {id:'dock-review-${side}-${size}',role:'assistant',text:'我就在边上陪着你。刚才那段介绍我也认真看了一会儿，那个小细节还挺有意思的。'.repeat(8).slice(0,240),ambient:true,spoken:false,at:Date.now()}]});void 0;`);
      await sleep(220);const speaking=await page();
      assert.equal(speaking.active,true);assert.ok(fits(speaking.bubble,speaking),'inward bubble fits');assert.equal(speaking.bodyClip,'');assert.ok(speaking.compact);
      assert.equal(speaking.edgeFacing,side<0?'1':'-1','edge pose is mirrored inward independently of the walking clips');
      const petCentre=(speaking.pet.left+speaking.pet.right)/2;
      assert.ok(Math.abs(petCentre-(side<0?0:speaking.width))<=1.1,'half of the hit region stays outside the carrier');
      assert.deepEqual(win.getBounds(),fixed);assert.equal(getEdgeX(),fixedAnchor);
      await js("document.getElementById('pet-hit').click();document.getElementById('quick-message').value='这句只检查输入布局，不发送。';void 0;");
      await waitFor(()=>js("document.activeElement?.id==='quick-message'"),'keyboard focus');
      await sleep(220);
      const typing=await page();assert.ok(typing.quickOpen&&typing.compact);assert.ok(fits(typing.quick,typing),JSON.stringify({display:display.id,scale:size,...typing}));
      assert.deepEqual(win.getBounds(),fixed);assert.equal(getEdgeX(),fixedAnchor);
      await js("document.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:innerWidth/2,clientY:5}));void 0;");
      await sleep(40);assert.equal(ignored,true,'input focus cannot intercept the transparent middle');
      if(size===scale)await screenshot(side<0?'edge-docked-left.png':'edge-docked-right.png',side);
      await js("document.getElementById('quick-message').value='';document.getElementById('quick-message').blur();hideQuickChat();setBubbleVisible(false);render(dockReviewState);void 0;");
      await sleep(60);assert.equal(getEdgeX(),fixedAnchor);
      results.push({display:display.id,dpi:display.scaleFactor,side,scale:size,bubble:speaking.bubble,input:typing.quick,halfHidden:true,stableOnReply:true,stableOnInput:true,transparentMiddle:true});
    }
  }
  clearEdge();await waitFor(()=>js("!document.body.hasAttribute('data-edge')"),'released dock');
  const free=[];
  for(const size of [.6,1.6]){
    hover(true);const area=require('electron').screen.getDisplayMatching(win.getBounds()).workArea;
    win.setPosition(area.x+100,area.y+100);
    await js(`document.body.style.setProperty('--pet-scale',${size});document.getElementById('pet-size').value=${size*100};showBubble('鲸'.repeat(240),null,240);void 0;`);
    setLayout(false,size);await sleep(220);const p=await page();
    assert.ok(fits(p.bubble,p),JSON.stringify({free:true,size,...p}));free.push({scale:size,bubble:p.bubble});
  }
  await js("delete globalThis.dockReviewState;setPanel(true);document.body.dataset.portraitMode='animated';void 0;");
  await sleep(220);await js('document.fonts.ready.then(()=>undefined)');
  const header=await js(`({font:getComputedStyle(document.querySelector('h1')).fontFamily,roundedFontAvailable:document.fonts.check('28px YouYuan'),stageTop:document.getElementById('stage').getBoundingClientRect().top,compact:document.body.classList.contains('compact'),mode:document.body.dataset.portraitMode,cssTop:getComputedStyle(document.getElementById('stage')).top})`);
  assert.ok(header.stageTop>=54,JSON.stringify(header));assert.ok(header.roundedFontAvailable);
  const bounds=win.getBounds();await writeFile(path.join(output,'header-refined.png'),(await win.webContents.capturePage({x:0,y:0,width:bounds.width,height:Math.min(235,bounds.height)})).toPNG());
  await writeFile(path.join(output,'dock-check.json'),JSON.stringify({completed:true,mode:'fixed half dock',results,free,header,
    note:'Real Electron focus and production handlers. Replies/pointer notifications are simulated. No chat, model call or screenshot upload is sent.'},null,2));
};
