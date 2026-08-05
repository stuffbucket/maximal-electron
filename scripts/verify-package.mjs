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

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { listPackage } from '@electron/asar';
import { FuseV1Options, getCurrentFuseWire } from '@electron/fuses';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

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

/**
 * asar entries, with forward slashes on every platform.
 *
 * `listPackage` returns paths with the platform separator, so on Windows the
 * entries read `\.vite\build\main.js`. Every check below is written with `/`,
 * which is why seven of them failed there the first time this script ever got
 * far enough on Windows to run: the spawn error had been masking them.
 *
 * Only rewritten where the separator is a separator. A backslash is a legal
 * character in a POSIX filename.
 */
const listing = listPackage(asar).map((entry) =>
  path.sep === '\\' ? entry.replaceAll('\\', '/') : entry,
);

const has = (suffix) => listing.some((entry) => entry.endsWith(suffix));

check(has('/.vite/build/main.js'), 'main bundle is packed');
check(has('/.vite/build/preload.js'), 'preload bundle is packed');
check(has('/index.html'), 'renderer shell is packed');
check(has('/splash.html'), 'splash window is packed');
check(
  listing.some((entry) => entry.endsWith('.css')),
  'renderer stylesheet is packed',
);

// The capture fixture is a screenshot and video prop. It used to sit inside the
// product's own bundle, reachable with a query parameter, and shipped to every
// user. `forge.config.ts` drops it; this is what makes that a fact rather than
// an intention.
check(
  !listing.some((entry) => entry.includes('/renderer/demo_window')),
  'capture fixture is not packed',
);

// Stories live beside the components they cover, inside `src/`. Nothing
// imports them, so Vite should never reach one from an entry point. This is
// the check on that: co-location is convenient right up until a story ends up
// in the application a user installs.
check(
  !listing.some((entry) => entry.includes('.stories.')),
  'stories are not packed',
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
//
// The names are platform specific. Unix builds prefix `lib` and end in
// `.dylib` or `.so`; Windows builds do neither. Checking only the Unix names
// reported a missing library on Windows that was present under its own name.
const LLAMA_LIBRARIES =
  process.platform === 'win32'
    ? ['llama*.dll', 'ggml*.dll']
    : ['libllama*', 'libggml*'];

const llamaLibs = LLAMA_LIBRARIES.flatMap((pattern) => findUnpacked(pattern));
check(llamaLibs.length > 0, 'llama.cpp shared libraries are unpacked');

/* ---------------------------------------------------------------- icons */

console.log('\nicons');

// The main process loads these at run time, from beside the asar. They are not
// in the bundle, so nothing in the build fails when they are missing: the
// window shows a stock Electron icon and the tray silently does not appear.
// `forge.config.ts` copies them out of the directory `STUFFBUCKET_ICON_DIR`
// names, which is the seam a consumer swaps. Keep the two lists together.
const RUNTIME_ICONS = [
  'icon.png',
  'tray.png',
  'trayTemplate.png',
  'trayTemplate@2x.png',
];

const resources = path.dirname(asar);
for (const file of RUNTIME_ICONS) {
  check(existsSync(path.join(resources, file)), `${file} is beside the asar`);
}

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

let wire;
try {
  wire = await getCurrentFuseWire(app);
} catch (error) {
  console.error(`  could not read fuses: ${error.message}`);
  process.exit(1);
}

/**
 * The wire stores each fuse as the character code of '0' or '1'.
 *
 * An unrecognised value fails the check rather than reading as disabled.
 * These are the hardening switches, so "I did not understand the answer" must
 * not look like "the answer was the safe one".
 */
const DISABLED = '0'.charCodeAt(0);
const ENABLED = '1'.charCodeAt(0);

for (const [name, expected] of Object.entries(EXPECTED)) {
  const state = wire[FuseV1Options[name]];

  if (state !== ENABLED && state !== DISABLED) {
    check(false, `${name} reports a state this script understands`);
    continue;
  }

  check(
    (state === ENABLED) === expected,
    `${name} is ${expected ? 'Enabled' : 'Disabled'}`,
  );
}

/* --------------------------------------------------------------- result */

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll packaging checks passed.');
