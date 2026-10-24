const test=require('node:test');
const assert=require('node:assert/strict');
const {planRoam,planPoint,roamPosition}=require('./roaming.cjs');

test('roaming keeps direction and rejects an edge route so the turn clip can play first',()=>{
  for(const area of [{x:0,y:0,width:1920,height:1040},{x:-1280,y:80,width:1280,height:720}]){
    for(const size of [300,480])for(const side of ['left','right']){
      const bounds={x:side==='left'?area.x:area.x+area.width-size,y:area.y+30,width:size,height:460};
      const direction=side==='left'?1:-1;
      assert.equal(planRoam(bounds,area,-direction,null,()=>0.5),null);
      const route=planRoam(bounds,area,direction,null,()=>0.5);
      assert.equal(route.direction,side==='left'?1:-1);
      for(const progress of [0,0.25,0.5,0.75,1]){
        const p=roamPosition(route,progress,bounds);
        assert.ok(p.x>=area.x && p.x+bounds.width<=area.x+area.width);
        assert.ok(p.y>=area.y && p.y+bounds.height<=area.y+area.height);
      }
      assert.ok(Math.abs(route.target-route.x)>=60 && Math.abs(route.target-route.x)<=240);
    }
  }
});

test('following moves toward cursor without moving all the way under it',()=>{
  const bounds={x:500,y:200,width:300,height:412},area={x:0,y:0,width:1920,height:1080};
  const route=planRoam(bounds,area,-1,{x:1000,y:700},()=>0.5);
  assert.equal(route.kind,'point');assert.equal(route.direction,1);
  assert.ok(route.target>bounds.x);assert.ok(route.targetY>bounds.y);
  assert.ok(Math.hypot(route.target-bounds.x,route.targetY-bounds.y)<=241);
});

test('chosen destinations align the visible pet, clamp at edges and travel across monitors smoothly',()=>{
  const bounds={x:100,y:100,width:300,height:412};
  const area={x:-1280,y:0,width:1280,height:720};
  const route=planPoint(bounds,area,{x:-640,y:500});
  assert.deepEqual(roamPosition(route,0,bounds),{x:100,y:100});
  assert.equal(route.target+150,-640);
  assert.equal(route.targetY+412-139,500);
  assert.equal(route.direction,-1);
  const half=roamPosition(route,0.5,bounds);
  assert.equal(half.x,Math.round((bounds.x+route.target)/2));
  for(const point of [{x:-1280,y:0},{x:0,y:720}]){
    const end=roamPosition(planPoint(bounds,area,point),1,bounds);
    assert.ok(end.x>=area.x&&end.x+bounds.width<=0);
    assert.ok(end.y>=area.y&&end.y+bounds.height<=720);
  }
});
