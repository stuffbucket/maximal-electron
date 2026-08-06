#!/usr/bin/env node
/**
 * The Electron download cache holds the binary this job actually fetched.
 *
 * Electron 43 downloads nothing at install time — `npm ci` in the `static` job
 * leaves the cache root empty, which is how #129's premise turned out to be
 * wrong. The download happens when `electron-forge package` first resolves the
 * executable, so this runs after `npm run package` rather than after `npm ci`.
 *
 * Without it the arrangement fails silently: a job that never resolves Electron
 * caches an empty directory, every later run restores it, `actions/cache`
 * reports a hit, and the download happens anyway. That is the defect
 * `.claude/skills/write-a-check/SKILL.md` is written about, so this asserts the
 * root holds a download and says how many it counted.
 *
 * `--path` prints the root and exits. The composite action feeds that to
 * `actions/cache`, so the directory that is cached and the directory that is
 * checked cannot drift apart.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { scopedChecks } from './check-scope.mjs';
import { inspectCache, resolveCacheRoot } from './electron-cache.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Every file under `dir`. `@electron/get` nests one hashed directory deep. */
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
  const root = resolveCacheRoot({
    platform: process.platform,
    home: homedir(),
    env: process.env,
  });

  if (process.argv.includes('--path')) {
    console.log(root);
    return;
  }

  const { check, summary } = scopedChecks();
  const installed = path.join(ROOT, 'node_modules/electron/package.json');

  check(existsSync(installed), 'electron is installed, so a version can be demanded', {
    count: existsSync(installed) ? 1 : 0,
    of: 'node_modules/electron manifests',
  });

  if (!existsSync(installed)) {
    console.error('\nRun npm ci before this check.');
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

  check(downloads.length > 0, 'the cache root holds an Electron download', {
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
