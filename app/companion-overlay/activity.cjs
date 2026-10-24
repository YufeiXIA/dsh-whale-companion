const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const path = require('node:path');

function createActivitySensor({ root, publish, launch = spawn }) {
  let child = null, closed = false, retryAfter = 0;
  let pending = null, latest = null;
  function send(sample) {
    latest = sample;
    if (pending) return;
    pending = (async () => {
      while (latest) {
        const sample = latest; latest = null;
        try { await publish(sample); } catch { /* No network retry or historical observation queue. */ }
      }
    })().finally(() => { pending = null; });
  }
  return {
    setEnabled(enabled) {
      if (closed || enabled === Boolean(child)) return;
      if (!enabled) {
        const previous = child; child = null;
        previous?.kill();
        send({ available: false });
        return;
      }
      if (Date.now() < retryAfter) return;
      const process = launch(path.join(global.process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'tools/companion-activity.ps1')],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
      child = process;
      const lines = createInterface({ input: process.stdout });
      lines.on('line', line => {
        if (closed || child !== process) return;
        try { send(JSON.parse(line.replace(/^\uFEFF/, ''))); } catch { send({ available: false }); }
      });
      function stopped() {
        lines.close();
        if (child !== process) return;
        child = null;
        retryAfter = Date.now() + 60000;
        send({ available: false });
      }
      process.on('error', stopped);
      process.on('exit', stopped);
    },
    close() { this.setEnabled(false); closed = true; return pending; }
  };
}
module.exports = { createActivitySensor };
