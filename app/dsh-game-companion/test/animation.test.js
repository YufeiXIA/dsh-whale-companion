import {generalGameExpressions,naturalGameExpressions} from '../src/general-game-expressions.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';

const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
const code=html.slice(html.indexOf('function createPetAnimator('),html.indexOf('const petAnimator='));
test('chat topic clips override visual emotion, do not replay, and yield to dragging',()=>{
  let time=100000;
  const video={play:async()=>{}};
  const create=runInNewContext(code+';createPetAnimator');
  const animator=create(video,()=>time,()=>0,()=>{},()=>{},()=>{},['food/eating_rice','companion/racing_turn']);
  const state={scheduler:{paused:true},messages:[]};animator.update(state);video.onended();
  state.messages.push({id:'meal',role:'assistant',animation:'food/eating_rice',emotion:'happy_hop',at:time});
  animator.update(state);assert.match(video.src,/food\/eating_rice/);
  video.onended();animator.update(state);assert.doesNotMatch(video.src,/eating_rice/);
  animator.drag(true);
  state.messages.push({id:'drive',role:'assistant',animation:'companion/racing_turn',at:time});
  animator.update(state);assert.match(video.src,/dragged_in_midair/);
  animator.drag(false);
  state.messages.push({id:'bad',role:'assistant',animation:'../../private',emotion:'shy_surprise',at:time});
  animator.update(state);assert.match(video.src,/clicks\/shy_surprise/);
});
function fixture(){
  let time=100000,plays=0;
  const video={play:async()=>{plays++;}};
  const create=runInNewContext(code+';createPetAnimator');
  const animator=create(video,()=>time,()=>0);
  const state={scheduler:{paused:true},messages:[]};
  animator.update(state);video.onended();
  return {animator,video,state,advance(ms){time+=ms;},get time(){return time;},get plays(){return plays;}};
}

test('fresh expression survives active thinking and a later neutral detail; history never replays',()=>{
  const f=fixture();
  f.state.scheduler.active=true;
  f.state.messages.push({id:'happy',role:'assistant',emotion:'happy_hop',at:f.time});
  f.animator.update(f.state);
  assert.match(f.video.src,/clicks\/happy_hop/);assert.equal(f.video.loop,false);
  f.state.messages.push({id:'detail',role:'assistant',emotion:'neutral',detail:true,at:f.time});
  f.advance(6000);f.animator.update(f.state);
  assert.match(f.video.src,/happy_hop/);
  f.video.onended();assert.match(f.video.src,/work\/deep_thought/);
  f.animator.update(f.state);assert.match(f.video.src,/work\/deep_thought/);
});

test('state animation changes at clip end, not in the middle; input still listens',()=>{
  const f=fixture();
  assert.match(f.video.src,/idle\/breathing/);
  const plays=f.plays;
  f.advance(29000);f.animator.update(f.state);assert.equal(f.plays,plays);
  f.advance(1000);f.animator.update(f.state);assert.match(f.video.src,/breathing/);
  f.video.onended();assert.equal(f.video.loop,false);
  f.state.scheduler.active=true;f.animator.update(f.state);assert.match(f.video.src,/deep_thought/);
  f.advance(20000);f.animator.update(f.state);assert.match(f.video.src,/deep_thought/);
  f.video.onended();assert.equal(f.video.loop,false);
  f.animator.listen(true);assert.match(f.video.src,/attentive_listening/);
  f.animator.listen(false);assert.match(f.video.src,/deep_thought/);
});

test('drag and four touch reactions return to a stable idle; no repeated error reload',()=>{
  const f=fixture(),paths=new Set();
  for(let i=0;i<4;i++){f.animator.touch();paths.add(f.video.src);f.video.onended();}
  assert.equal(paths.size,4);
  f.animator.drag(true);assert.match(f.video.src,/dragged_in_midair/);
  f.animator.drag(false);assert.match(f.video.src,/breathing/);
  f.advance(16000);f.animator.update(f.state);assert.match(f.video.src,/breathing/);
  const plays=f.plays;f.video.onerror();f.video.onerror();assert.equal(f.plays,plays);
});

// The original plugin's clips are checked where companion.config.json says it is installed.
const whalePetPlugin=(()=>{try{return JSON.parse(readFileSync(new URL('../../../companion.config.json',import.meta.url),'utf8')).whalePetPlugin;}catch{return null;}})();
test('all referenced and 164 selectable animations have valid assets',async t=>{
  const automatic=[...new Set([...code.matchAll(/['"]([a-z_]+\/[a-z_]+)['"]/g)].map(m=>m[1]))];
  const paths=[...html.matchAll(/<option value="([a-z_]+\/[a-z_]+)">/g)].map(m=>m[1]);
  assert.equal(paths.length,164);
  assert.equal(new Set(paths).size,164);
  assert.ok(automatic.every(path=>paths.includes(path)));
  if(!whalePetPlugin)t.diagnostic('whalePetPlugin is not configured; only this project\'s clips were checked');
  for(const path of paths){
    if(path.startsWith('companion/'))await readFile(new URL(`../public/animations/${path.slice(10)}.webm`,import.meta.url));
    else if(whalePetPlugin)await readFile(`${whalePetPlugin}/assets/thumb/${path}.webm`);
  }
});

test('a manually selected action plays once and returns to the current state',()=>{
  const f=fixture();
  f.animator.perform('magic/card_magic');
  assert.match(f.video.src,/magic\/card_magic/);assert.equal(f.video.loop,false);
  f.video.onended();assert.match(f.video.src,/idle\/breathing/);
});


test('desktop shuffle plays all 164 once per bag, waits between clips and stops during games or chat',()=>{
  const f=fixture(),paths=[...html.matchAll(/<option value="([a-z_]+\/[a-z_]+)">/g)].map(m=>m[1]);
  f.animator.desktop(true,paths,false,'showcase');f.animator.suspend(false);
  const seen=[];
  for(let i=0;i<paths.length;i++){
    seen.push(f.video.src);
    assert.equal(f.video.loop,false);
    f.video.onended();f.advance(1000);f.animator.tick();assert.match(f.video.src,/idle\/breathing/);
    f.advance(1000);f.animator.tick();
  }
  assert.equal(new Set(seen).size,164);
  assert.notEqual(f.video.src, seen.at(-1));
  f.animator.suspend(true);assert.match(f.video.src,/idle\/breathing/);
  f.advance(2000);f.animator.suspend(false);assert.equal(f.video.loop,false);
  f.state.scheduler.paused=false;f.state.scheduler.active=true;f.animator.update(f.state);
  assert.match(f.video.src,/work\/deep_thought/);
});

test('natural movement plays moving clips and stops on drag, typing and manual actions',()=>{
  let now=0;const movement=[],video={play:async()=>{}};
  const create=runInNewContext(code+';createPetAnimator');
  const a=create(video,()=>now,()=>0.9,moving=>movement.push(moving));
  a.update({scheduler:{paused:true},messages:[]});video.onended();
  a.desktop(true,['daily/big_stretch','magic/card_magic','food/eating_snacks'],true);a.suspend(false);
  assert.match(video.src,/moves\/running_trip/);assert.equal(movement.at(-1),'moves/running_trip');
  a.drag(true);assert.equal(movement.at(-1),false);assert.match(video.src,/dragged_in_midair/);
  a.drag(false);video.onended();now+=2000;a.tick();
  a.listen(true);assert.equal(movement.at(-1),false);assert.match(video.src,/attentive_listening/);
  a.listen(false);a.perform('magic/dove_magic');assert.equal(movement.at(-1),false);
  a.desktop(false,[],false);assert.match(video.src,/idle\/breathing/);
});

test('natural acts exclude event clips; turns persist, same action explicitly restarts',()=>{
  const video={play:async()=>{plays++;}},events=[];
  let plays=0,roll=0.6;
  const a=runInNewContext(code+';createPetAnimator')(video,()=>100000,()=>roll,()=>{},()=>{},()=>events.push('turn'));
  a.update({scheduler:{paused:true},messages:[]});video.onended();
  a.desktop(true,['drag/dragged_in_midair','clicks/happy_hop','moves/crab_walk','magic/card_magic'],true);
  a.suspend(false);assert.match(video.src,/magic\/card_magic/);
  const before=plays;video.currentTime=6;a.perform('magic/card_magic');
  assert.equal(plays,before+1);assert.equal(video.currentTime,0);
  roll=0.35;video.onended();assert.match(video.src,/looking_around/);
  video.onended();assert.deepEqual(events,['turn']);
});

test('showcase never drives movement and fling is cancelled by game activation',()=>{
  const video={play:async()=>{}},movement=[];
  const a=runInNewContext(code+';createPetAnimator')(video,()=>100000,()=>0,m=>movement.push(m));
  const state={scheduler:{paused:true},messages:[]};a.update(state);video.onended();
  a.desktop(true,['moves/target_point_run'],true,'showcase');a.suspend(false);
  assert.match(video.src,/target_point_run/);assert.ok(movement.every(m=>m===false));
  a.fling();assert.match(video.src,/turn_into_ball/);assert.equal(video.currentTime,2);
  state.scheduler.paused=false;state.scheduler.active=true;a.update(state);
  assert.match(video.src,/deep_thought/);
});

test('point movement uses the original run and arrival clips, and game activation cancels it',()=>{
  const events=[],video={play:async()=>{}};
  const create=runInNewContext(code+';createPetAnimator');
  const a=create(video,()=>100000,()=>0,()=>{},status=>events.push(status));
  const state={scheduler:{paused:true},messages:[]};
  a.update(state);a.suspend(false);
  assert.equal(a.pointRun(),true);assert.match(video.src,/target_point_run/);
  assert.equal(events.at(-1),'start');
  a.tick();assert.match(video.src,/target_point_run/);
  video.onended();assert.equal(events.at(-1),'complete');assert.match(video.src,/arrival_wave/);
  a.pointRun();state.scheduler.paused=false;a.update(state);
  assert.equal(events.at(-1),'cancel');assert.equal(a.pointRun(),false);
  state.scheduler.paused=true;a.update(state);a.pointRun();a.suspend(true);
  assert.equal(events.at(-1),'cancel');
});


test('new chat expressions use local assets, play fully, and do not replay old messages',()=>{
  const f=fixture();
  for(const emotion of ['listening_nod','bright_idea','relieved','controller_play','card_strategy','shield_ready','potion_offer','map_route','loot_proud',...Object.keys(generalGameExpressions)]){
    f.state.messages.push({id:emotion,role:'assistant',emotion,at:f.time});
    f.animator.update(f.state);
    assert.equal(f.video.src,`/game-companion/animations/${emotion}.webm`);
    assert.equal(f.video.loop,false);
    f.advance(6000);f.animator.tick();assert.match(f.video.src,new RegExp(emotion));
    f.video.onended();assert.match(f.video.src,/breathing/);
    f.animator.update(f.state);assert.match(f.video.src,/breathing/);
  }
});

test('calm new clips are eligible for the natural chain, without movement',()=>{
  for(const emotion of ['listening_nod','bright_idea','relieved','controller_play','card_strategy',...naturalGameExpressions]){
    const video={play:async()=>{}},movement=[];
    const a=runInNewContext(code+';createPetAnimator')(video,()=>100000,()=>.6,m=>movement.push(m));
    a.update({scheduler:{paused:true},messages:[]});video.onended();
    a.desktop(true,[`companion/${emotion}`],true,'natural');a.suspend(false);
    assert.equal(video.src,`/game-companion/animations/${emotion}.webm`);
    assert.ok(movement.every(m=>m===false));
  }
});

test('contextual game props stay out of natural idle but remain manually playable',()=>{
  const contextual=['shield_ready','potion_offer','map_route','loot_proud',...Object.keys(generalGameExpressions).filter(name=>!naturalGameExpressions.includes(name))];
  for(const emotion of contextual){
    const video={play:async()=>{}};
    const a=runInNewContext(code+';createPetAnimator')(video,()=>100000,()=>.6);
    a.update({scheduler:{paused:true},messages:[]});video.onended();
    a.desktop(true,[...contextual.map(name=>'companion/'+name),'companion/controller_play'],false,'natural');
    a.suspend(false);
    assert.match(video.src,/controller_play/);
    a.perform('companion/'+emotion);
    assert.equal(video.src,`/game-companion/animations/${emotion}.webm`);
    video.onended();
    assert.match(video.src,/controller_play/);
  }
});
