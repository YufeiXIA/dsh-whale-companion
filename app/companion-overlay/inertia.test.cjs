const test=require('node:test'),assert=require('node:assert/strict');
const {releaseVelocity,stepInertia}=require('./inertia.cjs');
test('only a fast recent drag starts inertia; waiting before release does not fling',()=>{
  assert.equal(releaseVelocity([{x:0,y:0,t:0},{x:20,y:0,t:100}]),null);
  assert.equal(releaseVelocity([{x:0,y:0,t:0},{x:200,y:0,t:100},{x:200,y:0,t:500}]),null);
  assert.equal(releaseVelocity([{x:0,y:0,t:0},{x:200,y:0,t:100}]).vx,2);
});
test('fling bounces within work area and decays to rest',()=>{
  let state={x:690,y:400,vx:2,vy:1};
  const area={x:0,y:0,width:1000,height:800},size={width:300,height:412};
  state=stepInertia(state,area,size,16);assert.equal(state.bounced,true);assert.ok(state.vx<0);
  for(let i=0;i<400&&!state.done;i++){
    state=stepInertia(state,area,size,16);
    assert.ok(state.x>=0&&state.x<=700&&state.y>=0&&state.y<=388);
  }
  assert.equal(state.done,true);
});
