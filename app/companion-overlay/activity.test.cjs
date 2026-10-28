const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { createActivitySensor } = require('./activity.cjs');

test('companion focus does not interrupt resumed speech, but unavailable activity still does',async()=>{
  const fs=require('node:fs'),vm=require('node:vm'),signals=[],samples=[];
  const main=fs.readFileSync(require.resolve('./main.cjs'),'utf8');
  const context={root:'fixture',ambientWanted:true,activityHeartbeat:Date.now(),forwarded:false,lastForwardAt:0,sessionBlocked:false,
    desktopSense(){},createActivitySensor:({publish})=>publish,
    win:{isDestroyed:()=>false,webContents:{send:signal=>signals.push(signal)}},
    quietState:{visionPausedUntil:0},request:async(_,body)=>{samples.push(body.sample);return {};}};
  vm.runInNewContext(main.slice(main.indexOf('  let lastActivityApp,'),main.indexOf('  const area = screen.getPrimaryDisplay().workArea;',main.indexOf('  let lastActivityApp,'))),context);
  await context.activitySensor({available:true,app:'companion',windowId:'pet',idleMs:0});
  assert.deepEqual(signals,[]);assert.equal(samples[0].app,'companion');
  await context.activitySensor({available:false});
  assert.deepEqual(signals,['companion-activity-invalid']);assert.equal(samples[1].available,false);
});

test('the screenshot overlay does not hide the pet as a fullscreen application',()=>{
  const fs=require('node:fs'),vm=require('node:vm');
  const main=fs.readFileSync(require.resolve('./main.cjs'),'utf8');let hides=0,shows=0;
  const context={win:{isDestroyed:()=>false,isVisible:()=>true,hide(){hides++;},webContents:{send(){}}},
    desktopPrefs:{fullscreenHide:true},hiddenForFullscreen:false,fullscreenOverride:null,perch:null,perchPending:null,
    perchKeepsVisible:require('./desktop-life.cjs').perchKeepsVisible,
    health:{sample:()=>null},buildTray(){},showWithoutFocus(){shows++;}};
  vm.runInNewContext(main.slice(main.indexOf('function desktopSense('),main.indexOf('// Docked characters stay')),context);
  context.desktopSense({available:true,app:'other',fullscreen:true,captureOverlay:true});assert.equal(hides,0);
  context.desktopSense({available:true,app:'game',fullscreen:true});assert.equal(hides,1);
  context.desktopSense({available:true,app:'other',fullscreen:true,captureOverlay:true});assert.equal(shows,1);
  context.perchPending={windowId:'target'};
  context.desktopSense({available:true,app:'game',windowId:'target',fullscreen:true});assert.equal(hides,1);
  context.perch=context.perchPending;context.perchPending=null;
  context.desktopSense({available:true,app:'game',windowId:'target',fullscreen:true});assert.equal(hides,1);
  context.desktopSense({available:true,app:'game',windowId:'different',fullscreen:true});assert.equal(hides,2);
});

test('native helper is hidden, singleton, coalesces samples and closes with the overlay', async () => {
  let child, launches = 0, kills = 0, release;
  const received = [];
  const sensor = createActivitySensor({ root: 'G:/fixture',
    launch(exe, args, options) {
      launches++;
      assert.equal(options.windowsHide, true);
      assert.ok(exe.endsWith('WhaleNativeBridge'));
      assert.deepEqual(args, ['activity', '--exclude-process', '42']);
      child = new EventEmitter(); child.stdout = new PassThrough(); child.kill = () => kills++;
      return child;
    },
    platform: 'darwin', excludeProcessId: 42,
    async publish(sample) {
      received.push(sample);
      if (received.length === 1) await new Promise(resolve => { release = resolve; });
    }
  });
  sensor.setEnabled(true); sensor.setEnabled(true); assert.equal(launches, 1);
  child.stdout.write('{"available":true,"app":"code","idleMs":0}\n');
  child.stdout.write('{"available":true,"app":"browser","idleMs":0}\n');
  child.stdout.write('{"available":true,"app":"media","idleMs":0}\n');
  const finished = sensor.close(); release(); await finished;
  assert.deepEqual(received, [{ available: true, app: 'code', idleMs: 0 }, { available: false }]);
  assert.equal(kills, 1);
  sensor.setEnabled(true); assert.equal(launches, 1);
  child.stdout.end();
});
