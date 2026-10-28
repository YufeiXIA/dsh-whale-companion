// Standalone desktop pet: runs the chat host in this process, then reuses the DSH build's overlay.
const { app, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const releaseCheck = process.argv.includes('--release-check');
if (releaseCheck) {
  if (!process.env.WHALE_RELEASE_CHECK_DIR) throw new Error('Release check requires an isolated data directory');
  app.setPath('userData', path.resolve(process.env.WHALE_RELEASE_CHECK_DIR));
}
const data = app.getPath('userData');
const output = path.join(data, 'runtime');

// API keys are encrypted with the Windows account (DPAPI) and never sent to the panel.
function secretStore(file) {
  const values = new Map();
  try {
    for (const [name, value] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')))) {
      try { values.set(name, safeStorage.decryptString(Buffer.from(value, 'base64'))); } catch { /* unreadable on this account */ }
    }
  } catch { /* first run */ }
  const persist = () => {
    const saved = Object.fromEntries([...values].map(([name, value]) => [name, safeStorage.encryptString(value).toString('base64')]));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(saved));
    fs.renameSync(`${file}.tmp`, file);
  };
  return {
    get: name => values.get(name) ?? null,
    hint: name => (values.has(name) ? `···${values.get(name).slice(-4)}` : null),
    set(name, value) {
      if (value === null) values.delete(name);
      else {
        if (!safeStorage.isEncryptionAvailable()) throw new Error('这台电脑没法加密保存 Key');
        values.set(name, value);
      }
      persist();
    }
  };
}

let server;
const ready = app.whenReady().then(async () => {
  const [{ LiteHost }, { startServer }] = await Promise.all([import('./host/host.mjs'), import('./host/server.mjs')]);
  const host = new LiteHost({ dataDir: data, secrets: secretStore(path.join(data, 'secrets.json')),
    persona: fs.readFileSync(path.join(__dirname, 'persona.md'), 'utf8').trim() });
  await host.initialize();
  server = await startServer(host, { petDir: process.env.WHALE_PET_DIR || path.join(__dirname, 'pet') });
  return { base: server.base, token: server.token };
});
// Keeps an unhandled rejection quiet until the overlay awaits it and shows the error dialog.
ready.catch(() => {});
app.on('will-quit', () => { void server?.close(); });

global.whaleLite = { data, output, ready };
// Start as the desktop pet rather than the game overlay.
if (!process.argv.includes('--desktop-companion')) process.argv.push('--desktop-companion');
require('../app/companion-overlay/main.cjs');
