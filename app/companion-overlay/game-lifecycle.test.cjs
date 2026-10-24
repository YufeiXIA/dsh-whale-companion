const test=require('node:test');
const assert=require('node:assert/strict');
const {createGameLifecycle}=require('./game-lifecycle.cjs');
function fixture(){
  let time=0,result={humanRunning:true,whaleRunning:true},fail=false;
  const calls=[],updates=[];
  const manager=createGameLifecycle({now:()=>time,publish:s=>updates.push(s),
    inspect:async()=>{if(fail)throw new Error('Process inspection failed');return result;},
    pause:async()=>calls.push('pause'),
    stop:async onlyAbsent=>{calls.push(['stop',onlyAbsent]);return {humanRunning:result.humanRunning,whaleRunning:false};}});
  return {manager,calls,updates,set result(value){result=value;},set fail(value){fail=value;},advance(ms){time+=ms;}};
}
test('automatic exit requires sustained human absence, then pauses before stopping only whale',async()=>{
  const f=fixture();f.manager.setAutomatic(true);
  await f.manager.poll();assert.equal(f.calls.length,0);
  f.result={humanRunning:false,whaleRunning:true};await f.manager.poll();
  f.advance(4999);await f.manager.poll();assert.equal(f.calls.length,0);
  f.advance(1);await f.manager.poll();
  assert.deepEqual(f.calls,['pause',['stop',true]]);
  assert.equal(f.manager.snapshot().whaleRunning,false);
});
test('transient disappearance, inspection failure and disabling auto-exit do not quit a game',async()=>{
  const f=fixture();f.manager.setAutomatic(true);f.result={humanRunning:false,whaleRunning:true};await f.manager.poll();
  f.advance(5000);f.fail=true;await f.manager.poll();f.fail=false;
  await f.manager.poll();assert.equal(f.calls.length,0);
  f.result={humanRunning:true,whaleRunning:true};f.advance(5000);await f.manager.poll();
  f.result={humanRunning:false,whaleRunning:true};await f.manager.poll();
  f.manager.setAutomatic(false);f.advance(5000);await f.manager.poll();assert.equal(f.calls.length,0);
});
test('manual exit works while human game stays open and concurrent requests share one stop',async()=>{
  const f=fixture();await Promise.all([f.manager.exitGame(),f.manager.exitGame()]);
  assert.deepEqual(f.calls,['pause',['stop',false]]);
  assert.equal(f.manager.snapshot().humanRunning,true);
});
test('unreachable companion host does not trap the user in a background game',async()=>{
  let stopped=false;
  const manager=createGameLifecycle({inspect:async()=>({}),publish:()=>{},pause:async()=>{throw new Error('Offline');},
    stop:async()=>{stopped=true;return {whaleRunning:false};}});
  await manager.exitGame();assert.equal(stopped,true);
  assert.match(manager.snapshot().message,/未确认暂停/);
});
test('a stale process poll cannot overwrite a completed manual exit',async()=>{
  let complete;
  const manager=createGameLifecycle({publish:()=>{},inspect:()=>new Promise(resolve=>complete=resolve),
    pause:async()=>{},stop:async()=>({humanRunning:true,whaleRunning:false})});
  const polling=manager.poll();await manager.exitGame();
  complete({humanRunning:true,whaleRunning:true});await polling;
  assert.equal(manager.snapshot().whaleRunning,false);
});
