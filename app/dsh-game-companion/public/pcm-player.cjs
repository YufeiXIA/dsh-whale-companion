(function(root){
  // Fish PCM: signed 16-bit little-endian, mono, 24 kHz. Network chunks may split samples.
  class PCMPlayer {
    constructor(body, Context = root.AudioContext){
      this.reader=body.getReader();this.context=new Context({sampleRate:24000});
      this.gain=this.context.createGain();this.gain.connect(this.context.destination);
      this.sources=new Set();this.paused=false;this.finished=false;this.pending=null;this.nextAt=0;
    }
    set volume(value){this.gain.gain.value=value;}
    async play(){
      const started=new Promise((resolve,reject)=>{this.started=resolve;this.failed=reject;});
      void this.pump();
      return started;
    }
    async pump(){
      try{
        await this.context.resume();
        while(!this.paused){
          const {value,done}=await this.reader.read();
          if(this.paused)return;
          if(done)break;
          let bytes=value;
          if(this.pending!==null){bytes=new Uint8Array(value.length+1);bytes[0]=this.pending;bytes.set(value,1);this.pending=null;}
          if(bytes.length%2)this.pending=bytes[bytes.length-1];
          const count=Math.floor(bytes.length/2);if(!count)continue;
          const buffer=this.context.createBuffer(1,count,24000),samples=buffer.getChannelData(0);
          const view=new DataView(bytes.buffer,bytes.byteOffset,count*2);
          for(let i=0;i<count;i++)samples[i]=view.getInt16(i*2,true)/32768;
          const source=this.context.createBufferSource();source.buffer=buffer;source.connect(this.gain);
          this.sources.add(source);
          source.onended=()=>{this.sources.delete(source);source.disconnect();this.finish();};
          // Only prime an empty buffer. Re-adding headroom to every packet cuts ongoing speech.
          const start=this.nextAt>this.context.currentTime?this.nextAt:this.context.currentTime+0.12;
          source.start(start);this.nextAt=start+count/24000;
          this.started();
        }
        if(this.paused)return;
        if(this.pending!==null||!this.nextAt)throw new Error('VOICE_UNAVAILABLE');
        this.finished=true;this.finish();
      }catch(error){
        if(this.paused)return;
        this.failed(error);this.pause();this.onerror?.(error);
      }
    }
    finish(){
      if(!this.finished||this.sources.size||this.paused)return;
      this.paused=true;void this.context.close();this.onended?.();
    }
    pause(){
      if(this.paused)return;
      this.paused=true;this.failed?.(new DOMException('Interrupted','AbortError'));
      for(const source of this.sources){source.onended=null;source.stop();source.disconnect();}
      this.sources.clear();void this.reader.cancel().catch(()=>{});void this.context.close();
    }
  }
  if(typeof module!=='undefined')module.exports=PCMPlayer;
  else root.CompanionPCMPlayer=PCMPlayer;
})(typeof globalThis!=='undefined'?globalThis:this);
