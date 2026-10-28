const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const path = require('node:path');

function createWindowTracker({ root, excludeProcessId, update, launch = spawn }) {
  let child = null, serial = 0;
  const pending = new Map();
  function start() {
    if (child) return;
    const process = launch(path.join(global.process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'tools/companion-window-tracker.ps1'),
        '-ExcludeProcessId', String(excludeProcessId)], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    child = process;
    const lines = createInterface({ input: process.stdout });
    lines.on('line', line => {
      if (child !== process) return;
      let event;
      try { event = JSON.parse(line.replace(/^\uFEFF/, '')); } catch { return; }
      if (event.kind === 'selected') {
        const request = pending.get(event.requestId);
        if (request) { clearTimeout(request.timer); pending.delete(event.requestId); request.resolve(event); }
      } else if (event.kind === 'window') update(event);
    });
    function stopped() {
      if (child !== process) return;
      child = null; lines.close();
      for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('窗口识别服务暂时不可用，请再试一次。')); }
      pending.clear(); update({ status: 'unavailable' });
    }
    process.on('error', stopped); process.on('exit', stopped); process.stdin.on('error', stopped);
  }
  return {
    start,
    select() {
      start();
      return new Promise((resolve, reject) => {
        const id = ++serial;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('这次识别窗口超时了，请再试一次。')); }, 5000);
        pending.set(id, { resolve, reject, timer }); child.stdin.write(`select ${id}\n`);
      });
    },
    track(target) { child?.stdin.write(`track ${target.windowId} ${target.processId}\n`); },
    clear() { child?.stdin.write('clear\n'); },
    close() {
      const previous = child; child = null; previous?.kill();
      for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('窗口识别已停止。')); }
      pending.clear();
    }
  };
}
module.exports = { createWindowTracker };
