#!/usr/bin/env node
/**
 * Launch the packaged application and make it open a shell.
 *
 * `verify-package.mjs` reads the archive listing. That catches a file that is
 * absent and not one that is present and unusable, which is how #88 shipped:
 * `spawn-helper` was in the package, inside `app.asar` where `posix_spawn`
 * could not reach it, and every check was green. Nothing had ever started the
 * artifact a user installs. Issue #89.
 *
 * Playwright cannot drive a packaged build, because `EnableNodeCliInspectArguments`
 * is fused off and must stay off. So the application answers for itself: it is
 * launched with `--self-check=terminal`, it spawns a shell through the same
 * `TerminalHost` the terminal uses, and it prints the result. See
 * `src/main/native/self-check.ts`.
 *
 * macOS only. The Windows half of #89 is open: `verify-msi.ps1` starts the
 * installed executable and asserts it survives 20 seconds, which a package
 * whose terminal cannot spawn would pass.
 */

import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Kept in step with `src/main/native/self-check.ts` by `tests/self-check.test.ts`. */
const FLAG = '--self-check=terminal';
const TOKEN_FLAG = '--self-check-token=';
const FAILED = 'self-check terminal: failed';

const LAUNCH_TIMEOUT_MS = 90_000;

const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${message}`);
  if (!ok) failures.push(message);
};

if (process.platform !== 'darwin') {
  console.error(`This check is macOS only, and the host is ${process.platform}.`);
  process.exit(1);
}

const APP = path.join(ROOT, `out/Stuffbucket-darwin-${process.arch}/Stuffbucket.app`);
const BINARY = path.join(APP, 'Contents/MacOS/Stuffbucket');
const HELPER = path.join(
  APP,
  `Contents/Resources/app.asar.unpacked/node_modules/node-pty/prebuilds/darwin-${process.arch}/spawn-helper`,
);
/** Where the negative control parks the helper. Restored before the run ends. */
const ASIDE = `${HELPER}.aside`;

if (!existsSync(BINARY)) {
  console.error(`No packaged application at ${path.relative(ROOT, BINARY)}. Run \`npm run package\`.`);
  process.exit(1);
}

// An interrupted earlier run leaves the helper parked. Put it back rather than
// reporting a defect that this script caused.
if (existsSync(ASIDE) && !existsSync(HELPER)) renameSync(ASIDE, HELPER);

/** Run the packaged binary once, with a fresh token. */
function launch() {
  const token = randomBytes(8).toString('hex');
  return new Promise((resolve) => {
    const child = spawn(BINARY, [FLAG, `${TOKEN_FLAG}${token}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, LAUNCH_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ token, stdout, stderr: `${stderr}${String(error)}`, code: null, signal: null, timedOut });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ token, stdout, stderr, code, signal, timedOut });
    });
  });
}

function describe(run) {
  const status = run.timedOut
    ? `killed after ${String(LAUNCH_TIMEOUT_MS)} ms`
    : `exit ${String(run.code)}${run.signal ? ` signal ${run.signal}` : ''}`;
  return `${status}\n${[run.stdout, run.stderr].join('').trimEnd()}`;
}

/* ------------------------------------------------- the application works */

console.log(`Launching ${path.relative(ROOT, BINARY)}\n`);

const working = await launch();
console.log(`${describe(working)}\n`);

check(working.code === 0, 'the packaged application exits 0');
// The token is random per run and reaches the driver only by way of a shell
// that ran `printf`. A build that spawns nothing cannot produce it, and neither
// can a stale log.
check(
  working.stdout.includes(working.token),
  'a shell inside the package echoed this run\'s token back',
);

/* ------------------------------------------------- and it can still fail */

// The floor. Four checks in this repository passed while covering nothing, so
// this one reproduces #88 on every run: with `spawn-helper` gone, the same
// launch must fail, and it must fail by reporting a shell that would not start
// rather than by dying for an unrelated reason.
console.log('Reproducing #88: moving spawn-helper aside\n');

if (!existsSync(HELPER)) {
  console.error(`No spawn-helper at ${path.relative(ROOT, HELPER)}.`);
  process.exit(1);
}
const helperSize = statSync(HELPER).size;

let broken;
try {
  renameSync(HELPER, ASIDE);
  broken = await launch();
} finally {
  renameSync(ASIDE, HELPER);
}

console.log(`${describe(broken)}\n`);

check(broken.code !== 0, 'the packaged application fails without spawn-helper');
check(
  broken.stdout.includes(FAILED),
  'it fails by reporting the shell, not by dying before the check',
);
check(!broken.stdout.includes(broken.token), 'no token comes back when no shell can start');
check(
  existsSync(HELPER) && statSync(HELPER).size === helperSize && !existsSync(ASIDE),
  'spawn-helper is back where it was',
);

/* --------------------------------------------------------------- result */

if (failures.length > 0) {
  console.error(`\n${String(failures.length)} check(s) failed.`);
  process.exit(1);
}
console.log('\nThe packaged application opened a shell, and cannot pass without one.');
