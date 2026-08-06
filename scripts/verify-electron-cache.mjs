#!/usr/bin/env node
/**
 * The Electron download cache holds the binary this checkout installed.
 *
 * `.github/actions/electron-cache/action.yml` pins `electron_config_cache` and
 * restores that path by Electron version. Nothing about that arrangement is
 * visible when it breaks: a misspelled variable leaves the pinned root empty,
 * `actions/cache` saves an empty directory, and every later run restores it and
 * reports a hit while `npm ci` downloads the binary again. That is the defect
 * `.claude/skills/write-a-check/SKILL.md` is written about, so this asserts the
 * root holds a download and says how many it counted.
 *
 * It reads `electron_config_cache`, which is the variable the arrangement turns
 * on. Unset, there is nothing to check and it says so rather than falling back
 * to the per-OS default and passing on a cache CI is not using.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { scopedChecks } from './check-scope.mjs';
import { inspectCache } from './electron-cache.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Every file under `dir`, one level of version-hash directories deep. */
function filesUnder(dir) {
  if (!existsSync(dir)) return [];
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...filesUnder(full));
    else if (entry.isFile()) found.push(full);
  }
  return found;
}

function main() {
  const { check, summary } = scopedChecks();

  const root = process.env['electron_config_cache'];
  const installed = path.join(ROOT, 'node_modules/electron/package.json');

  check(root !== undefined && root !== '', 'electron_config_cache names a cache root', {
    count: root === undefined || root === '' ? 0 : 1,
    of: 'pinned cache roots',
  });

  check(existsSync(installed), 'electron is installed, so there was a download to cache', {
    count: existsSync(installed) ? 1 : 0,
    of: 'node_modules/electron manifests',
  });

  if (root === undefined || root === '' || !existsSync(installed)) {
    console.error('\nSet electron_config_cache and run npm ci before this check.');
    process.exit(summary('verify:electron-cache'));
  }

  const version = JSON.parse(readFileSync(installed, 'utf8')).version;
  const files = filesUnder(root);
  const bytes = files.reduce((total, file) => total + statSync(file).size, 0);
  const { downloads, stale, wanted } = inspectCache({
    names: files.map((file) => path.basename(file)),
    version,
    platform: process.platform,
    arch: process.arch,
  });

  console.log(`Cache root ${root}: ${String(files.length)} files, ${String(bytes)} bytes`);
  for (const file of files) console.log(`  ${path.relative(root, file)}`);
  console.log('');

  check(downloads.length > 0, 'the pinned cache root holds an Electron download', {
    count: files.length,
    of: 'files under the cache root',
  });

  check(stale.length === 0, 'no download in the root is for another Electron version', {
    count: downloads.length,
    of: 'downloads',
  });

  check(wanted.length === 1, `the download for electron ${version} on this runner is cached`, {
    count: wanted.length,
    of: `electron-v${version}-${process.platform}-${process.arch}.zip`,
  });

  process.exit(summary('verify:electron-cache'));
}

main();
