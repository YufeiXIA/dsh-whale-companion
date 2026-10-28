import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// ASAR entrypoints do not consistently set import.meta.main in Electron's Node mode.
// Call the Desktop CLI's exported entrypoint explicitly with its bundled runtime.
const resources = join(dirname(process.execPath), 'resources');
const runtime = join(resources, 'app.asar', 'dsh');
const cli = join(runtime, 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'cli.js');
const { runDesktopCli } = await import(pathToFileURL(cli).href);
process.argv[1] = cli;
await runDesktopCli(runtime, join(resources, 'runtime'));
