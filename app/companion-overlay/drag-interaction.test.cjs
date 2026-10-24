const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

test('a click never starts native dragging; a real drag preserves its pointer-down origin',()=>{
  const source=fs.readFileSync(require.resolve('./preload.cjs'),'utf8');
  const code=source.slice(source.indexOf("pet.addEventListener('pointerdown'"),source.indexOf("  pet.addEventListener('click'"));
  const listeners=new Map(),calls=[];
  const context={dragging:false,moved:false,startX:0,startY:0,inside:undefined,
    pet:{addEventListener:(name,fn)=>listeners.set(name,fn),setPointerCapture(){}},
    ipcRenderer:{invoke:(...args)=>{calls.push(args);return Promise.resolve();}},
    window:{dispatchEvent(){}},CustomEvent:class{},matchMedia:()=>({matches:false})};
  vm.runInNewContext(code,context);
  const down={button:0,screenX:20,screenY:500,pointerId:1};
  listeners.get('pointerdown')(down);listeners.get('pointerup')();
  assert.equal(calls.length,0,'clicking a docked pet must not clear its dock');
  listeners.get('pointerdown')(down);listeners.get('pointermove')({screenX:40,screenY:510});listeners.get('pointerup')();
  assert.deepEqual(calls.map(call=>call[1]),['drag-start','drag-move','drag-end']);
  assert.equal(calls[0][2].x,20);assert.equal(calls[0][2].y,500);
});
