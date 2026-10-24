const {writeFile}=require('node:fs/promises');
const path=require('node:path');

module.exports=async function({win,output}){
  await win.webContents.executeJavaScript('initialState.then(()=>undefined)');
  const samples=[];
  for(let i=0;i<30;i++){
    await new Promise(resolve=>setTimeout(resolve,500));
    samples.push(await win.webContents.executeJavaScript(`(()=>{
      const v=document.getElementById('pet'),canvas=document.createElement('canvas');
      canvas.width=160;canvas.height=90;const ctx=canvas.getContext('2d');let pixels=0;
      if(v.readyState>=2){ctx.drawImage(v,0,0,160,90);const data=ctx.getImageData(0,0,160,90).data;
        for(let n=3;n<data.length;n+=4)if(data[n]>16)pixels++;}
      const layers=[...document.querySelectorAll('video.pet-layer')].map(layer=>{
        const style=getComputedStyle(layer);let nonempty=0;ctx.clearRect(0,0,160,90);
        if(layer.readyState>=2){ctx.drawImage(layer,0,0,160,90);const data=ctx.getImageData(0,0,160,90).data;
          for(let n=3;n<data.length;n+=4)if(data[n]>16)nonempty++;}
        return {opacity:Number(style.opacity),visibility:style.visibility,pixels:nonempty};
      });
      const style=getComputedStyle(v),r=v.getBoundingClientRect();
      return {src:v.getAttribute('src'),time:v.currentTime,ready:v.readyState,error:v.error?.code??null,
        front:v.classList.contains('pet-front'),opacity:style.opacity,visibility:style.visibility,pixels,
        layers,compositeVisible:layers.some(layer=>layer.pixels>0&&layer.opacity>0&&layer.visibility==='visible'),
        rect:{x:r.x,y:r.y,width:r.width,height:r.height},clip:document.body.style.clipPath};
    })()`));
  }
  await writeFile(path.join(output,'visual-review-live.png'),(await win.webContents.capturePage()).toPNG());
  await writeFile(path.join(output,'visual-review-live.json'),JSON.stringify({
    completed:samples.every(s=>s.compositeVisible),
    pid:process.pid,at:new Date().toISOString(),samples},null,2));
};
