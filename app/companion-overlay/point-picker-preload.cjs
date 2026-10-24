const {ipcRenderer}=require('electron');
window.addEventListener('DOMContentLoaded',()=>{
  document.addEventListener('pointerup',event=>{
    event.preventDefault();
    void ipcRenderer.invoke('companion-point-choice',event.button!==0||event.target.closest('button')?null:{x:event.clientX,y:event.clientY});
  },{once:true});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();void ipcRenderer.invoke('companion-point-choice',null);}});
  document.addEventListener('contextmenu',event=>event.preventDefault());
});
