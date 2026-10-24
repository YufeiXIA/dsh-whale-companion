const assert=require('node:assert/strict');
const {writeFile}=require('node:fs/promises');
const path=require('node:path');

// Native check of the edge behaviour: tuck and peek, step out to talk, tuck again, pop out on hover.
module.exports=async function({win,output,hideAtEdge,getEdge,getTucked,hover}){
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const js=code=>win.webContents.executeJavaScript(code);
  async function waitFor(check,label){for(let i=0;i<120;i++){if(await check())return;await sleep(100);}throw Error('Edge check timed out: '+label);}
  const shot=async name=>writeFile(path.join(output,name),(await win.webContents.capturePage()).toPNG());
  const page=()=>js(`({clip:document.body.style.clipPath,peeking:document.getElementById('stage').classList.contains('peeking'),
    src:document.getElementById('pet').getAttribute('src'),bubbleLeft:document.getElementById('speech-bubble').style.left,
    bubbleWidth:document.getElementById('speech-bubble').getBoundingClientRect().width,
    bubbleX:document.getElementById('speech-bubble').getBoundingClientRect().left,width:document.body.clientWidth})`);
  await js('setPanel(false);petAnimator.desktop(false,[],false);void 0;');
  await sleep(200);
  hideAtEdge();
  const edge=getEdge();
  assert.ok(edge,'the tray shortcut finds an edge');
  await waitFor(()=>getTucked()&&win.getBounds().x===edge.peekX,'tucked');
  await sleep(400);
  const tucked=await page();
  assert.ok(tucked.clip.startsWith('inset('),'the part past the edge is clipped');
  assert.ok(tucked.peeking,'tucked state leans in');
  assert.match(tucked.src,/sneaky_glance|looking_around|attentive_listening|waiting_denial|listening_nod|casual_closer|tense_watch|praise_hidden_joy|hold_thought|bright_idea|relieved|breathing|whale_bubbles/);
  await shot('edge-tucked.png');
  await js("showBubble('我在边上看着你呢，有事叫我。');void 0;");
  await waitFor(()=>win.getBounds().x===edge.outX,'stepped out to talk');
  await sleep(300);
  const talking=await page();
  assert.equal(getTucked(),false);
  assert.ok(talking.bubbleX>=0&&talking.bubbleX+talking.bubbleWidth<=talking.width,'the bubble fits inside the window');
  await shot('edge-talking.png');
  await js('setBubbleVisible(false);void 0;');
  await waitFor(()=>getTucked()&&win.getBounds().x===edge.peekX,'tucked again after talking');
  hover(true);
  await waitFor(()=>!getTucked()&&win.getBounds().x===edge.snapX,'pops out on hover');
  await waitFor(()=>js("document.getElementById('pet').getAttribute('src').includes('shy_surprise')"),'caught peeking');
  const hovered=await page();
  await shot('edge-hovered.png');
  hover(false);
  await writeFile(path.join(output,'edge-check.json'),JSON.stringify({completed:true,edge,tucked,talking,hovered,
    note:'Real Electron window and IPC; hover is simulated in the main process.'},null,2));
};
