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

// Prefer the top edge when the whole overlay fits. Otherwise sit inside the
// visible window, keeping speech and the composer on the monitor as well.
function perchFailure(rect, display, scale = 1) {
  if (!rect) return 'missing';
  if (rect.x >= display.x + display.width || rect.x + rect.width <= display.x ||
      rect.y >= display.y + display.height || rect.y + rect.height <= display.y) return 'offscreen';
  return null;
}
function perchRoute(bounds, rect, display, scale = 1, anchor = null) {
  if (perchFailure(rect, display, scale)) return null;
  const clamp=(value,min,max)=>Math.max(min,Math.min(Math.max(min,max),value));
  const desired = anchor === null ? bounds.x + bounds.width / 2 : rect.x + rect.width * anchor;
  const margin=Math.min(80*scale,rect.width/2);
  const centre=clamp(desired,rect.x+margin,rect.x+rect.width-margin);
  const target=Math.round(clamp(centre-bounds.width/2,display.x+12,display.x+display.width-bounds.width-12));
  const edgeY=rect.y-bounds.height+feetOffset(scale)+6;
  const placement=edgeY>=display.y+12&&edgeY+bounds.height<=display.y+display.height-12?'edge':'inside';
  const visibleBottom=Math.min(rect.y+rect.height,display.y+display.height);
  const targetY=Math.round(clamp(placement==='edge'?edgeY:visibleBottom-bounds.height-12,
    display.y+12,display.y+display.height-bounds.height-12));
  return { ...bounds, kind: 'point', target, targetY, area: display, direction: target >= bounds.x ? 1 : -1,
    placement,anchor: (centre-rect.x)/rect.width };
}

function perchKeepsVisible(sample, target) { return Boolean(target && sample.windowId === target.windowId); }

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

module.exports = { feetOffset, floorY, quickChatY, strollRoute, perchRoute, perchFailure, perchKeepsVisible, stepFall, createHealthClock };
