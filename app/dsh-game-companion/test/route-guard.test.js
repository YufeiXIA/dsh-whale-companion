import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply } from '../src/index.js';
import { guardRequest, newSessionToken } from '../src/route-guard.js';

const token = newSessionToken();
const request = ({ host = '127.0.0.1:19388', cookie = `whale_companion=${token}`, method = 'GET', ...headers } = {}) =>
  ({ method, socket: { localPort: 19388 }, headers: { host, ...(cookie === null ? {} : { cookie }), ...headers } });

test('only same-machine, same-origin requests with the session cookie pass', () => {
  assert.equal(guardRequest(request(), token), 0);
  assert.equal(guardRequest(request({ host: 'localhost:19388', origin: 'http://localhost:19388' }), token), 0);
  assert.equal(guardRequest(request({ cookie: null }), token), 401);
  assert.equal(guardRequest(request({ cookie: `other=1; whale_companion=${token.slice(1)}x` }), token), 401);
  assert.equal(guardRequest(request({ host: 'evil.example:19388' }), token), 403);
  assert.equal(guardRequest(request({ host: '127.0.0.1:80' }), token), 403);
  assert.equal(guardRequest(request({ origin: 'http://evil.example' }), token), 403);
  assert.equal(guardRequest(request({ 'sec-fetch-site': 'cross-site' }), token), 403);
  assert.equal(guardRequest(request({ method: 'POST' }), token, { control: true }), 403);
  assert.equal(guardRequest(request({ method: 'POST', 'x-companion-control': '1' }), token, { control: true }), 0);
});

test('every registered companion route refuses requests without the session cookie', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'companion-guard-'));
  const routes = new Map(), effects = [];
  apply({ webServer: { register: spec => { routes.set(spec.path, spec.handler); return () => {}; } },
    effect: effect => effects.push(effect), get: () => ({ listProviders: () => [] }),
    sessionProjections: { register: () => () => {} } }, { dataDir: directory });
  t.after(async () => { for (const effect of effects) await effect()(); await rm(directory, { recursive: true, force: true }); });
  const call = async (path, req) => {
    const res = { status: 0, body: '', writeHead(status) { this.status = status; }, end(body = '') { this.body = String(body); } };
    await routes.get(path)(req, res);
    return res;
  };
  assert.ok(routes.size > 10);
  for (const path of routes.keys()) {
    assert.ok(path.startsWith('/game-companion/'));
    assert.equal((await call(path, request({ cookie: null }))).status, 401, path);
    assert.equal((await call(path, request({ host: 'attacker.test:19388' }))).status, 403, path);
  }
  for (let attempt = 0; attempt < 50; attempt++) {
    try { if ((await readFile(join(directory, 'overlay-session.txt'), 'utf8')).length) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  const issued = (await readFile(join(directory, 'overlay-session.txt'), 'utf8')).trim();
  for (const path of ['/game-companion/control', '/game-companion/vision', '/game-companion/voice']) {
    assert.equal((await call(path, request({ method: 'POST', cookie: `whale_companion=${issued}` }))).status, 403, path);
  }
  const view = await call('/game-companion/view', request({ cookie: `whale_companion=${issued}` }));
  assert.equal(view.status, 200);
  assert.match(view.body, /<html/i);
});
