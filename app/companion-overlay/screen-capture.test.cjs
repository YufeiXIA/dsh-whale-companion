const test=require('node:test');
const assert=require('node:assert/strict');
const {createScreenCapture}=require('./screen-capture.cjs');

test('primary capture uses the visible screen composite cropped to its top window, never a secondary screen',async()=>{
  const sample={available:true,app:'browser',windowId:'42',idleMs:600000,
    rect:{x:200,y:100,width:1200,height:800},screenBounds:{x:0,y:0,width:2560,height:1440}};
  let crop,body;
  const capture=createScreenCapture({getPrimaryDisplay:()=>({id:7}),inspect:async()=>sample,
    getSources:async options=>{
      assert.deepEqual(options.types,['screen']);
      return [{display_id:'8',thumbnail:{isEmpty(){throw Error('secondary screen must not be used');}}},
        {display_id:'7',thumbnail:{isEmpty:()=>false,getSize:()=>({width:1280,height:720}),crop:rect=>{crop=rect;return {toJPEG:()=>Buffer.from([255,216,255,217])};}}}];
    },upload:async value=>{body=value;}});
  await capture.capture('primary-ticket',sample);capture.close();
  assert.deepEqual(crop,{x:100,y:50,width:600,height:400});
  assert.equal(body.source,'primary-visible-window');assert.equal(body.sourceApp,'browser');assert.ok(body.jpeg);
});

test('an unavailable primary screen never falls back to another monitor',async()=>{
  const sample={available:true,app:'browser',windowId:'42'};let body;
  const capture=createScreenCapture({getPrimaryDisplay:()=>({id:7}),inspect:async()=>sample,
    getSources:async()=>[{display_id:'8',thumbnail:{isEmpty(){throw Error('must not inspect secondary image');}}}],
    upload:async value=>{body=value;}});
  await capture.capture('missing-primary',sample);capture.close();
  assert.deepEqual(body,{ticket:'missing-primary',unavailable:true});
});

test('authorized passive viewing can capture the current window after long keyboard inactivity',async()=>{
  const sample={available:true,app:'media',windowId:'42',idleMs:3600000};
  const bodies=[];
  const capture=createScreenCapture({inspect:async()=>sample,getSources:async()=>[
    {id:'window:42:0',thumbnail:{isEmpty:()=>false,toJPEG:()=>Buffer.from([255,216,255,217])}}
  ],upload:async body=>bodies.push(body)});
  await capture.capture('passive-ticket',sample);capture.close();
  assert.equal(bodies[0]?.jpeg,Buffer.from([255,216,255,217]).toString('base64'));
});

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

test('changed, locked, sensitive or screen-clipping windows never send image bytes',async t=>{
  for(const inspect of [
    (()=>{let count=0;return async()=>({available:true,app:'browser',windowId:String(++count),idleMs:0});})(),
    async()=>({available:true,app:'browser',windowId:'1',idleMs:0,sensitive:true}),
    async()=>({available:true,app:'other',windowId:'1',idleMs:0,captureOverlay:true}),
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
