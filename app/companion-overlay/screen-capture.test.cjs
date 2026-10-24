const test=require('node:test');
const assert=require('node:assert/strict');
const {createScreenCapture}=require('./screen-capture.cjs');

test('only the selected active window is consumed, in memory, with a visible capture signal',async t=>{
  const sample={available:true,app:'browser',windowId:'42',idleMs:0};
  let selected=0,uploaded=0,signals=0;
  const capture=createScreenCapture({inspect:async()=>sample,onCapture:()=>signals++,
    getSources:async options=>{
      assert.deepEqual(options.types,['window']);
      return [{id:'window:99:0',thumbnail:{toJPEG(){throw Error('wrong window');}}},
        {id:'window:42:0',thumbnail:{isEmpty:()=>false,toJPEG:quality=>{assert.equal(quality,72);selected++;return Buffer.from([255,216,255,217]);}}}];
    },
    upload:async body=>{
      if(body.unavailable)return;
      uploaded++;assert.equal(body.jpeg,Buffer.from([255,216,255,217]).toString('base64'));
      if(uploaded===2)throw Error('offline');
    }});
  t.after(()=>capture.close());
  await capture.capture('ticket',sample);
  await capture.capture('ticket2',sample);
  assert.equal(selected,2);assert.equal(uploaded,2);assert.equal(signals,2);
});

test('changed, locked or sensitive windows never send image bytes',async t=>{
  for(const inspect of [
    (()=>{let count=0;return async()=>({available:true,app:'browser',windowId:String(++count),idleMs:0});})(),
    async()=>({available:true,app:'browser',windowId:'1',idleMs:0,sensitive:true}),
    async()=>({available:false})]){
    let body,signals=0;
    const capture=createScreenCapture({inspect,onCapture:()=>signals++,
      getSources:async()=>[{id:'window:1:0',thumbnail:{isEmpty:()=>false,toJPEG(){throw Error('must not encode');}}}],
      upload:async value=>{body=value;}});
    t.after(()=>capture.close());
    await capture.capture('ticket',{app:'browser',windowId:'1'});
    assert.deepEqual(body,{ticket:'ticket',unavailable:true});assert.equal(signals,0);
  }
});
