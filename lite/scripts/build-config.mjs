import { join } from 'node:path';

export function buildOptions(args = [], platform = process.platform) {
  const known = new Set(['--mac', '--win', '--arm64', '--x64', '--stage-only']);
  for (const arg of args) if (!known.has(arg)) throw new Error(`Unknown build option: ${arg}`);
  if (args.includes('--mac') && args.includes('--win')) throw new Error('Choose --mac or --win');
  const mac = args.includes('--mac') || (!args.includes('--win') && platform === 'darwin');
  const arch = mac ? 'arm64' : 'x64';
  if ((mac && args.includes('--x64')) || (!mac && args.includes('--arm64'))) {
    throw new Error('Supported targets are macOS arm64 and Windows x64');
  }
  const stageOnly = args.includes('--stage-only');
  if (mac && platform !== 'darwin' && !stageOnly) {
    throw new Error('macOS packaging requires macOS with Xcode command line tools; use --mac --stage-only to inspect files on this host');
  }
  return { mac, arch, stageOnly, suffix: mac ? '-mac-arm64' : '' };
}

export function builderConfig({ repo, options, electronDist }) {
  const config = {
    appId: 'io.github.yufeixia.whale-companion', productName: '大肥鱼', executableName: 'WhaleCompanion',
    electronVersion: '44.0.0', asar: false, npmRebuild: false, electronLanguages: ['zh-CN', 'en-US'],
    directories: { output: join(repo, `outputs/lite-dist${options.suffix}`), buildResources: 'build' },
    files: ['**/*', '!build/**'],
    artifactName: 'WhaleCompanion-Lite-${version}-Portable.${ext}'
  };
  if (electronDist) config.electronDist = electronDist;
  if (options.mac) {
    config.mac = {
      target: [{ target: 'dmg', arch: ['arm64'] }, { target: 'zip', arch: ['arm64'] }],
      icon: 'build/icon.icns', category: 'public.app-category.entertainment', minimumSystemVersion: '13.0',
      identity: '-', hardenedRuntime: false, notarize: false,
      binaries: ['Contents/Resources/app/tools/macos/WhaleNativeBridge'],
      artifactName: 'WhaleCompanion-Lite-${version}-macOS-${arch}.${ext}',
      extendInfo: {
        NSScreenCaptureUsageDescription: '大肥鱼在你启用屏幕感知后读取屏幕内容，用于理解当前桌面并回应。',
        NSAccessibilityUsageDescription: '大肥鱼使用辅助功能读取前台窗口位置和移动、最小化状态，让桌宠跟随窗口。'
      }
    };
    config.dmg = { sign: false };
  } else {
    config.win = { target: ['nsis', 'zip'], icon: 'build/icon.ico' };
    config.nsis = {
      oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, installerLanguages: ['zh_CN'],
      language: '2052', shortcutName: '大肥鱼', artifactName: 'WhaleCompanion-Lite-${version}-Setup.${ext}'
    };
  }
  return config;
}
