// Stage the app with its original layout, then package Windows x64 or macOS arm64.
// --stage-only skips native tools, icons and packaging for source inspection on any host.
//   ELECTRON_DIST   extracted Electron 44 (Windows default: tools/electron44; Mac downloads when unset)
//   WHALE_PET_SOURCE  unpacked @luweiyabo/dsh-whale-pet package; downloaded with npm pack when unset
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { buildOptions, builderConfig } from './build-config.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const lite = join(repo, 'lite');
const options = buildOptions(process.argv.slice(2));
const stage = join(repo, `outputs/lite-stage${options.suffix}`);
const dist = join(repo, `outputs/lite-dist${options.suffix}`);
const electronDist = process.env.ELECTRON_DIST || (options.mac ? undefined : join(repo, 'tools/electron44'));
const pkg = JSON.parse(await readFile(join(lite, 'package.json'), 'utf8'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

if (!options.stageOnly && electronDist) {
  const executable = options.mac ? 'Electron.app/Contents/MacOS/Electron' : 'electron.exe';
  if (!existsSync(join(electronDist, executable))) throw new Error(`${executable} not found in ${electronDist}; set ELECTRON_DIST`);
}

async function cleanOutput(directory) {
  const child = relative(resolve(repo, 'outputs'), resolve(directory));
  if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Build output must stay inside outputs/');
  await rm(directory, { recursive: true, force: true });
}

async function petSource() {
  if (process.env.WHALE_PET_SOURCE) return process.env.WHALE_PET_SOURCE;
  const downloads = join(repo, `outputs/lite-pet${options.suffix}`);
  await cleanOutput(downloads);
  await mkdir(downloads, { recursive: true });
  const file = execFileSync(npm, ['pack', '@luweiyabo/dsh-whale-pet@0.1.3', '--silent'], {
    cwd: downloads, encoding: 'utf8', shell: process.platform === 'win32',
    env: { ...process.env, npm_config_cache: join(downloads, 'npm-cache') }
  }).trim();
  execFileSync('tar', ['-xzf', file], { cwd: downloads });
  return join(downloads, 'package');
}

await cleanOutput(stage);
const copy = (from, to = from, options = {}) => cp(join(repo, from), join(stage, to), { recursive: true, ...options });

await copy('lite/main.cjs');
await copy('lite/release-check.cjs');
await copy('lite/persona.md');
await copy('lite/host');
if (options.mac) {
  await copy('tools/macos/WhaleNativeBridge.swift');
} else {
  await copy('tools/companion-activity.ps1');
  await copy('tools/companion-window-tracker.ps1');
  await copy('tools/companion-window-tracker.cs');
}
await copy('LICENSE');
await copy('THIRD_PARTY_ASSETS.md');
await copy('app/dsh-game-companion/package.json');
await copy('app/dsh-game-companion/src');
await copy('app/dsh-game-companion/persona');
await copy('app/dsh-game-companion/public');
// Test and check scripts stay out; main.cjs only loads them behind test flags.
await copy('app/companion-overlay', 'app/companion-overlay', {
  filter: source => !/(\.test\.cjs|-check\.cjs|smoke\.cjs|README\.md)$/.test(source)
});

const pet = await petSource();
await cp(join(pet, 'assets/thumb'), join(stage, 'lite/pet'), { recursive: true });
for (const file of ['LICENSE', 'THIRD_PARTY_ASSETS.md']) await cp(join(pet, file), join(stage, 'lite/pet', file));
const clips = (await readdir(join(stage, 'lite/pet'), { recursive: true })).filter(name => name.endsWith('.webm'));
if (clips.length !== 95) throw new Error(`Expected 95 original animations, found ${clips.length}`);

await mkdir(join(stage, 'build'), { recursive: true });
if (options.mac && !options.stageOnly) {
  const helper = join(stage, 'tools/macos/WhaleNativeBridge');
  execFileSync('xcrun', ['swiftc', '-O', '-swift-version', '5', '-target', 'arm64-apple-macos13.0',
    join(stage, 'tools/macos/WhaleNativeBridge.swift'), '-o', helper], { stdio: 'inherit' });
  execFileSync(helper, ['--self-test'], { stdio: 'inherit' });
  const iconset = join(stage, 'build/icon.iconset');
  await mkdir(iconset, { recursive: true });
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      const pixels = String(size * scale);
      execFileSync('sips', ['-s', 'format', 'png', '-z', pixels, pixels,
        join(repo, 'app/dsh-game-companion/public/art/portrait.png'), '--out',
        join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`)], { stdio: 'pipe' });
    }
  }
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(stage, 'build/icon.icns')], { stdio: 'inherit' });
} else if (!options.mac) {
  await cp(join(repo, 'app/companion-overlay/assets/whale-gaming-v3.ico'), join(stage, 'build/icon.ico'));
}
await writeFile(join(stage, 'package.json'), JSON.stringify({
  name: 'whale-companion-lite', productName: '大肥鱼', version: pkg.version, description: pkg.description,
  author: pkg.author, license: 'SEE LICENSE IN LICENSE', main: 'lite/main.cjs',
  build: builderConfig({ repo, options, electronDist })
}, null, 2));

console.log(`Staged ${options.mac ? 'macOS arm64' : 'Windows x64'}: ${stage}`);
if (!options.stageOnly) {
  await cleanOutput(dist);
  execFileSync(process.execPath, [join(lite, 'node_modules/electron-builder/out/cli/cli.js'),
    options.mac ? '--mac' : '--win', `--${options.arch}`, '--publish', 'never', '--projectDir', stage], { stdio: 'inherit' });
}
