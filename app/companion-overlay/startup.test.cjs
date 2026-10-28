const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const source = readFileSync(require('node:path').join(__dirname, 'main.cjs'), 'utf8');

// Exercise the actual entrypoint handlers, including a still-open error dialog.
test('double-click retries a failed startup while its error dialog is pending', async () => {
  const handlers = new Map(), writes = [], calls = [];
  let failed, closeDialog;
  const context = {
    startupFailed: false, smoke: false, lite: null, win: undefined, output: 'diagnostics',
    path: require('node:path'), start() {},
    require: () => ({ writeFile: async (file, value) => writes.push([file, JSON.parse(value)]) }),
    app: { whenReady: () => ({ then: () => ({ catch: fn => { failed = fn; } }) }),
      on: (event, fn) => handlers.set(event, fn), relaunch: () => calls.push('relaunch'), exit: () => calls.push('exit') },
    console: { error() {} },
    dialog: { showMessageBox: () => new Promise(resolve => { closeDialog = resolve; }) },
    showWithoutFocus: () => calls.push('show'), checkDesktopLaunch: async () => {}
  };
  const start = source.indexOf('else app.whenReady()') + 5;
  const end = source.indexOf("app.on('window-all-closed'");
  runInNewContext(source.slice(start, end), context);
  const pending = failed(new Error('Failed to open http://localhost:19388/?token=private'));
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(closeDialog, 'error reporting must yield to second-instance events');
  assert.equal(writes.length, 1);
  assert.equal(writes[0][1].message.includes('private'), false);
  handlers.get('second-instance')({}, ['--desktop-companion']);
  assert.deepEqual(calls, ['relaunch', 'exit']);
  closeDialog({ response: 1 }); await pending;

  context.startupFailed = false;
  context.win = { webContents: { send: () => calls.push('desktop-mode') } };
  calls.length = 0;
  handlers.get('second-instance')({}, ['--desktop-companion']);
  assert.deepEqual(calls, ['show', 'desktop-mode']);
});
