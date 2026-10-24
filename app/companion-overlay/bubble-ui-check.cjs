const { writeFile } = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

// Inspect the real desktop window, without sending chat or changing host state.
module.exports = async function ({ win, output, request }) {
  await win.webContents.executeJavaScript('initialState.then(()=>undefined)');
  await win.webContents.executeJavaScript(`(()=>{
    const message=state.messages.findLast(m=>m.role==='assistant'&&m.text);
    if(message)showBubble(message.text,message.id);
  })()`);
  await new Promise(resolve => setTimeout(resolve, 1600));
  const ui = await win.webContents.executeJavaScript(`(()=>{
    const body=document.querySelector('.whale-body'),style=getComputedStyle(body);
    const bubble=document.getElementById('speech-bubble'),r=bubble.getBoundingClientRect();
    return {frameColor:style.borderTopColor,border:style.borderTopWidth,lowerBand:style.borderBottomWidth,
      embroidery:!!document.querySelector('.whale-embroidery'),bow:!!document.querySelector('.whale-ribbon'),
      visible:getComputedStyle(bubble).opacity==='1',compact:document.body.classList.contains('compact'),
      playing:!document.getElementById('pet').paused,
      bubble:{x:r.x,y:r.y,width:r.width,height:r.height}};
  })()`);
  assert.equal(ui.frameColor, 'rgb(183, 201, 226)');
  assert.equal(ui.border, '1px');
  assert.equal(ui.lowerBand, '1px');
  assert.ok(!ui.embroidery && !ui.bow && ui.compact && ui.playing);
  const state = await request('/game-companion/state');
  await writeFile(path.join(output, 'bubble-ui-restored-live.png'), (await win.webContents.capturePage()).toPNG());
  await writeFile(path.join(output, 'bubble-ui-restored-live.json'), JSON.stringify({completed:true,
    pid:process.pid,checkedAt:new Date().toISOString(),ui,sessionId:state.sessionId,
    messageIds:state.messages.map(m=>m.id),budget:state.budget,paused:state.scheduler.paused}, null, 2));
};
