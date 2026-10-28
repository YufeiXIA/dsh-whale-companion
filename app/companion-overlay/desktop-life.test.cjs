const test=require('node:test');
const assert=require('node:assert/strict');
const {quickChatY}=require('./desktop-life.cjs');

test('quick chat lifts a floor window fully above the taskbar',()=>{
  assert.equal(quickChatY({y:627,height:473},{y:0,height:1040}),567);
  assert.equal(quickChatY({y:200,height:473},{y:0,height:1040}),200);
  assert.equal(quickChatY({y:1000,height:473},{y:400,height:1040}),967);
});
const {feetOffset,floorY,strollRoute,perchRoute,perchFailure,perchKeepsVisible,stepFall,createHealthClock}=require('./desktop-life.cjs');

const area={x:0,y:0,width:1920,height:1040},bounds={x:900,y:300,width:300,height:473};

test('taskbar strolls stay on the floor and turn back at the screen edge',()=>{
  const route=strollRoute(bounds,area,1,()=>0.5);
  assert.equal(route.kind,'point');assert.equal(route.targetY,floorY(area,bounds.height,1));
  assert.equal(route.target,bounds.x+180);
  assert.equal(route.targetY+bounds.height-feetOffset(1),area.height-4);
  const atEdge=strollRoute({...bounds,x:area.width-bounds.width},area,1,()=>0.5);
  assert.equal(atEdge.direction,-1);
});

test('top-edge placement falls back inside maximized, narrow and top-aligned windows',()=>{
  const display={x:0,y:0,width:1920,height:1080};
  const route=perchRoute(bounds,{x:200,y:500,width:800,height:500},display);
  assert.equal(route.targetY+bounds.height-feetOffset(1),506);
  assert.equal(route.placement,'edge');
  assert.ok(route.target+bounds.width/2<=1000-80&&route.target+bounds.width/2>=280);
  for(const rect of [{x:-8,y:-8,width:1936,height:1048},{x:200,y:10,width:120,height:180},
    {x:200,y:-100,width:800,height:500},display]){
    const result=perchRoute(bounds,rect,display);
    assert.equal(result.placement,'inside');
    assert.ok(result.target>=display.x&&result.targetY>=display.y);
    assert.ok(result.target+bounds.width<=display.width&&result.targetY+bounds.height<=display.height);
  }
});

test('perching follows the same relative spot through movement and resize without leaving the visible screen',()=>{
  const display={x:0,y:0,width:1920,height:1080},rect={x:200,y:500,width:800,height:500};
  const first=perchRoute(bounds,rect,display,1);
  const moved=perchRoute(bounds,{...rect,x:260,y:530},display,1,first.anchor);
  assert.equal(moved.target,first.target+60);assert.equal(moved.targetY,first.targetY+30);
  const resized=perchRoute(bounds,{...rect,width:1000},display,1,first.anchor);
  assert.equal(resized.target+bounds.width/2,Math.round(rect.x+1000*first.anchor));
  const second={x:-1920,y:-300,width:1920,height:1080};
  const other=perchRoute(bounds,{x:-1850,y:200,width:900,height:500},second,1,first.anchor);
  assert.ok(other.target<0);assert.equal(other.targetY+bounds.height-feetOffset(1),206);
  const clipped=perchRoute(bounds,{x:1800,y:400,width:800,height:500},display,1);
  assert.ok(clipped.target+bounds.width<=display.width);
  assert.equal(perchFailure({...rect,y:50},display,1),null);
  assert.equal(perchFailure({...rect,width:100},display,1),null);
  assert.equal(perchFailure(null,display,1),'missing');
  assert.equal(perchFailure({...rect,y:1100},display,1),'offscreen');
});

test('fullscreen exemption applies only to the explicitly attached window',()=>{
  assert.equal(perchKeepsVisible({windowId:'a'},{windowId:'a'}),true);
  assert.equal(perchKeepsVisible({windowId:'b'},{windowId:'a'}),false);
  assert.equal(perchKeepsVisible({windowId:'a'},null),false);
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
