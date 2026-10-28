// Builds the standalone app: copies only the files it needs into outputs/lite-stage
// (same folder layout as the repo, so relative imports keep working), then runs electron-builder.
//   ELECTRON_DIST   folder with electron.exe 44 (default: tools/electron44)
//   WHALE_PET_SOURCE  unpacked @luweiyabo/dsh-whale-pet package; downloaded with npm pack when unset
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const lite = join(repo, 'lite');
const stage = join(repo, 'outputs/lite-stage');
const dist = join(repo, 'outputs/lite-dist');
const electronDist = process.env.ELECTRON_DIST || join(repo, 'tools/electron44');
const pkg = JSON.parse(await readFile(join(lite, 'package.json'), 'utf8'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

if (!existsSync(join(electronDist, 'electron.exe'))) throw new Error(`electron.exe not found in ${electronDist}; set ELECTRON_DIST`);

async function cleanOutput(directory) {
  const child = relative(resolve(repo, 'outputs'), resolve(directory));
  if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Build output must stay inside outputs/');
  await rm(directory, { recursive: true, force: true });
}

async function petSource() {
  if (process.env.WHALE_PET_SOURCE) return process.env.WHALE_PET_SOURCE;
  const downloads = join(repo, 'outputs/lite-pet');
  await cleanOutput(downloads);
  await mkdir(downloads, { recursive: true });
  const file = execFileSync(npm, ['pack', '@luweiyabo/dsh-whale-pet@0.1.3', '--silent'], { cwd: downloads, encoding: 'utf8', shell: true }).trim();
  execFileSync('tar', ['-xzf', file], { cwd: downloads });
  return join(downloads, 'package');
}

await cleanOutput(stage);
const copy = (from, to = from, options = {}) => cp(join(repo, from), join(stage, to), { recursive: true, ...options });

await copy('lite/main.cjs');
await copy('lite/release-check.cjs');
await copy('lite/persona.md');
await copy('lite/host');
await copy('tools/companion-activity.ps1');
await copy('tools/companion-window-tracker.ps1');
await copy('tools/companion-window-tracker.cs');
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
await cp(join(repo, 'app/companion-overlay/assets/whale-gaming-v3.ico'), join(stage, 'build/icon.ico'));
await writeFile(join(stage, 'package.json'), JSON.stringify({
  name: 'whale-companion-lite', productName: '大肥鱼', version: pkg.version, description: pkg.description,
  author: pkg.author, license: 'SEE LICENSE IN LICENSE', main: 'lite/main.cjs',
  build: {
    appId: 'io.github.yufeixia.whale-companion', productName: '大肥鱼', executableName: 'WhaleCompanion',
    electronVersion: '44.0.0', electronDist, asar: false, npmRebuild: false, electronLanguages: ['zh-CN', 'en-US'],
    directories: { output: dist, buildResources: 'build' },
    files: ['**/*', '!build/**'],
    win: { target: ['nsis', 'zip'], icon: 'build/icon.ico' },
    nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, installerLanguages: ['zh_CN'],
      language: '2052', shortcutName: '大肥鱼', artifactName: 'WhaleCompanion-Lite-${version}-Setup.${ext}' },
    // Used by the zip (portable) target; the installer names itself above.
    artifactName: 'WhaleCompanion-Lite-${version}-Portable.${ext}'
  }
}, null, 2));

await cleanOutput(dist);
execFileSync(process.execPath, [join(lite, 'node_modules/electron-builder/out/cli/cli.js'),
  '--win', '--x64', '--projectDir', stage], { stdio: 'inherit' });
