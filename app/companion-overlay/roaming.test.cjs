const test=require('node:test');
const assert=require('node:assert/strict');
const {planRoam,planPoint,roamPosition}=require('./roaming.cjs');

test('independent roaming uses continuous angles and longer distances without a downward bias',()=>{
  const bounds={x:1800,y:1300,width:300,height:400},area={x:0,y:0,width:4000,height:3000};
  const offsets=[];
  for(let i=0;i<100;i++){
    let draw=0;const angle=(i+.31)/100;
    const route=planRoam(bounds,area,1,null,()=>draw++===0?.5:angle);
    const dx=route.target-bounds.x,dy=route.targetY-bounds.y;
    offsets.push([dx,dy]);
    assert.ok(Math.abs(Math.hypot(dx,dy)-480)<.01);
    assert.ok(Math.abs(dx-480*Math.cos(angle*2*Math.PI))<.01);
    assert.ok(Math.abs(dy-480*Math.sin(angle*2*Math.PI))<.01);
    if(route.target!==bounds.x)assert.equal(route.direction,Math.sign(route.target-bounds.x));
  }
  assert.equal(new Set(offsets.map(x=>x.join(','))).size,100);
  assert.equal(offsets.filter(x=>x[1]<0).length,50);
  assert.equal(offsets.filter(x=>x[1]>0).length,50);
});

test('roaming remains in either monitor and can leave the bottom and corners',()=>{
  for(const area of [{x:0,y:0,width:1920,height:1040},{x:-1280,y:80,width:1280,height:720}]){
    for(const size of [300,480])for(const side of ['left','right']){
      const bounds={x:side==='left'?area.x:area.x+area.width-size,y:area.y+30,width:size,height:460};
      const direction=side==='left'?1:-1;
      const route=planRoam(bounds,area,direction,null,()=>0.5);
      assert.ok(route);
      for(const progress of [0,0.25,0.5,0.75,1]){
        const p=roamPosition(route,progress,bounds);
        assert.ok(p.x>=area.x && p.x+bounds.width<=area.x+area.width);
        assert.ok(p.y>=area.y && p.y+bounds.height<=area.y+area.height);
      }
      assert.ok(Math.hypot(route.target-route.x,route.targetY-route.y)>=40);
    }
    const bottom={x:area.x+300,y:area.y+area.height-460,width:300,height:460};
    assert.ok(Array.from({length:20},(_,i)=>planRoam(bottom,area,1,null,()=>i/20)).some(route=>route?.targetY<bottom.y));
  }
});

test('autonomous easing starts and stops gently without changing manual point movement',()=>{
  const bounds={x:100,y:100,width:300,height:400};
  const route={...bounds,kind:'point',target:300,targetY:300,smooth:true};
  assert.deepEqual(roamPosition(route,0,bounds),{x:100,y:100});
  assert.deepEqual(roamPosition(route,1,bounds),{x:300,y:300});
  assert.ok(roamPosition(route,.1,bounds).x<120);
  assert.ok(roamPosition(route,.9,bounds).x>280);
  assert.equal(roamPosition({...route,smooth:false},.1,bounds).x,120);
});

test('following reaches the captured cursor point without the old distance cap or stand-off',()=>{
  const bounds={x:500,y:200,width:300,height:412},area={x:0,y:0,width:1920,height:1080};
  const route=planRoam(bounds,area,-1,{x:1000,y:700},()=>0.5);
  assert.equal(route.kind,'point');assert.equal(route.direction,1);
  assert.ok(route.target>bounds.x);assert.ok(route.targetY>bounds.y);
  assert.equal(route.target+bounds.width/2,1000);
  assert.equal(route.targetY+bounds.height-139,700);
  assert.ok(Math.hypot(route.target-bounds.x,route.targetY-bounds.y)>240);
  assert.equal(planRoam(bounds,area,-1,{x:650,y:473}),null,'already at cursor: no unrelated random trip');
  const other={x:-1920,y:0,width:1920,height:1080};
  const across=planRoam(bounds,other,-1,{x:-900,y:650});
  assert.deepEqual(roamPosition(across,0,bounds),{x:bounds.x,y:bounds.y});
  assert.equal(across.target+150,-900);assert.equal(across.targetY+273,650);
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
