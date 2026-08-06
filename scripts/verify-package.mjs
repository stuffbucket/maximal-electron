#!/usr/bin/env node
/**
 * Verify the packaged application.
 *
 * The end-to-end tests deliberately drive the unpackaged build, because the
 * `EnableNodeCliInspectArguments: false` fuse stops Playwright attaching to a
 * packaged binary. That leaves three packaging properties unchecked by any
 * test, and they are exactly the ones that break silently:
 *
 *   1. The asar contains the main, preload, and renderer bundles.
 *   2. The renderer documents declare the policy the terminal needs.
 *   3. The fuses are set to the hardened values in package-contract.mjs.
 *
 * This script closes that gap. Run it after `npm run package`.
 */

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { listPackage, extractFile } from '@electron/asar';
import { FuseV1Options, getCurrentFuseWire } from '@electron/fuses';

import { PACKAGE_FUSES, RUNTIME_ICONS } from './package-contract.mjs';
import { terminalPackageChecks } from './terminal-package.mjs';

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

/**
 * Where the renderer build lands inside the archive.
 *
 * Every path below is anchored to it. `endsWith('.css')` over the whole listing
 * was satisfied by any dependency that shipped a stylesheet, and `/index.html`
 * by any that shipped a page: correct for the right reason, one dependency away
 * from not being. Issue #92.
 */
const RENDERER = '/.vite/renderer/main_window';

check(listing.includes('/.vite/build/main.js'), 'main bundle is packed');
check(listing.includes('/.vite/build/preload.js'), 'preload bundle is packed');
check(listing.includes(`${RENDERER}/index.html`), 'renderer shell is packed');
check(listing.includes(`${RENDERER}/splash.html`), 'splash window is packed');
check(listing.includes(`${RENDERER}/overlay.html`), 'overlay window is packed');
check(
  listing.some(
    (entry) => entry.startsWith(`${RENDERER}/assets/index-`) && entry.endsWith('.css'),
  ),
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

/* --------------------------------------------------- content security policy */

console.log('\ncontent security policy');

/**
 * The policy a shipped document declares, or `undefined`.
 *
 * Scoped to the `meta` tag on purpose. `index.html` names `'wasm-unsafe-eval'`
 * in a comment explaining why it is there, so a search of the whole file would
 * pass on the explanation after the grant itself had gone.
 */
function declaredPolicy(document) {
  let html;
  try {
    // `listPackage` reports a leading slash and `extractFile` rejects one.
    html = extractFile(asar, document.replace(/^\//, '')).toString('utf8');
  } catch {
    return undefined;
  }
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!/http-equiv\s*=\s*["']content-security-policy["']/i.test(tag)) continue;
    // Matched to its own delimiter. A policy is full of single quotes, so a
    // pattern that stops at either kind captures `default-src ` and nothing
    // more.
    return /content\s*=\s*(["'])(.*?)\1/is.exec(tag)?.[2];
  }
  return undefined;
}

// Read out of the archive rather than restated here. `ghostty-web` needs two
// grants, and the checks that assert them had never been given a policy to
// measure: removing `'wasm-unsafe-eval'` from the shipped HTML broke the
// terminal and passed every check. Issue #92.
const shellPolicy = declaredPolicy(`${RENDERER}/index.html`);
const overlayPolicy = declaredPolicy(`${RENDERER}/overlay.html`);

check(shellPolicy !== undefined, 'the shell declares a content policy');
// The overlay hosts the same terminal. Its own comment says "Same policy as the
// shell", which is a claim until something reads both.
check(
  overlayPolicy !== undefined && overlayPolicy === shellPolicy,
  'the overlay declares the same policy as the shell',
);

/* ------------------------------------------------- native module (pty) */

console.log('\nnative modules');

// A .node file cannot be loaded from inside an asar, so the prebuilt binaries
// are unpacked beside it.
const unpacked = path.join(path.dirname(asar), 'app.asar.unpacked');
const unpackedFiles = existsSync(unpacked)
  ? readdirSync(unpacked, { recursive: true, encoding: 'utf8' }).map((entry) =>
      entry.split(path.sep).join('/'),
    )
  : [];

// The terminal assertions are the `./verify` export, so a consumer packaging
// `./host/terminal` runs the same checks this build runs rather than a copy
// that drifts. Issue #76.
for (const { name, ok } of terminalPackageChecks({
  packedFiles: listing,
  unpackedFiles,
  platform: process.platform,
  arch: process.arch,
  contentSecurityPolicy: shellPolicy,
})) {
  check(ok, name);
}

check(
  listing.some((entry) => entry.includes('node_modules/node-llama-cpp/')),
  'node-llama-cpp is packed',
);

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
  const expression = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  const matches = new RegExp(`^${expression}$`);
  return unpackedFiles.filter((entry) => matches.test(path.basename(entry)));
};

check(
  findUnpacked('*.node').some((entry) => entry.includes('node-llama-cpp')),
  'the llama.cpp addon is unpacked',
);

// llama.cpp ships its backends as shared libraries beside the addon, and
// `dlopen` cannot reach into an asar. An `unpack` glob of only `*.node` leaves
// these inside the archive: the package builds, the app starts, and the model
// fails to load with an error that reads like a bad model file rather than a
// packaging fault.
//
// The expectation is read from the dependency rather than restated, because
// the set is platform specific in both name and size: mac-arm64-metal installs
// nine, and Windows builds neither prefix `lib` nor end in `.dylib`. A count
// written here would be wrong on the next target.
const LIBRARY_EXTENSIONS = ['.dylib', '.so', '.dll'];
const llamaScope = path.join(ROOT, 'node_modules/@node-llama-cpp');
const shippedLibraries = existsSync(llamaScope)
  ? readdirSync(llamaScope, { recursive: true, encoding: 'utf8' })
      .filter((entry) => LIBRARY_EXTENSIONS.includes(path.extname(entry)))
      .map((entry) => path.basename(entry))
  : [];

// The floor. An empty expectation asserts nothing, which is the shape this
// replaced: two globs flat-mapped into one non-empty assertion, where losing
// all seven `libggml*` still passed on the two `libllama*`. Issue #92.
check(shippedLibraries.length > 0, 'the dependency ships llama.cpp shared libraries');

const unpackedNames = new Set(unpackedFiles.map((entry) => path.basename(entry)));
for (const library of shippedLibraries) {
  check(unpackedNames.has(library), `${library} is unpacked`);
}

/* ---------------------------------------------------------------- icons */

console.log('\nicons');

// The main process loads these at run time, from beside the asar. They are not
// in the bundle, so nothing in the build fails when they are missing: the
// window shows a stock Electron icon and the tray silently does not appear.
// `forge.config.ts` copies them out of the directory `STUFFBUCKET_ICON_DIR`
// names, from the same list this reads.
const resources = path.dirname(asar);

// The floor. An empty list checks nothing and reports it as a pass.
check(RUNTIME_ICONS.length > 0, 'the contract names run-time icons');
for (const file of RUNTIME_ICONS) {
  check(existsSync(path.join(resources, file)), `${file} is beside the asar`);
}

/* ---------------------------------------------------------------- fuses */

console.log('\nfuse configuration');

// `forge.config.ts` fuses the binary from the same list, in
// `scripts/package-contract.mjs`, so a seventh fuse is burned in and checked
// from one edit rather than from a rule asking for two. Issue #92.

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

// The floor. An empty list would report the binary as hardened without
// reading a single fuse.
check(Object.keys(PACKAGE_FUSES).length > 0, 'the contract names fuses');

for (const [name, expected] of Object.entries(PACKAGE_FUSES)) {
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
