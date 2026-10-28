const test = require('node:test');
const assert = require('node:assert/strict');
const { windowRect, createDesktopPermissions } = require('./macos-desktop.cjs');

test('native Mac point geometry remains unchanged while Windows physical pixels are converted', () => {
  const rect = { x: -1440, y: 80, width: 1200, height: 760 }, screen = { screenToDipRect: (_, value) => ({ ...value, width: value.width / 2 }) };
  assert.equal(windowRect({ rect }, screen, 'darwin'), rect);
  assert.equal(windowRect({ rect, coordinateSpace: 'dip' }, screen, 'win32'), rect);
  assert.equal(windowRect({ rect }, screen, 'win32').width, 600);
});

test('Mac permission checks never prompt; only explicit actions request the relevant system permission', async () => {
  let screen = 'denied', trusted = false; const prompts = [], requests = [], pages = [];
  const permissions = createDesktopPermissions({ platform: 'darwin',
    systemPreferences: { getMediaAccessStatus: () => screen, isTrustedAccessibilityClient(prompt) { if (prompt) prompts.push('accessibility'); return trusted; } },
    desktopCapturer: { async getSources(options) { requests.push(options); } }, openExternal: async url => pages.push(url) });
  assert.equal(permissions.screenAllowed(), false);
  assert.deepEqual(await permissions.perform('status'), { platform: 'darwin', screen: 'denied', accessibility: false });
  assert.deepEqual(prompts, []); assert.deepEqual(requests, []);
  await permissions.perform('accessibility'); assert.deepEqual(prompts, ['accessibility']); assert.equal(requests.length, 0);
  await permissions.perform('screen'); assert.deepEqual(requests[0].thumbnailSize, { width: 0, height: 0 });
  assert.match(pages[0], /Privacy_ScreenCapture$/);
  screen = 'granted'; trusted = true;
  assert.equal(permissions.screenAllowed(), true);
  await permissions.perform('screen'); assert.equal(requests.length, 1);
  screen = 'denied'; assert.equal(permissions.screenAllowed(), false, 'revocation is checked without a cached permission');
  await assert.rejects(permissions.perform('https://untrusted.test/'), /Unknown permission action/);
});

test('Windows does not call macOS permission APIs or open settings', async () => {
  const unexpected = () => { throw Error('Mac API called on Windows'); };
  const permissions = createDesktopPermissions({ platform: 'win32', systemPreferences: {}, desktopCapturer: { getSources: unexpected }, openExternal: unexpected });
  assert.equal(permissions.screenAllowed(), true);
  assert.equal((await permissions.perform('screen')).accessibility, true);
});
