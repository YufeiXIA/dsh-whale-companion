const test=require('node:test');
const assert=require('node:assert/strict');
const {createPointPicker}=require('./point-picker.cjs');

test('selection consumes one point, rejects foreign IPC and tears down every capture window',async()=>{
  let handler,id=0;
  class Window {
    constructor(bounds){this.bounds=bounds;this.closed=false;this.webContents={id:++id,mainFrame:{},setWindowOpenHandler(){},on(){}};}
    setMenu(){} on(){} async loadFile(){} setAlwaysOnTop(){} showInactive(){} focus(){}
    getBounds(){return this.bounds;}isDestroyed(){return this.closed;}destroy(){this.closed=true;}
  }
  const displays=[{bounds:{x:-1000,y:0,width:1000,height:800}},{bounds:{x:0,y:0,width:1200,height:900}}];
  const picker=createPointPicker({BrowserWindow:Window,ipcMain:{handle(_name,fn){handler=fn;}},screen:{
    getAllDisplays:()=>displays,getCursorScreenPoint:()=>({x:10,y:10}),getDisplayNearestPoint:()=>displays[1]
  }});
  const pending=picker.pick();await new Promise(resolve=>setImmediate(resolve));
  const windows=[...picker.windows.values()],first=windows[0];
  assert.equal(windows.length,2);
  assert.throws(()=>handler({sender:{id:999},senderFrame:{}},{x:10,y:20}),/Unknown/);
  const event={sender:first.webContents,senderFrame:first.webContents.mainFrame};
  assert.throws(()=>handler(event,{x:Infinity,y:20}),/Invalid/);
  handler(event,{x:250,y:500});
  assert.deepEqual(await pending,{x:-750,y:500});
  assert.equal(picker.windows.size,0);assert.ok(windows.every(w=>w.closed));
  const canceled=picker.pick();await new Promise(resolve=>setImmediate(resolve));
  picker.cancel();assert.equal(await canceled,null);assert.equal(picker.windows.size,0);
});
