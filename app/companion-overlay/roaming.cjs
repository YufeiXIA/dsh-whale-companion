// Desktop movement follows the original clip's two-second lead and tail.
// Compensate for the transparent video padding so the input stays close to the feet.
function compactFooter(scale) { return 76-55*scale; }
function planRoam(bounds, area, direction=-1, cursor=null, random=Math.random, scale=1) {
  const minX=area.x, maxX=Math.max(minX,area.x+area.width-bounds.width);
  const minY=area.y, maxY=Math.max(minY,area.y+area.height-bounds.height);
  const x=Math.min(maxX,Math.max(minX,bounds.x)), y=Math.min(maxY,Math.max(minY,bounds.y));
  if(cursor){
    const cx=x+bounds.width/2,cy=y+bounds.height-118*scale-compactFooter(scale);
    const dx=cursor.x-cx,dy=cursor.y-cy,distance=Math.hypot(dx,dy);
    if(distance>=120){
      const travel=Math.min(distance-80,240);
      const route=planPoint({...bounds,x,y},area,{x:cx+dx/distance*travel,y:cy+dy/distance*travel},scale);
      if(Math.hypot(route.target-x,route.targetY-y)>=24)return route;
    }
  }
  const target=x+direction*(60+random()*180);
  if(target<minX+20||target>maxX-20)return null;
  return {x,y,target,area,width:bounds.width,height:bounds.height,direction};
}

function roamPosition(route, progress, bounds) {
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
