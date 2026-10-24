function createGameLifecycle({inspect,stop,pause,publish,now=Date.now}) {
  let automatic=false, absentSince=null, polling=false, exiting=null, revision=0;
  let status={humanRunning:false,whaleRunning:false,known:false,automatic:false,busy:false,message:'正在检查游戏…'};
  function update(change){status={...status,...change,automatic};publish(status);return status;}
  async function exitGame(reason='manual') {
    if(exiting)return exiting;
    revision++;
    exiting=(async()=>{
      update({busy:true,message:'正在退出鲸鱼游戏…'});
      let paused=true;
      try{await pause();}catch{paused=false;}
      try{
        if(reason==='automatic'&&!automatic)return update({busy:false,message:'自动退出已关闭'});
        const result=await stop(reason==='automatic');
        absentSince=null;
        return update({...result,known:true,busy:false,
          message:result.whaleRunning?'鲸鱼游戏仍在运行':paused?'鲸鱼游戏已退出，桌面陪伴照常':'鲸鱼游戏已退出；搭子服务未确认暂停'});
      }catch{
        return update({busy:false,message:'退出没有完成，可以再试一次'});
      }
    })();
    try{return await exiting;}finally{exiting=null;}
  }
  return {
    snapshot:()=>status,
    setAutomatic(value){automatic=value;absentSince=null;return update({});},
    exitGame,
    async poll(){
      if(polling||exiting)return;
      polling=true;
      const startedRevision=revision;
      try{
        const result=await inspect();
        if(startedRevision!==revision)return;
        const changed=!status.known||status.whaleRunning!==result.whaleRunning;
        update({...result,known:true,...(changed?{message:result.whaleRunning?'鲸鱼游戏运行中':'鲸鱼游戏未运行'}:{})});
        if(!automatic||result.humanRunning||!result.whaleRunning){absentSince=null;return;}
        if(absentSince===null){absentSince=now();return;}
        if(now()-absentSince>=5000)await exitGame('automatic');
      }catch{if(startedRevision===revision){absentSince=null;update({known:false,message:'暂时无法检查游戏进程'});}}
      finally{polling=false;}
    }
  };
}
module.exports={createGameLifecycle};
