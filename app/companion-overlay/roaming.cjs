// Desktop movement follows the original clip's two-second lead and tail.
// Compensate for the transparent video padding so the input stays close to the feet.
function compactFooter(scale) { return 76-55*scale; }
function planRoam(bounds, area, direction=-1, cursor=null, random=Math.random, scale=1) {
  if(cursor){
    const route=planPoint(bounds,area,cursor,scale);
    return Math.hypot(route.target-bounds.x,route.targetY-bounds.y)>=24?route:null;
  }
  const minX=area.x, maxX=Math.max(minX,area.x+area.width-bounds.width);
  const minY=area.y, maxY=Math.max(minY,area.y+area.height-bounds.height);
  const x=Math.min(maxX,Math.max(minX,bounds.x)), y=Math.min(maxY,Math.max(minY,bounds.y));
  const distance=320+random()*320,angle=random()*Math.PI*2;
  let dx=maxX>minX?Math.cos(angle):0,dy=maxY>minY?Math.sin(angle):0;
  const length=Math.hypot(dx,dy);if(!length)return null;
  dx/=length;dy/=length;
  // Reflect blocked components toward the roomier side; preserve the random angle.
  if(x+dx*distance<minX||x+dx*distance>maxX)dx=Math.abs(dx)*(maxX-x>=x-minX?1:-1);
  if(y+dy*distance<minY||y+dy*distance>maxY)dy=Math.abs(dy)*(maxY-y>=y-minY?1:-1);
  const roomX=dx>0?maxX-x:x-minX,roomY=dy>0?maxY-y:y-minY;
  const travel=Math.min(distance,dx?roomX/Math.abs(dx):Infinity,dy?roomY/Math.abs(dy):Infinity);
  if(travel<40)return null;
  const target=x+dx*travel,targetY=y+dy*travel;
  return {...bounds,kind:'point',target,targetY,area,direction:Math.abs(target-bounds.x)<1?direction:Math.sign(target-bounds.x)};
}

function roamPosition(route, progress, bounds) {
  // Autonomous movement eases into and out of the clip's moving section.
  if(route.smooth)progress=progress*progress*(3-2*progress);
  if(route.kind==='point')return {
    x:Math.round(route.x+(route.target-route.x)*progress),
    y:Math.round(route.y+(route.targetY-route.y)*progress)
  };
  const {area}=route;
  return {
    x:Math.round(Math.min(Math.max(area.x,area.x+area.width-bounds.width),Math.max(area.x,route.x+(route.target-route.x)*progress))),
    y:Math.round(Math.min(Math.max(area.y,area.y+area.height-bounds.height),Math.max(area.y,route.y)))
  };
}

function planPoint(bounds, area, point, scale=1) {
  const target=Math.min(Math.max(area.x,area.x+area.width-bounds.width),Math.max(area.x,point.x-bounds.width/2));
  // Aim the visible character's centre (the hit region), not the transparent window corner.
  const targetY=Math.min(Math.max(area.y,area.y+area.height-bounds.height),Math.max(area.y,point.y-(bounds.height-118*scale-compactFooter(scale))));
  return {...bounds,kind:'point',target,targetY,area,direction:target>=bounds.x?1:-1};
}

module.exports={planRoam,planPoint,roamPosition,compactFooter};
