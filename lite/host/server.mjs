import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { guardRequest, newSessionToken } from '../../app/dsh-game-companion/src/route-guard.js';
import { serveAnimation } from '../../app/dsh-game-companion/src/animation-assets.js';
import { VoiceError } from './voice.mjs';

const publicDir = fileURLToPath(new URL('../../app/dsh-game-companion/public/', import.meta.url));
const artTypes = { png: 'image/png', svg: 'image/svg+xml', woff2: 'font/woff2' };
const otherTypes = { script: 'text/javascript; charset=utf-8', wav: 'audio/wav' };

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
}

async function readInput(req, maximumBytes = 8192) {
  const parts = []; let bytes = 0;
  for await (const chunk of req) { bytes += chunk.length; if (bytes > maximumBytes) throw new Error('Request too large'); parts.push(chunk); }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}

// Serves the panel and the same /game-companion/* routes as the DSH plugin, on 127.0.0.1 only.
// `petDir` holds the original animations as <category>/<name>.webm.
export async function startServer(host, { petDir }) {
  const token = newSessionToken();
  // The window title shows in Alt+Tab; the lite app has no game.
  const page = (await readFile(join(publicDir, 'index.html'), 'utf8')).replace('<html lang="zh-CN"', '<html lang="zh-CN" data-lite')
    .replace('<title>鲸鱼游戏搭子</title>', '<title>大肥鱼</title>');
  const streams = new Set();
  const routes = {
    'GET /game-companion/view': (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(page);
    },
    'GET /game-companion/state': (_req, res) => json(res, 200, host.status()),
    // Pushes the /state snapshot only when it changes.
    'GET /game-companion/events': (req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' });
      let last = '', idle = 0;
      const push = () => {
        const body = JSON.stringify(host.status());
        if (body !== last) { last = body; idle = 0; res.write(`data: ${body}\n\n`); }
        else if (++idle >= 60) { idle = 0; res.write(': keep-alive\n\n'); }
      };
      const timer = setInterval(push, 250);
      const stream = () => { clearInterval(timer); res.end(); };
      streams.add(stream);
      req.on('close', () => { clearInterval(timer); streams.delete(stream); });
      push();
    },
    'POST /game-companion/control': async (req, res) => {
      try { json(res, 200, await host.control(await readInput(req, 1400000))); }
      catch (error) { json(res, 400, { error: error.message }); }
    },
    'POST /game-companion/vision': async (req, res) => {
      try { json(res, 200, await host.desktopFrame(await readInput(req, 1400000))); }
      catch { json(res, 400, { error: 'VISION_REQUEST_INVALID' }); }
    },
    'POST /game-companion/voice': async (req, res) => {
      const controller = new AbortController();
      res.on('close', () => { if (!res.writableEnded) controller.abort(); });
      try {
        const bytes = await host.speak(await readInput(req), controller.signal);
        if (controller.signal.aborted) return;
        res.writeHead(200, { 'content-type': 'audio/wav', 'cache-control': 'no-store' });
        res.end(bytes);
      } catch (error) {
        if (!controller.signal.aborted) json(res, 400, { error: error instanceof VoiceError ? error.message : '这次没能出声' });
      }
    }
  };
  const files = [
    [/^\/game-companion\/(touch-interactions|pcm-player)\.js$/, ([, name]) => join(publicDir, `${name}.cjs`), 'script'],
    [/^\/game-companion\/touch-voices\/(?:momo\/|fish\/)?([a-z]+)-(\d+)\.wav$/, match => join(publicDir, 'touch-voices', ...match[0].split('/').slice(3)), 'wav'],
    [/^\/game-companion\/animations\/([a-z0-9_]+)\.webm$/, ([, name]) => join(publicDir, 'animations', `${name}.webm`), 'webm'],
    [/^\/game-companion\/art\/((?:expressions\/|fonts\/)?[a-z0-9_-]+)\.(png|svg|woff2)$/, ([, name, ext]) => join(publicDir, 'art', `${name}.${ext}`), 'art'],
    [/^\/whale-pet\/([a-z]+)\/([a-z0-9_]+)\.webm$/, ([, category, name]) => join(petDir, category, `${name}.webm`), 'webm']
  ];
  const server = createServer(async (req, res) => {
    const denied = guardRequest(req, token, { control: req.method === 'POST' });
    if (denied) return json(res, denied, { error: denied === 401 ? 'Companion session required' : 'Forbidden' });
    const path = new URL(req.url, 'http://127.0.0.1').pathname;
    const route = routes[`${req.method} ${path}`];
    if (route) return route(req, res);
    if (req.method !== 'GET') return json(res, 405, { error: 'GET required' });
    for (const [pattern, resolve, kind] of files) {
      const match = pattern.exec(path);
      if (!match) continue;
      try {
        const bytes = await readFile(resolve(match));
        if (kind === 'webm') return serveAnimation(req, res, bytes);
        const mime = otherTypes[kind] ?? artTypes[match[2]];
        res.writeHead(200, { 'content-type': mime, 'cache-control': 'private, max-age=86400' });
        return res.end(bytes);
      } catch { return json(res, 404, { error: 'Not found' }); }
    }
    json(res, 404, { error: 'Not found' });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return {
    base: `http://127.0.0.1:${server.address().port}/`, token,
    close() { for (const stream of streams) stream(); return new Promise(resolve => server.close(resolve)); }
  };
}
