#!/usr/bin/env node
/**
 * Prove a crash in the packaged application leaves an artifact on disk.
 *
 * `crashReporter.start` with no `submitURL` is documented behaviour, and
 * documented behaviour is what `docs/proposals/electron-field-guide.md`
 * offered before #134 replaced it. This runs it: the installed binary is
 * launched twice into throwaway profiles, once so that nothing crashes and
 * once so that the llama.cpp engine aborts in native code, and the two crash
 * databases are compared.
 *
 * The crash is #144's, not a new one. `--self-check=llama` forks the engine as
 * a `utilityProcess`, loads the packaged library, and calls `process.abort()`
 * inside it. That is the case worth covering now: since #144 the application
 * survives it, so it is the crash least likely to be noticed and the one most
 * in need of a record.
 *
 * Which of the three process types this covers is decided by the run rather
 * than asserted here. The engine is a `utilityProcess`; the main process and
 * the renderer are covered by the same reporter and are not exercised by any
 * check. See `docs/architecture.md`.
 *
 * Issue #134.
 */

import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { scopedChecks } from './check-scope.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Kept in step with `src/main/native/self-check.ts` by `tests/self-check.test.ts`. */
const TERMINAL_FLAG = '--self-check=terminal';
const TOKEN_FLAG = '--self-check-token=';

/** Kept in step with `src/main/native/llama-protocol.ts` by `tests/llama-protocol.test.ts`. */
const LLAMA_FLAG = '--self-check=llama';
const LLAMA_OK = 'self-check llama: ok';
const LLAMA_GATED = 'self-check llama: gated';

const TERMINAL_TIMEOUT_MS = 90_000;
/** Above `engineCheckTimeoutMs`, which is 180 s on Windows. */
const LLAMA_TIMEOUT_MS = 240_000;

/**
 * How long Crashpad may take to finish writing after the process is gone.
 *
 * The handler is a separate process, so the dump lands after the exit that
 * produced it. Every macOS run measured here had it on disk inside 2 s; the
 * limit is a bound on a hang rather than a budget.
 */
const DUMP_WAIT_MS = 30_000;
const DUMP_POLL_MS = 250;

/**
 * How long a run that must produce no dump is given to produce one anyway.
 *
 * A one-sided wait. Returning the moment a dump appears keeps a passing run
 * fast, but "none appeared" is only worth anything after waiting, or the
 * control passes by winning a race.
 */
const NO_DUMP_GRACE_MS = 10_000;

/**
 * The floor on a dump's size.
 *
 * Observed at 570 KB to 815 KB across engine, renderer and main process
 * crashes on `darwin-arm64`. This rejects a zero-length placeholder; it does
 * not pin a size, because nothing here controls what Crashpad writes.
 */
const MIN_DUMP_BYTES = 4096;

/** Where Electron puts the Crashpad database, relative to the profile. */
const DATABASE = 'Crashpad';

function target() {
  if (process.platform === 'darwin') {
    const bundle = path.join(ROOT, `out/Stuffbucket-darwin-${process.arch}/Stuffbucket.app`);
    return path.join(bundle, 'Contents/MacOS/Stuffbucket');
  }
  if (process.platform === 'win32') {
    return path.join(ROOT, `out/Stuffbucket-win32-${process.arch}/Stuffbucket.exe`);
  }
  return undefined;
}

const BINARY = target();
if (!BINARY) {
  console.error(`This check runs on macOS and Windows, and the host is ${process.platform}.`);
  process.exit(1);
}
if (!existsSync(BINARY)) {
  console.error(`No packaged application at ${path.relative(ROOT, BINARY)}. Run \`npm run package\`.`);
  process.exit(1);
}

/**
 * Every minidump under a profile's crash database.
 *
 * Recursive rather than a list of directory names, for the reason
 * `src/host/crash-artifacts.ts` gives: the layout is Crashpad's, it differs by
 * platform, and a scan that named the directories it knew would report nothing
 * on the platform whose names it did not have.
 */
function findDumps(root) {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const found = [];
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) found.push(...findDumps(full));
    else if (entry.name.endsWith('.dmp')) found.push(full);
  }
  return found;
}

/** Everything Crashpad wrote, dumps and bookkeeping alike. */
function databaseEntries(root) {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const full = path.join(root, entry.name);
    return entry.isDirectory() ? databaseEntries(full) : [full];
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wait for what the run should have written.
 *
 * `expected` decides the shape of the wait, not the assertion: a run that
 * should produce a dump returns as soon as one is there, and a run that should
 * not is given a fixed grace first.
 */
async function waitForDumps(root, expected) {
  if (!expected) {
    await sleep(NO_DUMP_GRACE_MS);
    return findDumps(root);
  }
  const deadline = Date.now() + DUMP_WAIT_MS;
  let dumps = findDumps(root);
  while (dumps.length === 0 && Date.now() < deadline) {
    await sleep(DUMP_POLL_MS);
    dumps = findDumps(root);
  }
  return dumps;
}

/** Launch the packaged binary once, into a profile of its own. */
function launch(args, timeoutMs) {
  const profile = mkdtempSync(path.join(tmpdir(), 'stuffbucket-crash-'));
  return new Promise((resolve) => {
    const child = spawn(BINARY, [...args, `--user-data-dir=${profile}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ profile, database: path.join(profile, DATABASE), stdout, stderr, code, timedOut });
    });
  });
}

function describe(run, timeoutMs) {
  const status = run.timedOut ? `killed after ${String(timeoutMs)} ms` : `exit ${String(run.code)}`;
  return `${status}\n${[run.stdout, run.stderr].join('').trimEnd()}`;
}

const { check, summary } = scopedChecks();

console.log(`Launching ${path.relative(ROOT, BINARY)}\n`);

/* ---------------------------------- a run that does not crash writes none */

/**
 * The control, and it runs first.
 *
 * Starting a crash reporter creates the database whether or not anything
 * crashes. Without this, "a `.dmp` is present" would also be satisfied by a
 * dump some earlier run left, by a fixture, and by a Crashpad that files
 * something on every start. The throwaway profile is what makes the second
 * run's dump attributable to the crash inside it.
 */
console.log('A run that does not crash\n');

const clean = await launch([TERMINAL_FLAG, `${TOKEN_FLAG}${randomBytes(8).toString('hex')}`], TERMINAL_TIMEOUT_MS);
console.log(`${describe(clean, TERMINAL_TIMEOUT_MS)}\n`);

const cleanDumps = await waitForDumps(clean.database, false);
const cleanDatabase = databaseEntries(clean.database);

check(clean.code === 0, 'the packaged application starts and exits', {
  count: 1,
  of: 'runs without a crash',
});
check(
  cleanDatabase.length > 0,
  `the crash database exists at <profile>/${DATABASE}, so the reporter started`,
  { count: cleanDatabase.length, of: 'crash database files' },
);
check(cleanDumps.length === 0, 'and it holds no minidump, because nothing crashed', {
  count: 1,
  of: 'runs without a crash',
});

/* ------------------------------------------- and a run that crashes does */

/**
 * The crash, from #144 rather than invented here.
 *
 * The engine loads the packaged llama.cpp in a `utilityProcess` and then calls
 * `process.abort()` in native code. The application survives it, which is
 * exactly why an artifact matters: nothing about the run says a fault occurred
 * once the sentence scrolls past.
 */
console.log('A run where the engine aborts in native code\n');

const crashed = await launch([LLAMA_FLAG], LLAMA_TIMEOUT_MS);
console.log(`${describe(crashed, LLAMA_TIMEOUT_MS)}\n`);

/**
 * Whether the engine really died, read off the run rather than off a platform
 * table.
 *
 * `embeddedEngineStatus` gates the engine off on Windows while #149 is open,
 * and a gated run crashes nothing. Deciding from the line the application
 * printed means this check demands a dump on Windows the day that gate is
 * retired, without anyone remembering to come back here.
 */
const aborted = crashed.stdout.includes(LLAMA_OK);
const gated = crashed.stdout.includes(LLAMA_GATED);

check(aborted !== gated, 'the run reports the engine as either crashed or gated', {
  count: 1,
  of: 'engine runs',
});
check(crashed.code === 0, 'the application outlives whatever the engine did', {
  count: 1,
  of: 'engine runs',
});

const crashDumps = await waitForDumps(crashed.database, aborted);

if (aborted) {
  check(
    crashDumps.length > cleanDumps.length,
    'the engine crash left a minidump, where the run without a crash left none',
    { count: crashDumps.length, of: 'minidumps' },
  );
  check(
    crashDumps.every((dump) => statSync(dump).size >= MIN_DUMP_BYTES),
    `every minidump is at least ${String(MIN_DUMP_BYTES)} bytes`,
    { count: crashDumps.length, of: 'minidumps' },
  );
  for (const dump of crashDumps) {
    console.log(`       ${path.basename(dump)}  ${String(statSync(dump).size)} bytes`);
  }
} else {
  /**
   * Not a skip. The gate is asserted instead, and the assertion is the one
   * thing that is true here: nothing crashed, so nothing was written. This
   * platform therefore proves the reporter starts and does not prove the
   * artifact. `docs/architecture.md` says so in as many words. Issue #149.
   */
  check(crashDumps.length === 0, 'the gated run crashes nothing, and writes no minidump', {
    count: 1,
    of: 'gated runs',
  });
  check(crashed.stdout.includes('#149'), 'and the gate names the issue that retires it', {
    count: 1,
    of: 'gated runs',
  });
  console.log(
    '\n  note  no crash artifact is proven on this platform: the only crash this\n' +
      '        repository can reproduce is the engine abort, and #149 gates it off.',
  );
}

for (const run of [clean, crashed]) rmSync(run.profile, { recursive: true, force: true });

process.exit(summary('verify:crash-artifact'));
