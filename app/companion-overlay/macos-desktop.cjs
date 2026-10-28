const permissionPages = Object.freeze({
  screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
});

function windowRect(sample, screen, platform = process.platform) {
  if (!sample?.rect) return null;
  return platform === 'darwin' || sample.coordinateSpace === 'dip' ? sample.rect : screen.screenToDipRect(null, sample.rect);
}

function createDesktopPermissions({ platform = process.platform, systemPreferences, desktopCapturer, openExternal }) {
  const screenAllowed = () => platform !== 'darwin' || systemPreferences.getMediaAccessStatus('screen') === 'granted';
  function status() {
    return { platform, screen: platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'granted',
      accessibility: platform !== 'darwin' || systemPreferences.isTrustedAccessibilityClient(false) };
  }
  async function perform(action) {
    if (!['status', 'screen', 'accessibility', 'screen-settings', 'accessibility-settings'].includes(action)) throw new Error('Unknown permission action');
    if (platform !== 'darwin' || action === 'status') return status();
    if (action.endsWith('-settings')) await openExternal(permissionPages[action.slice(0, -9)]);
    else if (action === 'accessibility') systemPreferences.isTrustedAccessibilityClient(true);
    else if (!screenAllowed()) {
      // A zero-sized source request asks macOS for consent without keeping screenshot pixels.
      await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 }, fetchWindowIcons: false }).catch(() => {});
      if (!screenAllowed()) await openExternal(permissionPages.screen);
    }
    return status();
  }
  return { status, perform, screenAllowed };
}

module.exports = { windowRect, createDesktopPermissions };
