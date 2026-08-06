// Temporary. Issue #149: the package, where an installed one lives.
//
// `out/` sits inside the repository, so a module the package does not ship is
// still resolvable one directory above it. This copies the package outside the
// tree and forks its engine bundle from there, which is what an installed
// application resolves.

import { cp, rm, mkdtemp } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

const require = createRequire(import.meta.url);

const source = path.resolve(process.argv[2] ?? '');
const scratch = await mkdtemp(path.join(tmpdir(), 'probe149-'));
const installed = path.join(scratch, path.basename(source));

await cp(source, installed, { recursive: true, verbatimSymlinks: true });
console.log(`[relocate] ${source} -> ${installed}`);

const worker =
  process.platform === 'win32'
    ? path.join(installed, 'resources', 'app.asar', '.vite', 'build', 'llama-worker.js')
    : path.join(
        installed,
        'Stuffbucket.app',
        'Contents',
        'Resources',
        'app.asar',
        '.vite',
        'build',
        'llama-worker.js',
      );

const electron = require('electron');
const child = spawn(
  electron,
  [path.join(process.cwd(), 'probe', 'engine-main.js'), worker],
  { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' } },
);
child.stdout.on('data', (chunk) => process.stdout.write(chunk));
child.stderr.on('data', (chunk) => process.stdout.write(chunk));
child.on('exit', (code) => {
  void rm(scratch, { recursive: true, force: true }).then(() => {
    console.log(`[relocate] exited code=${String(code)}`);
    process.exit(0);
  });
});
