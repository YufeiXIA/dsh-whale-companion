const test=require('node:test');
const assert=require('node:assert/strict');
const {edgeSnap}=require('./edge-snap.cjs');

test('edge snap holds the visible character to an outer screen edge and tucks half of it away',()=>{
  const area={x:0,y:0,width:1920,height:1040},displays=[{x:0,y:0,width:1920,height:1080}];
  const left=edgeSnap({x:-60,y:200,width:300,height:500},area,displays);
  assert.deepEqual(left,{side:-1,snapX:-85,peekX:-150,y:200});
  const right=edgeSnap({x:1700,y:200,width:300,height:500},area,displays,1.2);
  assert.equal(right.side,1);
  assert.equal(right.snapX+150+78,1920,'the scaled character touches the right edge');
  assert.equal(right.peekX+150,1920,'tucked, the character centre sits on the edge');
  assert.equal(edgeSnap({x:600,y:200,width:300,height:500},area,displays),null);
});

test('edges shared with another monitor never snap',()=>{
  const area={x:0,y:0,width:1920,height:1040};
  const displays=[{x:0,y:0,width:1920,height:1080},{x:-1280,y:0,width:1280,height:1024},{x:1920,y:0,width:1920,height:1080}];
  assert.equal(edgeSnap({x:-60,y:200,width:300,height:500},area,displays),null);
  assert.equal(edgeSnap({x:1700,y:200,width:300,height:500},area,displays),null);
  const lower=[{x:0,y:0,width:1920,height:1080},{x:-1280,y:900,width:1280,height:1024}];
  assert.equal(edgeSnap({x:-60,y:100,width:300,height:500},area,lower).side,-1,'a neighbour lower down does not block this height');
});
