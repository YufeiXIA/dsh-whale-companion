const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { activityCommand, trackerCommand } = require('./native-platform.cjs');

test('macOS activity and selection share the packaged native helper and exclude the overlay', () => {
  const options = { platform: 'darwin', excludeProcessId: 73 };
  const helper = path.join('fixture', 'tools/macos/WhaleNativeBridge');
  assert.deepEqual(activityCommand('fixture', options), { file: helper, args: ['activity', '--exclude-process', '73'] });
  assert.deepEqual(activityCommand('fixture', { ...options, once: true, primary: true }),
    { file: helper, args: ['sample', '--primary', '--exclude-process', '73'] });
  assert.deepEqual(activityCommand('fixture', { platform: 'darwin', once: true }),
    { file: helper, args: ['sample', '--exclude-process', String(process.pid)] });
  assert.deepEqual(trackerCommand('fixture', options), { file: helper, args: ['tracker', '--exclude-process', '73'] });
});

test('Windows native commands retain existing PowerShell arguments', () => {
  const previous = process.env.SystemRoot;
  process.env.SystemRoot = 'C:/Windows';
  try {
    const options = { platform: 'win32', excludeProcessId: 73 };
    const prefix = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File'];
    const file = path.join('C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
    const script = path.join('fixture', 'tools/companion-activity.ps1');
    assert.deepEqual(activityCommand('fixture', options), { file, args: [...prefix, script] });
    assert.deepEqual(activityCommand('fixture', { ...options, once: true }), { file, args: [...prefix, script, '-Once'] });
    assert.deepEqual(activityCommand('fixture', { ...options, once: true, primary: true }),
      { file, args: [...prefix, script, '-Once', '-PrimaryWindow', '-ExcludeProcessId', '73'] });
    assert.deepEqual(trackerCommand('fixture', options),
      { file, args: [...prefix, path.join('fixture', 'tools/companion-window-tracker.ps1'), '-ExcludeProcessId', '73'] });
  } finally {
    if (previous === undefined) delete process.env.SystemRoot;
    else process.env.SystemRoot = previous;
  }
});

test('unknown platforms fail before launching a native executable', () => {
  assert.throws(() => activityCommand('fixture', { platform: 'linux' }), /Unsupported/);
  assert.throws(() => trackerCommand('fixture', { platform: 'linux' }), /Unsupported/);
});
