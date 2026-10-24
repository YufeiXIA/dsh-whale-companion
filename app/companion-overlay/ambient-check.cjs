const assert = require('node:assert/strict');
const { writeFile } = require('node:fs/promises');
const path = require('node:path');

module.exports = async function ({ win, output, request, setClickThrough, nativeState }) {
  const before = await request('/game-companion/state');
  assert.equal(before.scheduler.paused, true);
  const initial = await win.webContents.executeJavaScript(`(()=>{
    document.getElementById('pet-hit').click();
    const option=document.getElementById('ambient-enabled');
    return {checked:option.checked,voice:localStorage.getItem('companion-voice'),
      text:document.getElementById('ambient-options').textContent,nodeExposed:typeof window.require!=='undefined'};
  })()`);
  assert.equal(initial.checked, before.ambient.enabled);
  assert.equal(initial.nodeExposed, false);
  assert.match(initial.text, /偶尔找我聊聊/);
  const originalClickThrough=nativeState().clickThrough;
  async function toggle(enabled) {
    await win.webContents.executeJavaScript(`(()=>{const option=document.getElementById('ambient-enabled');option.checked=${enabled};option.dispatchEvent(new Event('change'));})()`);
    for (let i = 0; i < 50; i++) {
      const current = await request('/game-companion/state');
      if (current.ambient.enabled === enabled) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Ambient checkbox did not update the host');
  }
  try {
    await toggle(false); await toggle(true);
    await win.webContents.executeJavaScript(`document.getElementById('ambient-frequency').value='2,5';document.getElementById('ambient-frequency').dispatchEvent(new Event('change'));void 0;`);
    for(let i=0;i<40;i++){
      if((await request('/game-companion/state')).ambient.minMinutes===2)break;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.equal((await request('/game-companion/state')).ambient.maxMinutes,5);
    const ui = await win.webContents.executeJavaScript(`(()=>{
      document.getElementById('companion-settings').open=true;
      const r=document.getElementById('ambient-options').getBoundingClientRect();
      return {width:r.width,top:r.top,bottom:r.bottom,voice:localStorage.getItem('companion-voice'),
        settingsWidths:[...document.querySelectorAll('.settings>details')].map(element=>element.getBoundingClientRect().width),
        playing:document.getElementById('pet').readyState>=2,chat:!!document.getElementById('chat'),
        gameControls:!!document.getElementById('resume')&&!!document.getElementById('pause')};
    })()`);
    assert.ok(ui.width > 200 && ui.top >= 0 && ui.bottom < win.getBounds().height);
    assert.equal(ui.voice, initial.voice); assert.equal(ui.playing, true);
    assert.equal(ui.chat, true); assert.equal(ui.gameControls, true);
    assert.ok(ui.settingsWidths.every(width=>width>60),'Settings tabs must retain usable width');
    await writeFile(path.join(output, 'ambient-panel-preview.png'), (await win.webContents.capturePage()).toPNG());
    const after = await request('/game-companion/state');
    assert.ok(JSON.stringify(after.messages)===JSON.stringify(before.messages),'Existing chat must remain unchanged');
    assert.ok(JSON.stringify(after.budget)===JSON.stringify(before.budget),'Existing budget must remain unchanged');
    await win.webContents.executeJavaScript(`document.getElementById('companion-settings').open=false;setPanel(false);void 0;`);
    await new Promise(resolve=>setTimeout(resolve,100));
    const petPoint=await win.webContents.executeJavaScript(`(()=>{const r=document.getElementById('pet-hit').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);
    win.webContents.sendInputEvent({type:'mouseMove',...petPoint});
    await new Promise(resolve=>setTimeout(resolve,400));
    const quick=await win.webContents.executeJavaScript(`(()=>{
      const form=document.getElementById('quick-chat'),r=form.getBoundingClientRect();
      return {open:document.body.classList.contains('quick-chat-open'),compact:document.body.classList.contains('compact'),
        width:r.width,bottom:r.bottom,opacity:getComputedStyle(form).opacity,inert:form.inert};
    })()`);
    assert.equal(quick.open,true);assert.equal(quick.compact,true);assert.equal(quick.inert,false);
    assert.ok(quick.width>=250&&quick.bottom<=win.getBounds().height);
    await writeFile(path.join(output,'quick-chat-preview.png'),(await win.webContents.capturePage()).toPNG());
    // Exercise actual native focus/click-through without sending calibration text to the user's chat.
    const rect=await win.webContents.executeJavaScript(`(()=>{const r=document.getElementById('quick-message').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);
    setClickThrough(true);
    win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...rect});
    win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...rect});
    await new Promise(resolve=>setTimeout(resolve,150));
    assert.equal(await win.webContents.executeJavaScript("document.activeElement?.id"),'quick-message');
    assert.equal(nativeState().clickThrough,false,'Clicking the input temporarily enables native interaction');
    const delivery=await win.webContents.executeJavaScript(`(async()=>{
      const original=window.fetch,sent=[];
      window.fetch=(url,options)=>{
        if(url==='/game-companion/control'&&JSON.parse(options.body).action==='chat'){
          sent.push(JSON.parse(options.body));return Promise.resolve(new Response(JSON.stringify(state)));
        }return original(url,options);
      };
      try{
        const input=document.getElementById('quick-message'),form=document.getElementById('quick-chat');input.value='中文输入法测试';
        input.dispatchEvent(new CompositionEvent('compositionstart'));await form.onsubmit({preventDefault(){}});
        const during=sent.length;input.dispatchEvent(new CompositionEvent('compositionend'));await form.onsubmit({preventDefault(){}});
        return {during,sent:sent.length,text:sent[0]?.text,empty:input.value==='',compact:document.body.classList.contains('compact'),hidden:!document.body.classList.contains('quick-chat-open')};
      }finally{window.fetch=original;}
    })()`);
    assert.deepEqual(delivery,{during:0,sent:1,text:'中文输入法测试',empty:true,compact:true,hidden:true});
    await new Promise(resolve=>setTimeout(resolve,100));
    assert.equal(nativeState().clickThrough,true,'Sending restores the previous click-through choice');
    await writeFile(path.join(output, 'ambient-ui-check.json'), JSON.stringify({ completed:true, initial, ui,quick,delivery,
      messagesPreserved:true, budgetPreserved:true, at:new Date().toISOString() }, null, 2));
  } finally {
    setClickThrough(originalClickThrough);
    await request('/game-companion/control', {action:'ambient-settings',enabled:before.ambient.enabled,
      minMinutes:before.ambient.minMinutes,maxMinutes:before.ambient.maxMinutes,visionEnabled:before.ambient.visionEnabled});
  }
};
