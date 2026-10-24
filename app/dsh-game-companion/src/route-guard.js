import { randomBytes, timingSafeEqual } from 'node:crypto';

// DSH's own login does not cover plugin routes, so every /game-companion/* request
// must come from this machine by name, from this origin, and carry the session cookie
// that only the desktop window can read from the plugin's data directory.
export const sessionCookie = 'whale_companion';
export const sessionFile = 'overlay-session.txt';

export function newSessionToken() { return randomBytes(32).toString('base64url'); }

export function guardRequest(req, token, { control = false } = {}) {
  const host = req.headers.host ?? '';
  const port = req.socket?.localPort;
  if (!port || !['127.0.0.1', 'localhost', '[::1]'].some(name => host === `${name}:${port}`)) return 403;
  const origin = req.headers.origin;
  if (origin !== undefined && origin !== `http://${host}`) return 403;
  const site = req.headers['sec-fetch-site'];
  if (site !== undefined && !['same-origin', 'none'].includes(site)) return 403;
  const value = String(req.headers.cookie ?? '').split(';').map(part => part.trim())
    .find(part => part.startsWith(`${sessionCookie}=`))?.slice(sessionCookie.length + 1) ?? '';
  const given = Buffer.from(value), expected = Buffer.from(token);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return 401;
  if (control && (req.method !== 'POST' || req.headers['x-companion-control'] !== '1')) return 403;
  return 0;
}
