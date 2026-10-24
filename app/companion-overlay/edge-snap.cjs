// The visible character is about 130 DIP wide and centred in the transparent window.
// Only outer screen edges count, so she never tucks half onto a neighbouring monitor.
function edgeSnap(bounds, area, displays, scale=1, reach=48) {
  const half=bounds.width/2, pet=65*scale, cy=bounds.y+bounds.height/2;
  const outer=x=>!displays.some(d=>x>=d.x&&x<d.x+d.width&&cy>=d.y&&cy<d.y+d.height);
  const left=bounds.x+half-pet-area.x, right=area.x+area.width-(bounds.x+half+pet);
  if(left<=reach&&left<=right&&outer(area.x-1))
    return {side:-1,snapX:Math.round(area.x-half+pet),peekX:Math.round(area.x-half),y:bounds.y};
  if(right<=reach&&outer(area.x+area.width))
    return {side:1,snapX:Math.round(area.x+area.width-half-pet),peekX:Math.round(area.x+area.width-half),y:bounds.y};
  return null;
}
module.exports={edgeSnap};
