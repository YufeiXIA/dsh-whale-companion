const test=require('node:test');
const assert=require('node:assert/strict');
const {feetOffset,floorY,strollRoute,perchRoute,perchLost,stepFall,createHealthClock}=require('./desktop-life.cjs');

const area={x:0,y:0,width:1920,height:1040},bounds={x:900,y:300,width:300,height:473};

test('taskbar strolls stay on the floor and turn back at the screen edge',()=>{
  const route=strollRoute(bounds,area,1,()=>0.5);
  assert.equal(route.kind,'point');assert.equal(route.targetY,floorY(area,bounds.height,1));
  assert.equal(route.target,bounds.x+180);
  assert.equal(route.targetY+bounds.height-feetOffset(1),area.height-4);
  const atEdge=strollRoute({...bounds,x:area.width-bounds.width},area,1,()=>0.5);
  assert.equal(atEdge.direction,-1);
});

test('she perches on a window top edge, never on a maximised one',()=>{
  const display={x:0,y:0,width:1920,height:1080};
  const route=perchRoute(bounds,{x:200,y:400,width:800,height:500},display);
  assert.equal(route.targetY+bounds.height-feetOffset(1),406);
  assert.ok(route.target+bounds.width/2<=1000-80&&route.target+bounds.width/2>=280);
  assert.equal(perchRoute(bounds,{x:-8,y:-8,width:1936,height:1048},display),null);
  assert.equal(perchRoute(bounds,{x:200,y:400,width:120,height:500},display),null);
});

test('a perch is lost only when its window, back in front, moved or was minimised',()=>{
  const perch={windowId:'7',rect:{x:200,y:400,width:800,height:500}};
  assert.equal(perchLost(perch,{available:true,windowId:'9',rect:{x:0,y:0,width:10,height:10}}),false);
  assert.equal(perchLost(perch,{available:true,windowId:'7',rect:{x:202,y:401,width:800,height:500}}),false);
  assert.equal(perchLost(perch,{available:true,windowId:'7',rect:{x:260,y:400,width:800,height:500}}),true);
  assert.equal(perchLost(perch,{available:true,windowId:'7'}),true);
  assert.equal(perchLost(perch,{available:false}),false);
});

test('falling lands on the floor after one soft bounce',()=>{
  let state={y:100,vy:0,bounced:false},steps=0,bounces=0;
  while(!state.done&&steps++<500){const before=state.bounced;state=stepFall(state,800,16);if(state.bounced!==before)bounces++;}
  assert.equal(state.y,800);assert.equal(bounces,1);assert.ok(steps<200);
});

test('reminders need the user present, reset sitting time after a break and nag about late nights once',()=>{
  let time=0,hour=14;
  const clock=createHealthClock({now:()=>time,hour:()=>hour,day:()=>'d1'});
  const at=(minutes,idleMs=0,extra={})=>{time=minutes*60000;return clock.sample({available:true,idleMs,...extra});};
  assert.equal(at(1),null);
  assert.equal(at(49),null);
  assert.equal(at(50,0,{fullscreen:true}),null);
  assert.equal(at(51),'stretch');
  assert.equal(at(60,6*60000),null);
  assert.equal(at(61),'water');
  assert.equal(at(100),null);
  hour=2;assert.equal(at(101),'late');assert.equal(at(102),null);
});
