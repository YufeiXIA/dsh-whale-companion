import assert from 'node:assert/strict';
import test from 'node:test';
import { AmbientCompanion } from '../src/ambient.js';
function fixture(saved) {
  let time=10000000;
  const ambient=new AmbientCompanion(saved,{now:()=>time});
  return {ambient,now:()=>time,advance:ms=>{time+=ms;},sample:(app='code',extra={},blocked=false)=>ambient.sample({available:true,app,idleMs:600000,...extra},{blocked})};
}
test('five-minute cadence survives passive reading, unanswered greetings and direct replies',()=>{
  for(const app of ['documents','media','browser']){
    const f=fixture();f.sample(app);f.advance(299999);assert.equal(f.sample(app),null);
    f.advance(1);let event=f.sample(app);assert.ok(event);
    for(let i=0;i<4;i++){
      f.ambient.attempted(event);const next=f.ambient.nextAt;f.ambient.delivered();assert.equal(f.ambient.nextAt,next);
      f.advance(60000);f.ambient.userInteraction();assert.equal(f.ambient.nextAt,next);
      f.advance(239999);assert.equal(f.sample(app),null);f.advance(1);event=f.sample(app);assert.ok(event);
    }
  }
});
test('frequent app switches do not restart the clock or cancel a captured snapshot',()=>{
  const f=fixture();let event;
  for(let i=0;i<30;i++){f.advance(10000);event=f.sample(i%2?'code':'browser',{contextKey:i});if(i<29)assert.equal(event,null);}
  assert.ok(event);f.ambient.attempted(event);f.advance(10000);f.sample('documents');assert.equal(f.ambient.valid(event),true);
  f.advance(80000);f.sample('documents');assert.equal(f.ambient.valid(event),false);
});
test('lock, stale samples, disable, direct chat and companion focus invalidate pending speech',()=>{
  for(const invalidate of [f=>f.ambient.sample({available:false}),f=>f.advance(26000),f=>f.ambient.configure(false),f=>f.ambient.userInteraction(),f=>f.sample('companion')]){
    const f=fixture();f.advance(300000);const event=f.sample();assert.equal(f.ambient.valid(event),true);invalidate(f);assert.equal(f.ambient.valid(event),false);
  }
});
test('busy cycles coalesce once without catch-up bursts or schedule drift',()=>{
  const f=fixture(),first=f.ambient.nextAt;f.advance(930000);assert.equal(f.sample('code',{},true),null);
  const event=f.sample();assert.ok(event);f.ambient.attempted(event);assert.equal(f.ambient.nextAt,first+900000);assert.equal(f.sample(),null);
});
test('custom period persists and legacy random/backoff deadline migrates',()=>{
  const f=fixture({minMinutes:5,maxMinutes:10,unanswered:8,nextAt:999999999});assert.equal(f.ambient.nextAt-f.now(),300000);
  f.ambient.configure(true,{intervalMinutes:2,visionEnabled:true});assert.equal(f.ambient.nextAt-f.now(),120000);const saved=f.ambient.save();
  for(const intervalMinutes of [0,61,2.5,'5']){assert.throws(()=>f.ambient.configure(true,{intervalMinutes}),/有效周期/);assert.deepEqual(f.ambient.save(),saved);}
  const restored=new AmbientCompanion(saved,{now:f.now});assert.equal(restored.intervalMinutes,2);assert.equal(restored.nextAt,saved.nextAt);assert.equal(restored.visionEnabled,true);
  assert.equal(new AmbientCompanion({visionEnabled:true}).visionEnabled,false);
  f.ambient.configure(true,{visionEnabled:false});assert.equal(f.ambient.nextAt,saved.nextAt);
});
test('each cycle can capture at its configured period, and there is no legacy hourly cap',()=>{
  const f=fixture({intervalMinutes:1,visionOptIn:true});
  for(let i=0;i<15;i++){f.advance(60000);const event=f.sample();assert.ok(event);assert.equal(f.ambient.captureDue(),true);f.ambient.lastCaptureAt=f.now();f.ambient.attempted(event);assert.equal(f.sample(),null);}
  f.ambient.configure(true,{visionEnabled:false});assert.equal(f.ambient.captureDue(),false);
});
test('background cues stay allow-listed, ignore startup apps, and obey their own switch',()=>{
  const f=fixture();f.sample('code',{background:['steam']});f.advance(300000);let event=f.sample('code',{background:['steam']});
  assert.equal(event.openedInBackground,null);f.ambient.attempted(event);
  for(let i=0;i<30;i++){f.advance(10000);event=f.sample('code',{background:['steam','music']});}
  assert.equal(event.openedInBackground,'音乐软件');assert.deepEqual(event.background,['Steam','音乐软件']);
  assert.throws(()=>f.sample('code',{background:['private-title']}),/Invalid/);
  f.ambient.configure(true,{backgroundEnabled:false});event=f.sample('code',{background:['steam']});assert.deepEqual(event.background,[]);
  assert.equal(JSON.stringify(f.ambient.save()).includes('steam'),false);
});
