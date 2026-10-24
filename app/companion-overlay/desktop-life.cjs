// Small desktop behaviours driven by the local activity sampler. Window rectangles and
// fullscreen state stay in this process; nothing here is sent to the companion service.
const { compactFooter } = require('./roaming.cjs');

// Distance from the window's bottom edge to the character's feet.
function feetOffset(scale) { return compactFooter(scale) + 43 * scale; }

// Window y that puts her feet just on the taskbar (the bottom of the work area).
function floorY(area, height, scale) { return Math.round(area.y + area.height - height + feetOffset(scale) - 4); }

function quickChatY(bounds, area) { return Math.min(bounds.y, area.y + area.height - bounds.height); }

function strollRoute(bounds, area, direction, random = Math.random, scale = 1) {
  const minX = area.x, maxX = Math.max(minX, area.x + area.width - bounds.width);
  let step = direction * (80 + random() * 200), target = bounds.x + step;
  if (target < minX || target > maxX) { step = -step; target = bounds.x + step; }
  target = Math.round(Math.min(maxX, Math.max(minX, target)));
  if (Math.abs(target - bounds.x) < 24) return null;
  return { ...bounds, kind: 'point', target, targetY: floorY(area, bounds.height, scale), area, direction: target >= bounds.x ? 1 : -1 };
}

// Sit on the top edge of a window; maximised windows and slivers have no room.
function perchRoute(bounds, rect, display, scale = 1) {
  if (!rect || rect.width < 220 || rect.y - 170 * scale < display.y) return null;
  const centre = Math.min(rect.x + rect.width - 80 * scale, Math.max(rect.x + 80 * scale, bounds.x + bounds.width / 2));
  const target = Math.round(centre - bounds.width / 2), targetY = Math.round(rect.y - bounds.height + feetOffset(scale) + 6);
  return { ...bounds, kind: 'point', target, targetY, area: display, direction: target >= bounds.x ? 1 : -1 };
}

// Only the window in front is visible to the sampler, so the perch holds while she cannot see it
// and is lost when that window, back in front, has moved, resized or been minimised.
function perchLost(perch, sample) {
  if (!sample.available || sample.windowId !== perch.windowId) return false;
  if (!sample.rect) return true;
  const a = perch.rect, b = sample.rect;
  return Math.abs(a.x - b.x) > 4 || Math.abs(a.y - b.y) > 4 || Math.abs(a.width - b.width) > 4;
}

// Gravity with one soft bounce, in DIP and milliseconds.
function stepFall(state, floor, dt) {
  let { y, vy, bounced } = state;
  vy += 0.0028 * dt; y += vy * dt;
  if (y >= floor) {
    y = floor;
    if (!bounced && vy > 0.35) { vy = -vy * 0.28; bounced = true; }
    else return { y, vy: 0, bounced, done: true };
  }
  return { y, vy, bounced, done: false };
}

// Reminders only fire while the user is at the computer; a five-minute break resets the sitting clock.
function createHealthClock({ waterMinutes = 60, stretchMinutes = 50, breakMinutes = 5, now = Date.now, hour = () => new Date().getHours(),
  day = () => new Date().toDateString() } = {}) {
  let activeSince = null, lastWater = now(), lateDay = null;
  return {
    sample(sample) {
      const time = now();
      if (!sample.available || sample.fullscreen) return null;
      if (sample.idleMs >= breakMinutes * 60000) { activeSince = null; return null; }
      activeSince ??= time;
      if (hour() >= 1 && hour() < 5 && lateDay !== day()) { lateDay = day(); return 'late'; }
      if (time - activeSince >= stretchMinutes * 60000) { activeSince = time; return 'stretch'; }
      if (time - lastWater >= waterMinutes * 60000) { lastWater = time; return 'water'; }
      return null;
    }
  };
}

module.exports = { feetOffset, floorY, quickChatY, strollRoute, perchRoute, perchLost, stepFall, createHealthClock };
