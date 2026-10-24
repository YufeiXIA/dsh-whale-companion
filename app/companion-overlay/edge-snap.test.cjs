const test=require('node:test');
const assert=require('node:assert/strict');
const {edgeSnap}=require('./edge-snap.cjs');

test('edge snap holds the visible character to a screen edge and tucks half of it away',()=>{
  const area={x:0,y:0,width:1920,height:1040};
  const left=edgeSnap({x:-60,y:200,width:300,height:500},area);
  assert.deepEqual(left,{side:-1,line:0,outX:0,snapX:-85,peekX:-150,y:200});
  const right=edgeSnap({x:1700,y:200,width:300,height:500},area,1.2);
  assert.equal(right.side,1);assert.equal(right.line,1920);assert.equal(right.outX+300,1920);
  assert.equal(right.snapX+150+78,1920,'the scaled character touches the right edge');
  assert.equal(right.peekX+150,1920,'tucked, the character centre sits on the edge');
  assert.equal(edgeSnap({x:600,y:200,width:300,height:500},area),null);
});

test('an unlimited reach picks the nearer side',()=>{
  const area={x:0,y:0,width:1920,height:1040};
  assert.equal(edgeSnap({x:600,y:200,width:300,height:500},area,1,Infinity).side,-1);
  assert.equal(edgeSnap({x:1200,y:200,width:300,height:500},area,1,Infinity).side,1);
});
