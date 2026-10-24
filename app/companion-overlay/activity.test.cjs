const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { createActivitySensor } = require('./activity.cjs');

test('native helper is hidden, singleton, coalesces samples and closes with the overlay', async () => {
  let child, launches = 0, kills = 0, release;
  const received = [];
  const sensor = createActivitySensor({ root: 'G:/fixture',
    launch(exe, args, options) {
      launches++;
      assert.equal(options.windowsHide, true);
      assert.ok(args.includes('-NoProfile')); assert.ok(args.at(-1).endsWith('companion-activity.ps1'));
      child = new EventEmitter(); child.stdout = new PassThrough(); child.kill = () => kills++;
      return child;
    },
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
