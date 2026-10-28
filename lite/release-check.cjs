const assert = require('node:assert/strict');
const { writeFile } = require('node:fs/promises');
const path = require('node:path');

// Runs inside the packaged application against fresh local state, without model keys.
module.exports = async function releaseCheck({ win, output, standalone = true, macNative = null }) {
  if(process.platform==='darwin')for(const [key,value] of Object.entries(macNative))assert.equal(value,true,key);
  await win.webContents.executeJavaScript('initialState.then(()=>undefined)');
  await win.webContents.executeJavaScript('startDesktop().then(()=>undefined)');
  const view = await win.webContents.executeJavaScript(`({
    lite, ready:state.lite?.ready??false, paused:state.scheduler.paused, settingsOpen:document.getElementById('model-settings').open,
    settingsInsideBar:document.querySelector('.settings').contains(document.getElementById('model-settings')),
    gameHidden:['technical','resume','pause'].every(id=>getComputedStyle(document.getElementById(id)).display==='none'),
    voiceHidden:document.getElementById('voice-choice').hidden,
    macPermissionUI:!document.getElementById('mac-permissions').hidden,
    nodeExposed:typeof window.require!=='undefined',
    uniqueIds:new Set([...document.querySelectorAll('[id]')].map(el=>el.id)).size===document.querySelectorAll('[id]').length
  })`);
  assert.equal(view.lite, standalone); assert.equal(view.ready, false);assert.equal(view.paused,true);
  for (const key of ['settingsInsideBar','uniqueIds']) assert.equal(view[key],true,key);
  for (const key of ['settingsOpen','gameHidden','voiceHidden']) assert.equal(view[key],standalone,key);
  assert.equal(view.nodeExposed,false);
  assert.equal(view.macPermissionUI,process.platform==='darwin');
  const assets = await win.webContents.executeJavaScript(`Promise.all([
    '/game-companion/touch-interactions.js','/game-companion/pcm-player.js',
    '/game-companion/art/composer-trim.svg','/game-companion/touch-voices/head-0.wav',
    '/game-companion/animations/sleep_loop.webm','/whale-pet/daily/sleepy_yawn.webm'
  ].map(async url=>{const response=await fetch(url);return {url,status:response.status,bytes:(await response.arrayBuffer()).byteLength};}))`);
  for(const asset of assets){assert.equal(asset.status,200,asset.url);assert.ok(asset.bytes>100,asset.url);}
  await win.webContents.executeJavaScript('setPanel(false);setSleep(true).then(()=>undefined)');
  await new Promise(resolve=>setTimeout(resolve,1800));
  const sleep=await win.webContents.executeJavaScript(`({sleeping,clip:document.getElementById('pet').getAttribute('src'),
    decoded:document.getElementById('pet').getVideoPlaybackQuality().totalVideoFrames})`);
  assert.equal(sleep.sleeping,true);assert.match(sleep.clip,/sleep_loop.webm/);assert.ok(sleep.decoded>0);
  await win.webContents.executeJavaScript('setSleep(false).then(()=>undefined)');
  await writeFile(path.join(output,'release-check.png'),(await win.webContents.capturePage()).toPNG());
  await writeFile(path.join(output,'release-check.json'),JSON.stringify({checkedAt:new Date().toISOString(),macNative,view,assets,sleep},null,2));
};
