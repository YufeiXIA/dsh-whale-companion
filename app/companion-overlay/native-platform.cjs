const path = require('node:path');

function activityCommand(root, { once = false, primary = false, excludeProcessId = process.pid, platform = process.platform } = {}) {
  if (platform === 'darwin') {
    return { file: path.join(root, 'tools/macos/WhaleNativeBridge'),
      args: [once ? 'sample' : 'activity', ...(primary ? ['--primary'] : []), '--exclude-process', String(excludeProcessId)] };
  }
  if (platform !== 'win32') throw new Error(`Unsupported native companion platform: ${platform}`);
  return { file: path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'tools/companion-activity.ps1'),
      ...(once ? ['-Once'] : []), ...(primary ? ['-PrimaryWindow', '-ExcludeProcessId', String(excludeProcessId)] : [])] };
}

function trackerCommand(root, { excludeProcessId = process.pid, platform = process.platform } = {}) {
  if (platform === 'darwin') {
    return { file: path.join(root, 'tools/macos/WhaleNativeBridge'), args: ['tracker', '--exclude-process', String(excludeProcessId)] };
  }
  if (platform !== 'win32') throw new Error(`Unsupported native companion platform: ${platform}`);
  return { file: path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'tools/companion-window-tracker.ps1'),
      '-ExcludeProcessId', String(excludeProcessId)] };
}

module.exports = { activityCommand, trackerCommand };
