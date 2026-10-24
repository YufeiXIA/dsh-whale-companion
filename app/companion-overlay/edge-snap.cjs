// The visible character is about 130 DIP wide and centred in the transparent window.
// line is the screen edge, where the renderer clips the window, so edges shared with another monitor work too.
// outX keeps the whole window on screen, which leaves room for speech.
function edgeSnap(bounds, area, scale=1, reach=48) {
  const half=bounds.width/2, pet=65*scale;
  const left=bounds.x+half-pet-area.x, right=area.x+area.width-(bounds.x+half+pet);
  if(left<=reach&&left<=right)
    return {side:-1,line:area.x,outX:area.x,snapX:Math.round(area.x-half+pet),peekX:Math.round(area.x-half),y:bounds.y};
  if(right<=reach)
    return {side:1,line:area.x+area.width,outX:area.x+area.width-bounds.width,snapX:Math.round(area.x+area.width-half-pet),peekX:Math.round(area.x+area.width-half),y:bounds.y};
  return null;
}
module.exports={edgeSnap};
