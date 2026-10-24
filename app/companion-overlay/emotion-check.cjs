const assert = require('node:assert/strict');
const { writeFile } = require('node:fs/promises');
const path = require('node:path');

module.exports = async function({ win, output, request }) {
  const js = code => win.webContents.executeJavaScript(code);
  const before = await request('/game-companion/state');
  assert.equal(before.scheduler.paused, true);
  assert.equal(before.conversationBusy, false);
  const preference = await js("localStorage.getItem('companion-voice')");
  await js(`stopVoice();setPanel(true);document.getElementById('sound-settings').open=true;
    globalThis.emotionAuditionCheck=[];
    const OriginalAudio=window.Audio;
    window.Audio=function(...args){const player=new OriginalAudio(...args);
      player.muted=true;
      const record={preset:globalThis.checkingEmotion,playing:false,ended:false,muted:true};
      emotionAuditionCheck.push(record);
      player.addEventListener('playing',()=>{record.playing=true;record.duration=player.duration;});
      player.addEventListener('ended',()=>{record.ended=true;});
      player.addEventListener('error',()=>{if(!record.ended)record.error=player.error?.code;});
      return player;};void 0;`);
  const layout = await js(`['gentle','happy','tsundere','serious'].map(preset=>{
    const button=document.getElementById('preview-'+preset),r=button.getBoundingClientRect();
    return {preset,label:button.textContent,width:r.width,height:r.height,
      clickable:button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),
      withinWindow:r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight};})`);
  assert.ok(layout.every(button => button.width > 35 && button.clickable && button.withinWindow));
  await writeFile(path.join(output, 'emotional-voice-panel.png'), (await win.webContents.capturePage()).toPNG());
  for (const preset of ['gentle', 'happy', 'tsundere', 'serious']) {
    await js(`globalThis.checkingEmotion=${JSON.stringify(preset)};document.getElementById('preview-'+checkingEmotion).click();void 0;`);
    let result;
    for (let attempt = 0; attempt < 160; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      result = await js('emotionAuditionCheck.at(-1)');
      if (result?.ended || result?.error) break;
    }
    assert.equal(result?.preset, preset);
    assert.equal(result.playing, true);
    assert.equal(result.ended, true);
    assert.ok(result.duration > 2 && result.duration < 20);
    assert.equal(result.error, undefined);
  }
  const after = await request('/game-companion/state');
  assert.equal(after.sessionId, before.sessionId);
  assert.deepEqual(after.messages, before.messages);
  assert.equal(after.budget.requestCount, before.budget.requestCount);
  assert.equal(await js("localStorage.getItem('companion-voice')"), preference);
  await writeFile(path.join(output, 'emotional-voice-check.json'), JSON.stringify({
    completed: true, defaultLabel: '龙华', defaultPreferenceUnchanged: true,
    conversationUnchanged: true, modelRequestsDuringCheck: 0, mutedPlayback: true,
    layout, audio: await js('emotionAuditionCheck'), checkedAt: new Date().toISOString()
  }, null, 2));
};
