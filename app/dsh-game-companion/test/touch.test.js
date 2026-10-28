import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import touches from '../public/touch-interactions.cjs';

test('seven body regions select different lines without immediate repetition and ship matching WAVs',async()=>{
  assert.deepEqual([[.5,.1],[.1,.3],[.5,.4],[.1,.6],[.5,.65],[.1,.9],[.5,.94]].map(([x,y])=>touches.regionAt(x,y)),
    ['head','ear','cheek','hand','belly','tail','feet']);
  const manifest=JSON.parse(await readFile(new URL('../public/touch-voices/manifest.json',import.meta.url)));
  assert.equal(manifest.clips.length,21);
  for(const [region,{lines,delivery}] of Object.entries(touches.regions)){
    let previous;
    for(let i=0;i<9;i++){const next=touches.choose(region,previous,()=>.5);assert.notEqual(next,previous);previous=next;}
    for(const [index,text] of lines.entries()){
      const clip=manifest.clips.find(item=>item.id===`${region}-${index}`);
      assert.equal(clip.text,text);assert.equal(clip.delivery,delivery);
      const bytes=await readFile(new URL(`../public/touch-voices/${clip.file}`,import.meta.url));
      assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WAVE');
      assert.ok(bytes.length>24000);
    }
  }
});

test('single clicks use body coordinates and only the dedicated button opens the panel',async()=>{
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8'),elements=new Map();
  const calls=[],panels=[];
  const context={$:id=>{if(!elements.has(id))elements.set(id,{getBoundingClientRect:()=>({left:20,top:30,width:130,height:150})});return elements.get(id);},
    CompanionTouches:touches,touchPet:region=>calls.push(region),setPanel:open=>panels.push(open)};
  runInNewContext(html.slice(html.indexOf("$('quick-panel').onclick"),html.indexOf("$('hide-panel').onclick")),context);
  for(const [x,y] of [[.5,.1],[.1,.3],[.5,.4],[.1,.6],[.5,.65],[.1,.9],[.5,.94]])elements.get('pet-hit').onclick({detail:1,clientX:20+x*130,clientY:30+y*150});
  assert.deepEqual(calls,['head','ear','cheek','hand','belly','tail','feet']);assert.deepEqual(panels,[]);
  elements.get('quick-panel').onclick();assert.deepEqual(panels,[true]);
});

test('touch speech is local, obeys mute and busy state, replaces rather than queues audio, and stops on drag',async()=>{
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  let now=100000,quiet=false;const bubbles=[],players=[],listeners=new Map(),elements=new Map();
  const context={lite:false,sleeping:false,Date:{now:()=>now},CompanionTouches:touches,state:{scheduler:{active:false}},AbortController,
    localStorage:{getItem:()=> 'on'},$:id=>{if(!elements.has(id))elements.set(id,{value:'.8',addEventListener(){}});return elements.get(id);},
    petAnimator:{perform(){},quiet(){}},showBubble:text=>bubbles.push(text),quietActive:()=>quiet,
    bubbleVoiceId:null,bubbleMessageId:null,bubbleTimer:null,bubbleDeadline:0,scheduleBubbleFade(){},clearTimeout(){},setTimeout(){},
    URL:{revokeObjectURL(){}},window:{addEventListener:(name,fn)=>listeners.set(name,fn)},
    fetch(){throw Error('Touch must not call a remote model or voice API');},
    Audio:class{constructor(url){this.url=url;players.push(this);}async play(){this.played=true;}pause(){this.paused=true;}}};
  runInNewContext(html.slice(html.indexOf('let voiceEnabled='),html.indexOf('async function speak(')),context);
  await context.touchPet('head');assert.equal(players.length,1);assert.match(players[0].url,/^\/game-companion\/touch-voices\/head-/);
  await context.touchPet('belly');assert.equal(players.length,1,'rapid taps are not queued');
  now+=1300;await context.touchPet('tail');assert.equal(players[0].paused,true);assert.equal(players.length,2);
  listeners.get('companion-drag')({detail:true});assert.equal(players[1].paused,true);
  now+=1300;runInNewContext('voiceEnabled=false',context);await context.touchPet('hand');assert.equal(players.length,2);assert.equal(bubbles.length,3);
  now+=1300;runInNewContext('voiceEnabled=true',context);quiet=true;await context.touchPet('cheek');assert.equal(players.length,2);
  now+=1300;quiet=false;context.state.scheduler.active=true;await context.touchPet('head');assert.equal(bubbles.length,4);
  context.state.scheduler.active=false;runInNewContext('voiceRequest=new AbortController()',context);await context.touchPet('head');assert.equal(players.length,2);
});
