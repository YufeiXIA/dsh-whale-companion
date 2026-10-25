// One visible primary-screen page (or a selected-window test fixture), kept in memory only.
// Sensitive windows (flagged by the activity sampler) and changed windows never yield bytes.
function createScreenCapture({ getSources, inspect, upload, onCapture = () => {}, isAllowed = () => true, getPrimaryDisplay }) {
  let busy = false, closed = false;
  return {
    async capture(ticket, expected) {
      if (busy || closed) return;
      busy = true;
      try {
        if (!isAllowed()) return await upload({ ticket, unavailable: true });
        const before = await inspect();
        if (!isAllowed() || !before.available || before.sensitive || before.captureOverlay || before.app !== expected.app || before.windowId !== expected.windowId) {
          return await upload({ ticket, unavailable: true });
        }
        const primary = getPrimaryDisplay?.();
        const sources = await getSources({ types: [primary ? 'screen' : 'window'], thumbnailSize: { width: 1280, height: 1280 }, fetchWindowIcons: false });
        const source = sources.find(source => primary ? source.display_id === String(primary.id) : source.id.split(':')[1] === before.windowId);
        const after = await inspect();
        if (!isAllowed() || !source || source.thumbnail.isEmpty() || !after.available || after.sensitive || after.captureOverlay || before.windowId !== after.windowId || before.app !== after.app || closed) {
          return await upload({ ticket, unavailable: true });
        }
        let image = source.thumbnail;
        if (primary) {
          if (getPrimaryDisplay().id !== primary.id || JSON.stringify(before.rect) !== JSON.stringify(after.rect)) return await upload({ ticket, unavailable: true });
          const area = before.screenBounds, rect = before.rect, size = image.getSize();
          const x = Math.max(area.x, rect.x), y = Math.max(area.y, rect.y);
          const right = Math.min(area.x + area.width, rect.x + rect.width), bottom = Math.min(area.y + area.height, rect.y + rect.height);
          const leftPx = Math.round((x - area.x) / area.width * size.width), topPx = Math.round((y - area.y) / area.height * size.height);
          const rightPx = Math.round((right - area.x) / area.width * size.width), bottomPx = Math.round((bottom - area.y) / area.height * size.height);
          if (rightPx <= leftPx || bottomPx <= topPx) return await upload({ ticket, unavailable: true });
          image = image.crop({ x: leftPx, y: topPx, width: rightPx - leftPx, height: bottomPx - topPx });
        }
        const bytes = image.toJPEG(72);
        if (!isAllowed() || bytes.length > 1000000) return await upload({ ticket, unavailable: true });
        onCapture();
        await upload({ ticket, jpeg: bytes.toString('base64'), ...(primary ? { source: 'primary-visible-window', sourceApp: before.app } : {}) });
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
