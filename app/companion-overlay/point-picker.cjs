const path=require('node:path');

// A temporary mouse-capture surface. The selected click never reaches the app underneath.
function createPointPicker({BrowserWindow,ipcMain,screen,platform=process.platform}) {
  const windows=new Map();
  let finish=null;
  function cancel(){settle(null);}
  function settle(point){
    const resolve=finish;finish=null;
    const opened=[...windows.values()];windows.clear();
    for(const window of opened)if(!window.isDestroyed())window.destroy();
    resolve?.(point);
  }
  ipcMain.handle('companion-point-choice',(event,point)=>{
    const picker=windows.get(event.sender.id);
    if(!picker||event.senderFrame!==picker.webContents.mainFrame)throw Error('Unknown point picker');
    if(point===null){cancel();return;}
    const bounds=picker.getBounds();
    if(!Number.isFinite(point?.x)||!Number.isFinite(point?.y)||point.x<0||point.y<0||point.x>bounds.width||point.y>bounds.height)throw Error('Invalid target point');
    settle({x:bounds.x+point.x,y:bounds.y+point.y});
  });
  return {
    windows,
    cancel,
    async pick(){
      if(finish)return null;
      const chosen=new Promise(resolve=>{finish=resolve;});
      try{
        for(const display of screen.getAllDisplays()){
          const picker=new BrowserWindow({...display.bounds,frame:false,transparent:true,backgroundColor:'#00000000',
            show:false,alwaysOnTop:true,skipTaskbar:true,resizable:false,hasShadow:false,
            webPreferences:{preload:path.join(__dirname,'point-picker-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
          const id=picker.webContents.id;windows.set(id,picker);
          if(platform==='darwin'){
            picker.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true,skipTransformProcessType:true});
            picker.setHiddenInMissionControl(true);
          }else picker.setMenu(null);
          picker.webContents.setWindowOpenHandler(()=>({action:'deny'}));
          picker.webContents.on('will-navigate',event=>event.preventDefault());
          picker.on('closed',()=>{if(windows.has(id))cancel();});
          await picker.loadFile(path.join(__dirname,'point-picker.html'));
        }
        for(const picker of windows.values()){picker.setAlwaysOnTop(true,'screen-saver');picker.showInactive();}
        const cursor=screen.getCursorScreenPoint();
        const display=screen.getDisplayNearestPoint(cursor);
        [...windows.values()].find(picker=>picker.getBounds().x===display.bounds.x&&picker.getBounds().y===display.bounds.y)?.focus();
      }catch(error){const canceled=!finish;cancel();if(!canceled)throw error;}
      return chosen;
    }
  };
}
module.exports={createPointPicker};
