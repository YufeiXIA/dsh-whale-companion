import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export async function loadState(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}

export function stateWriter(file) {
  let pending = Promise.resolve();
  return value => {
    const serialized = JSON.stringify(value, null, 2);
    pending = pending.then(async () => {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(`${file}.tmp`, serialized, 'utf8');
      // Windows can briefly deny replacement while another reader closes the
      // destination. Keep the old file intact and bound retries to this case.
      for (let attempt = 0; ; attempt++) {
        try { await rename(`${file}.tmp`, file); break; }
        catch (error) {
          if (process.platform !== 'win32' || !['EPERM', 'EBUSY'].includes(error.code) || attempt === 4) throw error;
          await delay(25 * (attempt + 1));
        }
      }
    });
    return pending;
  };
}
