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

test('pausing capture before or during asynchronous work never uploads image bytes',async t=>{
  for(const stage of ['start','inspect','sources'])await t.test(stage,async()=>{
    const sample={available:true,app:'browser',windowId:'42',idleMs:0};
    let allowed=stage!=='start',release,started,inspections=0,sources=0,encoded=0,signals=0;
    const gate=new Promise(resolve=>{release=resolve;}),ready=new Promise(resolve=>{started=resolve;});
    const bodies=[];
    const capture=createScreenCapture({isAllowed:()=>allowed,onCapture:()=>signals++,
      inspect:async()=>{
        inspections++;
        if(stage==='inspect'&&inspections===1){started();await gate;}
        return sample;
      },
      getSources:async()=>{
        sources++;
        if(stage==='sources'){started();await gate;}
        return [{id:'window:42:0',thumbnail:{isEmpty:()=>false,toJPEG:()=>{encoded++;return Buffer.from([255,216,255,217]);}}}];
      },upload:async body=>bodies.push(body)});
    const running=capture.capture('paused-ticket',sample);
    if(stage!=='start'){await ready;allowed=false;release();}
    await running;capture.close();
    assert.deepEqual(bodies,[{ticket:'paused-ticket',unavailable:true}]);
    assert.equal(encoded,0);assert.equal(signals,0);
    if(stage!=='sources')assert.equal(sources,0);
    if(stage==='start')assert.equal(inspections,0);
  });
});
