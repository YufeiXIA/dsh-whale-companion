// The DSH release-speed threshold and decay/bounce parameters, in screen DIP/ms.
function releaseVelocity(samples){
  const last=samples.at(-1);
  if(!last)return null;
  const first=samples.find(sample=>last.t-sample.t<=120);
  if(first===last)return null;
  const dt=last.t-first.t;
  if(dt<=0)return null;
  const vx=(last.x-first.x)/dt,vy=(last.y-first.y)/dt;
  return Math.hypot(vx,vy)>1.2?{vx,vy}:null;
}
function stepInertia(state,area,size,dt){
  let {x,y,vx,vy}=state;
  x+=vx*dt;y+=vy*dt;
  const maxX=Math.max(area.x,area.x+area.width-size.width),maxY=Math.max(area.y,area.y+area.height-size.height);
  let bounced=false;
  if(x<area.x||x>maxX){x=Math.max(area.x,Math.min(maxX,x));vx*=-0.78;vy*=0.97;bounced=true;}
  if(y<area.y||y>maxY){y=Math.max(area.y,Math.min(maxY,y));vy*=-0.78;vx*=0.97;bounced=true;}
  const decay=Math.exp(-dt/700);vx*=decay;vy*=decay;
  return {x,y,vx,vy,bounced,done:Math.hypot(vx,vy)<0.015};
}
module.exports={releaseVelocity,stepInertia};
