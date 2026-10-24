const assert = require('node:assert/strict');
const {writeFile} = require('node:fs/promises');
const path = require('node:path');

module.exports = async function({win, output, request}) {
  const js = code => win.webContents.executeJavaScript(code);
  const before = await request('/game-companion/state');
  assert.equal(before.conversationBusy, false);
  assert.equal(before.scheduler.paused, true);
  await js('voiceEnabled=false;stopVoice();setPanel(true);void 0;');
  async function waitForSession(id, different=false) {
    for(let attempt=0;attempt<60;attempt++) {
      const state=await request('/game-companion/state');
      const matches=different ? state.sessionId!==id : state.sessionId===id;
      if(matches && await js(`state.sessionId===${JSON.stringify(state.sessionId)} && !conversationChanging`)) return state;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    throw new Error('Conversation UI did not finish switching');
  }
  let fresh;
  try {
    await js('document.getElementById("new-conversation").click();void 0;');
    fresh=await waitForSession(before.sessionId,true);
    assert.equal(fresh.messages.length,0);
    assert.equal(fresh.conversations.length,before.conversations.length+1);
    assert.equal(fresh.budget.requestCount,before.budget.requestCount);
    assert.equal(fresh.scheduler.paused,true);
    assert.equal(await js('document.querySelectorAll("#messages article").length'),0);
    const layout=await js(`(()=>{
      const button=document.getElementById('new-conversation'),r=button.getBoundingClientRect();
      const select=document.getElementById('conversation-list'),s=select.getBoundingClientRect();
      return {label:button.textContent,visible:r.width>0&&r.height>0,
        clickable:button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),
        selectWidth:s.width,buttonWidth:r.width,withinPanel:r.right<innerWidth&&s.left>0,
        historyOptions:select.options.length,animations:document.getElementById('pet-action').options.length};
    })()`);
    assert.equal(layout.label,'新对话');
    assert.ok(layout.visible&&layout.clickable&&layout.withinPanel);
    assert.ok(layout.selectWidth>100);
    assert.equal(layout.animations,164);
    await writeFile(path.join(output,'conversation-new.png'),(await win.webContents.capturePage()).toPNG());
    await js(`document.getElementById('conversation-list').value=${JSON.stringify(before.sessionId)};
      document.getElementById('conversation-list').dispatchEvent(new Event('change'));void 0;`);
    const restored=await waitForSession(before.sessionId);
    assert.deepEqual(restored.messages,before.messages);
    assert.equal(restored.budget.requestCount,before.budget.requestCount);
    await writeFile(path.join(output,'conversation-history.png'),(await win.webContents.capturePage()).toPNG());
    await writeFile(path.join(output,'conversations-check.json'),JSON.stringify({completed:true,
      newConversationEmpty:true,historyRestored:true,previousMessages:before.messages.length,
      conversationCount:restored.conversations.length,modelRequestsDuringCheck:0,
      layout,checkedAt:new Date().toISOString()},null,2));
  } finally {
    const current=await request('/game-companion/state');
    if(current.sessionId!==before.sessionId) await request('/game-companion/control',
      {action:'switch-conversation',sessionId:before.sessionId});
  }
};
