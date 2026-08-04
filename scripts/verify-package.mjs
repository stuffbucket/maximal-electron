#!/usr/bin/env node
/**
 * Verify the packaged application.
 *
 * The end-to-end tests deliberately drive the unpackaged build, because the
 * `EnableNodeCliInspectArguments: false` fuse stops Playwright attaching to a
 * packaged binary. That leaves two packaging properties unchecked by any test,
 * and they are exactly the ones that break silently:
 *
 *   1. The asar contains the main, preload, and renderer bundles.
 *   2. The fuses are set to the hardened values in forge.config.ts.
 *
 * This script closes that gap. Run it after `npm run package`.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * `npx`, by the name this platform can actually execute.
 *
 * npm ships `npx.cmd` on Windows. libuv's process spawn appends `.exe` to an
 * extension-less name and does not try `.cmd`, so a bare `npx` fails with
 * ENOENT. That is not a packaging fault, but it failed the Windows job as
 * though it were one.
 */
const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${message}`);
  if (!ok) failures.push(message);
};

/* --------------------------------------------------------------- locate */

function locate() {
  const arch = process.arch;
  if (process.platform === 'darwin') {
    const app = path.join(ROOT, `out/Stuffbucket-darwin-${arch}/Stuffbucket.app`);
    return { app, asar: path.join(app, 'Contents/Resources/app.asar') };
  }
  if (process.platform === 'win32') {
    const dir = path.join(ROOT, `out/Stuffbucket-win32-${arch}`);
    return { app: path.join(dir, 'Stuffbucket.exe'), asar: path.join(dir, 'resources/app.asar') };
  }
  const dir = path.join(ROOT, `out/Stuffbucket-linux-${arch}`);
  return { app: path.join(dir, 'stuffbucket'), asar: path.join(dir, 'resources/app.asar') };
}

const { app, asar } = locate();

console.log('Verifying packaged application');
console.log(`  app:  ${path.relative(ROOT, app)}`);
console.log(`  asar: ${path.relative(ROOT, asar)}\n`);

if (!existsSync(app)) {
  console.error('Packaged application not found. Run `npm run package` first.');
  process.exit(1);
}

/* ----------------------------------------------------------------- asar */

console.log('asar contents');

const listing = execFileSync(
  NPX,
  ['--yes', '@electron/asar', 'list', asar],
  { encoding: 'utf8' },
).split('\n');

const has = (suffix) => listing.some((entry) => entry.endsWith(suffix));

check(has('/.vite/build/main.js'), 'main bundle is packed');
check(has('/.vite/build/preload.js'), 'preload bundle is packed');
check(has('/index.html'), 'renderer shell is packed');
check(has('/splash.html'), 'splash window is packed');
check(
  listing.some((entry) => entry.endsWith('.css')),
  'renderer stylesheet is packed',
);

/* ------------------------------------------------- native module (pty) */

console.log('\nnative modules');

// This check exists because its absence shipped a broken package once.
// `@lydell/node-pty` stays external to the Vite bundle, so it must arrive as
// real files. Forge's Vite plugin excludes all of node_modules by default, so
// the package built cleanly, passed every end-to-end test, and would still
// have failed to open a terminal for a user. The tests missed it because they
// drive the unpackaged build, where node_modules is simply present.
check(
  listing.some((entry) => entry.includes('node_modules/@lydell/node-pty/')),
  'node-pty is packed',
);

check(
  listing.some((entry) => entry.includes('node_modules/node-llama-cpp/')),
  'node-llama-cpp is packed',
);

// The prebuilt binary is unpacked beside the asar, because a .node file cannot
// be loaded from inside one.
const unpacked = path.join(path.dirname(asar), 'app.asar.unpacked');

/**
 * Unpacked files whose name matches a simple `*` glob.
 *
 * This used to shell out to `find`. On Windows that name resolves to
 * `System32\find.exe`, which searches for a string inside files and takes
 * unrelated arguments, so these checks reported a packaging fault that was
 * really a portability one. Reading the directory needs no subprocess and
 * behaves the same everywhere.
 */
const findUnpacked = (pattern) => {
  if (!existsSync(unpacked)) return [];
  const expression = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  const matches = new RegExp(`^${expression}$`);
  return readdirSync(unpacked, { recursive: true, encoding: 'utf8' }).filter(
    (entry) => matches.test(path.basename(entry)),
  );
};

check(findUnpacked('*.node').length > 0, 'a native .node binary is unpacked');

// llama.cpp ships its backends as shared libraries beside the addon, and
// `dlopen` cannot reach into an asar. An `unpack` glob of only `*.node` leaves
// these inside the archive: the package builds, the app starts, and the model
// fails to load with an error that reads like a bad model file rather than a
// packaging fault.
const llamaLibs = [...findUnpacked('libllama*'), ...findUnpacked('libggml*')];
check(llamaLibs.length > 0, 'llama.cpp shared libraries are unpacked');

/* ---------------------------------------------------------------- fuses */

console.log('\nfuse configuration');

// These must mirror the FusesPlugin block in forge.config.ts. A fuse flipped
// there and not here would pass silently, so the two lists are reviewed
// together; AGENTS.md says so.
const EXPECTED = {
  RunAsNode: false,
  EnableCookieEncryption: true,
  EnableNodeOptionsEnvironmentVariable: false,
  EnableNodeCliInspectArguments: false,
  EnableEmbeddedAsarIntegrityValidation: true,
  OnlyLoadAppFromAsar: true,
};

let report = '';
try {
  report = execFileSync(NPX, ['--yes', '@electron/fuses', 'read', '--app', app], {
    encoding: 'utf8',
  });
} catch (error) {
  console.error(`  could not read fuses: ${error.message}`);
  process.exit(1);
}

for (const [name, expected] of Object.entries(EXPECTED)) {
  // The reader prints lines like "RunAsNode is Disabled".
  const match = new RegExp(`${name}\\s+is\\s+(\\w+)`, 'i').exec(report);
  if (!match) {
    check(false, `${name} is reported`);
    continue;
  }
  const enabled = /enabled/i.test(match[1]);
  check(enabled === expected, `${name} is ${expected ? 'Enabled' : 'Disabled'}`);
}

/* --------------------------------------------------------------- result */

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll packaging checks passed.');
