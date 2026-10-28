import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { buildOptions, builderConfig } from '../scripts/build-config.mjs';

test('native defaults and cross-host staging select only supported targets', () => {
  assert.deepEqual(buildOptions([], 'darwin'), { mac: true, arch: 'arm64', stageOnly: false, suffix: '-mac-arm64' });
  assert.equal(buildOptions([], 'win32').arch, 'x64');
  assert.equal(buildOptions(['--mac', '--stage-only'], 'win32').stageOnly, true);
  assert.throws(() => buildOptions(['--mac'], 'win32'), /requires macOS/);
  assert.throws(() => buildOptions(['--mac', '--x64'], 'darwin'), /Supported targets/);
  assert.throws(() => buildOptions(['--mac', '--win'], 'darwin'), /Choose/);
});

test('Mac config isolates outputs, signs ad-hoc, and lets builder download Electron', () => {
  const config = builderConfig({ repo: '/repo', options: buildOptions([], 'darwin') });
  assert.equal(config.directories.output, join('/repo', 'outputs/lite-dist-mac-arm64'));
  assert.equal(config.appId, 'io.github.yufeixia.whale-companion');
  assert.equal(config.electronVersion, '44.0.0');
  assert.equal(config.electronDist, undefined);
  assert.deepEqual(config.mac.target, [{ target: 'dmg', arch: ['arm64'] }, { target: 'zip', arch: ['arm64'] }]);
  assert.equal(config.mac.minimumSystemVersion, '13.0');
  assert.equal(config.mac.identity, '-');
  assert.equal(config.mac.notarize, false);
  assert.equal(config.mac.hardenedRuntime, false);
  assert.equal(config.mac.artifactName, 'WhaleCompanion-Lite-${version}-macOS-${arch}.${ext}');
  assert.ok(config.mac.extendInfo.NSScreenCaptureUsageDescription);
  assert.ok(config.mac.extendInfo.NSAccessibilityUsageDescription);
  const require = createRequire(import.meta.url);
  const { validateSchema } = require('app-builder-lib/out/util/config/schemaValidator.js');
  const schema = require('app-builder-lib/scheme.json');
  // Validate against the installed, pinned electron-builder 26.17 schema.
  validateSchema(schema, config, { name: 'electron-builder' });
});

test('Windows config retains cached Electron override, installer and portable targets', () => {
  const config = builderConfig({ repo: '/repo', options: buildOptions([], 'win32'), electronDist: '/cached/electron44' });
  assert.equal(config.directories.output, join('/repo', 'outputs/lite-dist'));
  assert.equal(config.electronDist, '/cached/electron44');
  assert.deepEqual(config.win.target, ['nsis', 'zip']);
  assert.equal(config.nsis.artifactName, 'WhaleCompanion-Lite-${version}-Setup.${ext}');
  assert.equal(config.artifactName, 'WhaleCompanion-Lite-${version}-Portable.${ext}');
  assert.equal(config.mac, undefined);
});
