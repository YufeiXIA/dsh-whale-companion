const assert=require('node:assert/strict');
const {writeFile}=require('node:fs/promises');
const path=require('node:path');

module.exports=async({win,output,request,screen,hideAtEdge,clearEdge,getEdge})=>{
  const before=await request('/game-companion/state');
  assert.equal(before.scheduler.paused,true);assert.equal(before.scheduler.active,false);
  const js=async code=>{
    try{return await win.webContents.executeJavaScript(code,true);}
    catch(error){throw Error('Composer check script: '+code.slice(0,100)+'; '+error.message);}
  },wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  await js(`(async()=>{window.composerTest={fetch:window.fetch.bind(window),calls:[],fail:false};
    window.fetch=async(url,options)=>{
      if(url==='/game-companion/control'){
        const body=JSON.parse(options.body);
        if(body.action==='interaction-state')return new Response('{}');
        if(body.action!=='chat')throw Error('Unexpected test request');
        composerTest.calls.push(body);
        return new Response(JSON.stringify(composerTest.fail?{error:'测试发送失败'}:state),{status:composerTest.fail?503:200});
      }
      return composerTest.fetch(url,options);
    };
    voiceEnabled=false;stopVoice();setPanel(false);petAnimator.desktop(false,[],false);petAnimator.perform('idle/breathing');
    const canvas=document.createElement('canvas');canvas.width=800;canvas.height=400;
    const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,800,400);
    ctx.fillStyle='#267acc';ctx.beginPath();ctx.arc(220,200,90,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#ef8e28';ctx.beginPath();ctx.moveTo(550,100);ctx.lineTo(450,300);ctx.lineTo(650,300);ctx.closePath();ctx.fill();
    ctx.fillStyle='#222';ctx.font='28px sans-serif';ctx.fillText('A',210,350);ctx.fillText('B',540,350);
    composerTest.blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));})()`);
  const layout=()=>js(`(()=>{
    const r=id=>{const a=$(id).getBoundingClientRect();return {left:a.left,right:a.right,top:a.top,bottom:a.bottom,width:a.width,height:a.height};};
    const video=$('pet'),box=r('pet'),canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;
    const ctx=canvas.getContext('2d');ctx.drawImage(video,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let last=0;outer:for(let y=canvas.height-1;y>=0;y--)for(let x=0;x<canvas.width;x++)if(pixels[(y*canvas.width+x)*4+3]>100){last=y+1;break outer;}
    const fit=Math.min(box.width/canvas.width,box.height/canvas.height),visibleBottom=box.top+(box.height-canvas.height*fit)/2+last*fit;
    return {input:r('quick-message'),form:r('quick-chat'),thumb:r('quick-thumb'),pet:r('pet-hit'),
      visibleBottom,
      scrollWidth:$('quick-message').scrollWidth,clientWidth:$('quick-message').clientWidth,
      width:innerWidth,height:innerHeight,extra:getComputedStyle(document.body).getPropertyValue('--compose-extra'),stageMargin:getComputedStyle($('stage')).marginBottom,side:document.body.dataset.edge,preview:!$('quick-preview').hidden};
  })()`);
  const samples=[];
  try{
    const researched=before.messages.findLast(message=>message.sources?.length);
    if(researched){
      await js('setPanel(true);void 0;');await wait(150);
      const links=await js("Array.from(document.querySelectorAll('.web-sources a'),a=>({url:a.href,target:a.target,rel:a.rel,text:a.textContent}))");
      assert.ok(links.some(link=>link.url===researched.sources[0].url&&link.target==='_blank'&&link.rel.includes('noopener')));
      await writeFile(path.join(output,'web-sources-ui-check.json'),JSON.stringify({at:new Date().toISOString(),completed:true,links:links.filter(link=>researched.sources.some(source=>source.url===link.url))},null,2));
      await js('setPanel(false);void 0;');
    }
    await js("showQuickChat();$('quick-message').focus();void 0;");await wait(150);
    await js("document.querySelector('.composer-trim').decode()");
    const shortForm=(await layout()).form;
    await writeFile(path.join(output,'composer-trim-preview.png'),(await win.webContents.capturePage({x:Math.floor(shortForm.left)-3,y:Math.floor(shortForm.top)-3,width:Math.ceil(shortForm.width)+6,height:Math.ceil(shortForm.height)+6})).toPNG());
    // Paste a real browser File, with no upload during local decoding/preview.
    await js(`const clipboard=new DataTransfer();clipboard.items.add(new File([composerTest.blob],'shapes.png',{type:'image/png'}));
      $('quick-message').dispatchEvent(new ClipboardEvent('paste',{clipboardData:clipboard}));void 0;`);
    for(let i=0;i<50&&await js("$('quick-preview').hidden");i++)await wait(50);
    assert.equal(await js('composerTest.calls.length'),0);
    assert.equal((await layout()).preview,true);assert.equal((await layout()).thumb.width,38);
    await js("$('quick-message').value='输入内容会自动换行，图片只占一个小缩略图的位置。'.repeat(8);$('quick-message').dispatchEvent(new Event('input'));void 0;");
    await wait(300);let page=await layout();assert.equal(page.input.height,90);assert.ok(page.scrollWidth<=page.clientWidth+1);
    assert.ok(page.form.top>=page.visibleBottom+5,'expanded composer must stay below the visible pet: '+JSON.stringify(page));
    const rect=page.form;
    await writeFile(path.join(output,'image-composer-preview.png'),(await win.webContents.capturePage({x:Math.floor(rect.left)-3,y:Math.floor(rect.top)-3,width:Math.ceil(rect.width)+6,height:Math.ceil(rect.height)+6})).toPNG());
    for(const side of [-1,1]){
      clearEdge();const area=screen.getPrimaryDisplay().workArea;
      win.setPosition(side<0?area.x+10:area.x+area.width-win.getBounds().width-10,area.y+100);hideAtEdge();await wait(400);
      await js("showQuickChat();chatComposers.quick.resize();void 0;");await wait(200);page=await layout();
      assert.equal(getEdge().side,side);assert.equal(page.side,String(side));
      assert.ok(page.form.left>=0&&page.form.right<=page.width&&page.form.bottom<=page.height);
      assert.ok(page.form.top>=page.visibleBottom+5,JSON.stringify(page));samples.push({side,...page});
    }
    clearEdge();await wait(100);
    // Failure keeps both draft and image; success sends exactly once and clears them.
    await js("(async()=>{composerTest.fail=true;$('quick-message').value='这两个图形分别是什么颜色？';await chatComposers.quick.submit({preventDefault(){}});})()");
    assert.equal((await layout()).preview,true);assert.equal(await js("$('quick-message').value"),'这两个图形分别是什么颜色？');
    await js("(async()=>{composerTest.fail=false;await chatComposers.quick.submit({preventDefault(){}});})()");
    assert.equal(await js("$('quick-preview').hidden"),true);assert.equal(await js("$('quick-message').value"),'');
    assert.equal(await js('composerTest.calls.length'),2);
    const jpeg=await js('composerTest.calls.at(-1).image.jpeg');
    await writeFile(path.join(output,'image-chat-test-fixture.jpg'),Buffer.from(jpeg,'base64'));
    // Native Enter/Shift+Enter and IME composition in both composers.
    for(const [prefix,id] of [['quick','quick-message'],['chat','chat']]){
      await js(`setPanel(${prefix==='chat'});${prefix==='quick'?'showQuickChat();':''}$('${id}').value='第一行';$('${id}').focus();void 0;`);
      win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter',modifiers:['shift']});
      win.webContents.sendInputEvent({type:'char',keyCode:'\r',modifiers:['shift']});
      win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter',modifiers:['shift']});
      await wait(80);assert.ok((await js(`$('${id}').value`)).includes('\n'));
      const count=await js('composerTest.calls.length');
      await js(`$('${id}').dispatchEvent(new CompositionEvent('compositionstart'));$('${id}').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,cancelable:true}));void 0;`);
      assert.equal(await js('composerTest.calls.length'),count);
      await js(`$('${id}').dispatchEvent(new CompositionEvent('compositionend'));void 0;`);
      win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});
      await wait(120);assert.equal(await js('composerTest.calls.length'),count+1);
    }
    await js(`(async()=>{setPanel(true);const files=new DataTransfer();files.items.add(new File([composerTest.blob],'chosen.png',{type:'image/png'}));
      $('chat-file').files=files.files;await $('chat-file').onchange();})()`);
    assert.equal(await js("$('chat-preview').hidden"),false);
    await js("$('chat-remove').click();void 0;");assert.equal(await js("$('chat-preview').hidden"),true);
  }finally{await js('chatComposers.quick.remove();chatComposers.main.remove();window.fetch=composerTest.fetch;void 0;');}
  const after=await request('/game-companion/state');
  assert.equal(after.sessionId,before.sessionId);assert.equal(after.messages.length,before.messages.length);assert.deepEqual(after.budget,before.budget);
  await writeFile(path.join(output,'composer-check.json'),JSON.stringify({at:new Date().toISOString(),completed:true,samples,
    thumbnail:38,pasteAndFileSelection:true,noUploadBeforeSend:true,failurePreservesDraft:true,enterAndIme:true,
    historyUnchanged:true,scope:'Real Electron composer, native window sizing, paste/file and keyboard events. Chat requests intercepted; provider tested separately.'},null,2));
};
