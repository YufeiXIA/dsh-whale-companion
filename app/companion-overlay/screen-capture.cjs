// One frame of the active window, kept in memory only and handed straight to the upload.
// Sensitive windows (flagged by the activity sampler) and changed windows never yield bytes.
function createScreenCapture({ getSources, inspect, upload, onCapture = () => {}, isAllowed = () => true }) {
  let busy = false, closed = false;
  return {
    async capture(ticket, expected) {
      if (busy || closed) return;
      busy = true;
      try {
        if (!isAllowed()) return await upload({ ticket, unavailable: true });
        const before = await inspect();
        if (!isAllowed() || !before.available || before.sensitive || before.app !== expected.app || before.windowId !== expected.windowId || before.idleMs >= 120000) {
          return await upload({ ticket, unavailable: true });
        }
        const sources = await getSources({ types: ['window'], thumbnailSize: { width: 1280, height: 720 }, fetchWindowIcons: false });
        const source = sources.find(source => source.id.split(':')[1] === before.windowId);
        const after = await inspect();
        if (!isAllowed() || !source || source.thumbnail.isEmpty() || !after.available || after.sensitive || before.windowId !== after.windowId || before.app !== after.app || closed) {
          return await upload({ ticket, unavailable: true });
        }
        const bytes = source.thumbnail.toJPEG(72);
        if (!isAllowed() || bytes.length > 1000000) return await upload({ ticket, unavailable: true });
        onCapture();
        await upload({ ticket, jpeg: bytes.toString('base64') });
      } catch {
        await upload({ ticket, unavailable: true }).catch(() => {});
      } finally {
        busy = false;
      }
    },
    close() { closed = true; }
  };
}
module.exports = { createScreenCapture };
