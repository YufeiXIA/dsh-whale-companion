const test=require('node:test');
const assert=require('node:assert/strict');
const {PassThrough}=require('node:stream');
const {EventEmitter}=require('node:events');
const {createWindowTracker}=require('./window-tracker.cjs');

function fixture(){
  const process=new EventEmitter();process.stdout=new PassThrough();process.stdin=new PassThrough();
  process.kill=()=>process.emit('exit');const commands=[],events=[];
  process.stdin.on('data',chunk=>commands.push(chunk.toString()));
  const tracker=createWindowTracker({root:'test-root',excludeProcessId:42,update:event=>events.push(event),launch:()=>process});
  const emit=event=>process.stdout.write(JSON.stringify(event)+'\n');
  return {tracker,process,commands,events,emit};
}
test('selection correlates fresh requests; background geometry and lifecycle updates remain local',async()=>{
  const f=fixture();const selected=f.tracker.select();
  assert.deepEqual(f.commands,['select 1\n']);
  f.emit({kind:'selected',requestId:99,status:'visible',windowId:'old'});
  const target={kind:'selected',requestId:1,status:'visible',windowId:'17',processId:23,rect:{x:200,y:300,width:500,height:400}};
  f.emit(target);assert.deepEqual(await selected,target);f.tracker.track(target);
  assert.equal(f.commands.at(-1),'track 17 23\n');
  f.emit({kind:'window',status:'visible',windowId:'17',rect:{...target.rect,x:400}});
  f.emit({kind:'window',status:'minimized',windowId:'17'});
  f.emit({kind:'window',status:'closed',windowId:'17'});
  assert.deepEqual(f.events.map(event=>event.status),['visible','minimized','closed']);
  f.tracker.clear();assert.equal(f.commands.at(-1),'clear\n');f.tracker.close();
});
test('helper failure rejects pending selection and reports unavailable instead of silently hanging',async()=>{
  const f=fixture(),selected=f.tracker.select();
  f.process.emit('exit');await assert.rejects(selected,/不可用/);
  assert.deepEqual(f.events,[{status:'unavailable'}]);f.tracker.close();
});
