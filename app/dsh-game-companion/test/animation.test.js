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

test('direct semantic replies interrupt both desktop modes and retain their selected action through speech',()=>{
  for(const style of ['natural','showcase']){
    const video={play:async()=>{}},paths=['food/eating_hotpot','music/playing_the_violin','companion/racing_turn'];
    const a=runInNewContext(code+';createPetAnimator')(video,()=>100000,()=>0,()=>{},()=>{},()=>{},paths);
    const state={scheduler:{paused:true,active:false},messages:[]};a.update(state);video.onended();
    a.desktop(true,paths,false,style);a.suspend(false);a.listen(true);
    a.listen(false);state.scheduler.active=true;a.update(state);
    assert.doesNotMatch(video.src,/attentive_listening/);
    for(const [i,animation] of paths.entries()){
      const reply={id:'direct-'+i,role:'assistant',animation,emotion:'listening_nod',tone:'gentle',at:100000};
      state.messages.push(reply);a.update(state);a.speaking(reply);a.tick();
      assert.ok(video.src.endsWith(animation.replace('companion/','')+'.webm'),style+': '+animation);
      assert.equal(video.loop,false);
      a.quiet();video.onended();
    }
    state.scheduler.active=false;a.update(state);
    assert.ok(style==='natural'?/idle\/breathing/.test(video.src):paths.some(id=>video.src.endsWith(id.replace('companion/','')+'.webm')),'return to selected desktop mode');
  }
});

test('edge proactive speech releases its looping pose and resumes varied edge actions after audio ends',()=>{
  const f=fixture();f.animator.edge(1);f.video.onended();
  f.state.messages.push({id:'ambient-neutral',role:'assistant',ambient:true,emotion:'neutral',at:f.time});
  f.animator.update(f.state);f.animator.speaking();
  f.advance(12000);f.animator.quiet();
  assert.equal(f.video.loop,false,'a speech pose must not leave the edge animation looping forever');
  const clips=new Set([f.video.src]);
  for(let i=0;i<4;i++){f.video.onended();clips.add(f.video.src);}
  assert.ok(clips.size>1,'natural edge actions must resume after proactive speech');
});

test('neutral speech varies small gestures for the entire audio while an explicit expression keeps priority',()=>{
  const f=fixture();f.animator.speaking();const clips=new Set();
  for(let i=0;i<4;i++){
    clips.add(f.video.src);assert.equal(f.video.loop,false);
    f.advance(12000);f.video.onended();
  }
  assert.equal(clips.size,4,'long speech must not collapse into one listening loop or time out after 10 seconds');
  f.state.messages.push({id:'expressive',role:'assistant',emotion:'happy_hop',at:f.time});
  f.animator.update(f.state);assert.match(f.video.src,/happy_hop/);
  f.animator.quiet();assert.match(f.video.src,/happy_hop/,'finish the chosen reaction');
  f.video.onended();assert.match(f.video.src,/breathing/);
});

test('text-only proactive poses also release on both screen edges after their reading time',()=>{
  for(const side of [-1,1]){
    const f=fixture();f.animator.edge(side);
    f.state.messages.push({id:'silent',role:'assistant',ambient:true,emotion:'neutral',at:f.time});
    f.animator.update(f.state);f.advance(7000);f.animator.tick();
    assert.equal(f.video.loop,false);const before=f.video.src;
    f.video.onended();assert.notEqual(f.video.src,before);
  }
});

test('speech continues with tone and topic appropriate clips instead of the same neutral pool',()=>{
  const cases=[
    [{tone:'serious'},/taking_notes|manual_scroll|hold_thought|listening_nod/,4],
    [{tone:'comforting'},/care_disguised|reluctant_pillow|casual_closer|listening_nod/,4],
    [{tone:'happy'},/happy_hop|gentle_spin|casual_closer|whale_bubbles/,4],
    [{animation:'food/eating_rice'},/rice_share|hold_thought|casual_closer/,3],
    [{animation:'companion/card_strategy'},/controller_play|card_strategy|manual_scroll|hold_thought/,4],
    [{tone:'sad'},/listening_nod|casual_closer|hold_thought/,3],
    [{tone:'neutral'},/listening_nod|looking_around|casual_closer|hold_thought|sneaky_glance|attentive_listening/,6]
  ];
  for(const [message,expected,count] of cases){
    const f=fixture(),clips=[];f.animator.speaking(message);
    for(let i=0;i<count*2;i++){clips.push(f.video.src);assert.match(f.video.src,expected);assert.equal(f.video.loop,false);f.video.onended();}
    assert.equal(new Set(clips.slice(0,count)).size,count);
    for(let i=1;i<clips.length;i++)assert.notEqual(clips[i],clips[i-1]);
    f.animator.quiet();assert.match(f.video.src,/breathing/);
  }
});

test('repeated generic expressions vary while an explicit topic animation keeps priority',()=>{
  const f=fixture();let previous='';
  for(let i=0;i<12;i++){
    f.state.messages.push({id:'reply-'+i,role:'assistant',emotion:'listening_nod',at:f.time});f.animator.update(f.state);
    assert.notEqual(f.video.src,previous);previous=f.video.src;f.video.onended();
  }
});

test('speech on both edges only uses half-body clips, including the first expressive reply',()=>{
  for(const side of [-1,1])for(const tone of ['happy','serious','comforting','shy','sleepy']){
    const f=fixture();f.animator.edge(side);
    f.state.messages.push({id:'reply',role:'assistant',tone,emotion:'happy_hop',at:f.time});f.animator.update(f.state);f.animator.speaking({tone});
    for(let i=0;i<8;i++){
      assert.doesNotMatch(f.video.src,/happy_hop|gentle_spin|taking_notes|reluctant_pillow|moves\//);
      assert.equal(f.video.loop,false);f.video.onended();
    }
  }
});

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
  f.animator.listen(true);assert.doesNotMatch(f.video.src,/attentive_listening/,'typing cannot mask a pending reply');
  f.state.scheduler.active=false;f.animator.update(f.state);assert.match(f.video.src,/attentive_listening/);
  f.animator.listen(false);assert.equal(f.video.loop,false);
  const resumed=f.video.src;f.video.onended();assert.notEqual(f.video.src,resumed);
});

test('thinking shuffles all seven clips across short replies and long waits, with no consecutive repeats',()=>{
  const f=fixture(),clips=[];
  for(let i=0;i<14;i++){
    f.state.scheduler.active=true;f.animator.update(f.state);clips.push(f.video.src);
    const plays=f.plays;f.animator.tick();assert.equal(f.plays,plays,'polling must not restart the current clip');
    assert.equal(f.video.loop,false);
    if(i<7){f.state.scheduler.active=false;f.animator.update(f.state);}else f.video.onended();
  }
  assert.equal(new Set(clips.slice(0,7)).size,7);assert.equal(new Set(clips.slice(7)).size,7);
  for(let i=1;i<clips.length;i++)assert.notEqual(clips[i],clips[i-1]);
  f.animator.speaking();assert.match(f.video.src,/listening_nod|looking_around|casual_closer|hold_thought/);
  f.animator.drag(true);assert.match(f.video.src,/dragged_in_midair/);
});

test('thinking on either edge rotates four small clips and never starts roaming or turn movement',()=>{
  for(const side of [-1,1]){
    const movement=[],turns=[],video={play:async()=>{}};
    const a=runInNewContext(code+';createPetAnimator')(video,()=>100000,()=>0,m=>movement.push(m),()=>{},()=>turns.push(true));
    const state={scheduler:{paused:true,active:false},messages:[]};a.update(state);video.onended();a.edge(side);
    state.scheduler.active=true;a.update(state);const clips=[];
    for(let i=0;i<8;i++){clips.push(video.src);assert.equal(video.loop,false);video.onended();}
    assert.equal(new Set(clips.slice(0,4)).size,4);
    assert.ok(clips.every(clip=>/manual_scroll|hold_thought|attentive_listening|looking_around/.test(clip)));
    assert.ok(movement.every(m=>m===false));assert.equal(turns.length,0);
    state.scheduler.active=false;a.update(state);video.onended();assert.equal(video.loop,false);
  }
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
  const modeOnly=['companion/sleep_loop'];
  assert.ok(automatic.every(path=>paths.includes(path)||modeOnly.includes(path)));
  if(!whalePetPlugin)t.diagnostic('whalePetPlugin is not configured; only this project\'s clips were checked');
  for(const path of [...paths,...modeOnly]){
    if(path.startsWith('companion/'))await readFile(new URL(`../public/animations/${path.slice(10)}.webm`,import.meta.url));
    else if(whalePetPlugin)await readFile(`${whalePetPlugin}/assets/thumb/${path}.webm`);
  }
});

test('sleep mode keeps one seamless clip through chat, touch, drag, desktop changes and repeated loops until explicitly woken',()=>{
  const f=fixture();
  f.animator.sleep(true);const sleep=f.video.src;
  assert.match(sleep,/sleep_loop.webm$/);assert.equal(f.video.loop,true);
  const started=f.plays;
  f.animator.suspend(false);f.animator.desktop(true,['moves/crab_walk'],true,'showcase');
  f.animator.listen(true);f.animator.speaking();f.animator.touch();
  f.animator.drag(true);f.animator.drag(false);f.animator.fling();f.animator.settle();
  f.animator.perform('clicks/happy_hop');f.animator.edge(1);
  f.state.scheduler.active=true;
  f.state.messages.push({id:'asleep-chat',role:'assistant',animation:'clicks/happy_hop',emotion:'happy_hop',at:f.time});
  f.animator.update(f.state);f.animator.tick();
  assert.equal(f.animator.pointRun(),false);assert.equal(f.video.src,sleep);assert.equal(f.video.loop,true);
  assert.equal(f.plays,started,'events must not restart the sleeping loop');
  for(let i=0;i<5;i++){f.advance(6000);f.video.onended();assert.equal(f.video.src,sleep);assert.equal(f.video.loop,true);}
  f.state.scheduler.active=false;f.animator.sleep(false);assert.notEqual(f.video.src,sleep);
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

test('natural daily actions cover a complete shuffled round without repeats or event-only reactions',()=>{
  const paths=[...html.matchAll(/<option value="([a-z_]+\/[a-z_]+)">/g)].map(m=>m[1]);
  const video={play:async()=>{}};
  const a=runInNewContext(code+';createPetAnimator')(video,()=>100000,()=>.6);
  a.update({scheduler:{paused:true},messages:[]});video.onended();a.desktop(true,paths,false);a.suspend(false);
  const count=a.naturalCount(),seen=[];
  assert.ok(count>=90);
  for(let i=0;i<count;i++){seen.push(video.src);video.onended();}
  assert.equal(new Set(seen).size,count);assert.notEqual(video.src,seen.at(-1));
  assert.ok(seen.some(src=>src.includes('casual_closer')));assert.ok(seen.some(src=>src.includes('flourish_retry')));
  assert.ok(seen.every(src=>!/(victory|defeat|low_battery|come_reluctantly|dragged_in_midair|happy_hop)/.test(src)));
});

test('calm, night and edge each rotate suitable actions while edge keeps native movement stopped',()=>{
  for(const [kind,count] of [['calm',14],['night',8],['edge',22]]){
    const video={play:async()=>{}},moves=[];
    const a=runInNewContext(code+';createPetAnimator')(video,()=>100000,()=>.1,m=>moves.push(m));
    a.update({scheduler:{paused:true},messages:[]});video.onended();
    a.desktop(true,['daily/big_stretch'],true);a.mood(kind==='night',kind==='calm');
    if(kind==='edge')a.edge(1);
    a.suspend(false);if(kind==='edge')video.onended();const seen=[];
    for(let i=0;i<count;i++){seen.push(video.src);video.onended();}
    assert.equal(new Set(seen).size,count,kind+' should not repeat before exhausting its pool');
    assert.ok(moves.every(value=>value===false));
    a.drag(true);assert.match(video.src,/dragged_in_midair/);
  }
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

test('natural movement keeps six percent cursor approaches and raises independent roaming to eighteen percent',()=>{
  // Inspect choices at each probability bucket without counting video frame ticks as new rolls.
  const create=runInNewContext(code.replace('tick:render','tick:render, nextDesktopClip')+';createPetAnimator');
  let roll=.5,first=false;
  const a=create({play:async()=>{}},()=>0,()=>first?(first=false,roll):.5);
  a.desktop(true,['magic/card_magic'],true,'natural');
  const counts={cursor:0,wander:0,other:0};
  for(let i=0;i<1000;i++){
    roll=(i+.5)/1000;first=true;const clip=a.nextDesktopClip();
    counts[clip==='moves/target_point_run'?'cursor':clip.startsWith('moves/')?'wander':'other']++;
  }
  assert.deepEqual(counts,{cursor:60,wander:180,other:760});
  a.desktop(true,['magic/card_magic'],true,'natural',false);
  const off={cursor:0,wander:0,other:0};
  for(let i=0;i<1000;i++){
    roll=(i+.5)/1000;first=true;const clip=a.nextDesktopClip();
    off[clip==='moves/target_point_run'?'cursor':clip.startsWith('moves/')?'wander':'other']++;
  }
  assert.deepEqual(off,{cursor:60,wander:0,other:940},'random roaming off preserves cursor approaches');
  a.desktop(true,['magic/card_magic'],false,'natural');
  roll=.99;first=true;assert.equal(a.nextDesktopClip(),'magic/card_magic');
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
  roll=0.16;video.onended();assert.match(video.src,/breathing/);
  video.onended();assert.match(video.src,/looking_around/);
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

test('point commands interrupt an unfinished action and retain the complete run introduction',()=>{
  const starts=[],events=[];
  const video={start:(src,loop,ready,seek)=>starts.push({src,loop,ready,seek})};
  const a=runInNewContext(code+';createPetAnimator')(video,()=>100000,()=>0,()=>{},event=>events.push(event));
  a.update({scheduler:{paused:true},messages:[]});a.suspend(false);
  a.perform('magic/card_magic');
  assert.equal(a.pointRun(),true);
  assert.match(starts.at(-1).src,/target_point_run/,'do not wait for the unfinished magic animation');
  assert.equal(starts.at(-1).seek,0,'play the requested run from its first frame, including preparation');
  starts.at(-1).ready();assert.equal(events.at(-1),'start');
  a.finishPoint();assert.equal(events.at(-1),'complete');assert.match(starts.at(-1).src,/arrival_wave/);
  a.finishPoint();assert.equal(events.filter(event=>event==='complete').length,1);
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

test('edge reveal events only change the lean and never insert a full surprise action',()=>{
  const listener=html.slice(html.indexOf("window.addEventListener('companion-peek'"),html.indexOf('// Messages never move'));
  const f=fixture();f.animator.edge(-1);const clip=f.video.src,plays=f.plays;
  let onPeek,lean=false;
  runInNewContext(listener,{window:{addEventListener:(_name,handler)=>{onPeek=handler;}},petAnimator:f.animator,
    $:()=>({classList:{toggle:(_name,value)=>{lean=value;},contains:()=>false}})});
  onPeek({detail:'1'});assert.equal(lean,true);
  onPeek({detail:'0'});assert.equal(lean,false);
  assert.equal(f.video.src,clip);assert.equal(f.plays,plays);
  assert.ok(!f.video.src.includes('shy_surprise'));
});
