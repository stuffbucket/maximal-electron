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
 * macOS and Windows. The vehicle on Windows is the packaged directory rather
 * than an installed tree, because this repository ships no installer.
 */

import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Kept in step with `src/main/native/self-check.ts` by `tests/self-check.test.ts`. */
const FLAG = '--self-check=terminal';
const TOKEN_FLAG = '--self-check-token=';
const FAILED = 'self-check terminal: failed';

/**
 * The second check. Kept in step with `src/main/native/llama-protocol.ts` by
 * `tests/llama-protocol.test.ts`.
 */
const LLAMA_FLAG = '--self-check=llama';
const LLAMA_OK = 'self-check llama: ok';
const LLAMA_FAILED = 'self-check llama: failed';

const LAUNCH_TIMEOUT_MS = 90_000;

const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${message}`);
  if (!ok) failures.push(message);
};

/**
 * The binary to launch, and the one file its terminal cannot resolve without.
 *
 * On macOS that is `spawn-helper`, the file #88 left inside `app.asar`.
 *
 * On Windows it is `conpty.node`. `node-pty` `require`s it from
 * `prebuilds/win32-<arch>`, and Electron redirects that read into
 * `app.asar.unpacked`. `conpty.dll` and `OpenConsole.exe` sit beside it and are
 * not on this path: `useConptyDll` is off, so `conpty.cc` takes
 * `CreatePseudoConsole` out of `kernel32` and never opens the DLL. Each of the
 * three was moved aside on a Windows runner to establish that rather than
 * assume it; the pull request for #89 carries the runs.
 */
function target() {
  const arch = process.arch;
  if (process.platform === 'darwin') {
    const app = path.join(ROOT, `out/Stuffbucket-darwin-${arch}/Stuffbucket.app`);
    return {
      binary: path.join(app, 'Contents/MacOS/Stuffbucket'),
      resources: path.join(app, 'Contents/Resources'),
      fragile: 'spawn-helper',
      heading: 'Reproducing #88: moving spawn-helper aside',
    };
  }
  if (process.platform === 'win32') {
    const directory = path.join(ROOT, `out/Stuffbucket-win32-${arch}`);
    return {
      binary: path.join(directory, 'Stuffbucket.exe'),
      resources: path.join(directory, 'resources'),
      fragile: 'conpty.node',
      heading: 'The same defect as #88, one platform over: moving conpty.node aside',
    };
  }
  return undefined;
}

const platform = target();
if (!platform) {
  console.error(`This check runs on macOS and Windows, and the host is ${process.platform}.`);
  process.exit(1);
}

const { binary: BINARY, fragile: FRAGILE, heading: HEADING } = platform;
const NATIVE = path.join(
  platform.resources,
  `app.asar.unpacked/node_modules/node-pty/prebuilds/${process.platform}-${process.arch}`,
  FRAGILE,
);
/** Where the negative control parks the file. Restored before the run ends. */
const ASIDE = `${NATIVE}.aside`;

if (!existsSync(BINARY)) {
  console.error(`No packaged application at ${path.relative(ROOT, BINARY)}. Run \`npm run package\`.`);
  process.exit(1);
}

// An interrupted earlier run leaves the file parked. Put it back rather than
// reporting a defect that this script caused.
if (existsSync(ASIDE) && !existsSync(NATIVE)) renameSync(ASIDE, NATIVE);

/** Run the packaged binary once, with a fresh token. */
function launch(args) {
  const token = randomBytes(8).toString('hex');
  return new Promise((resolve) => {
    const argv = args ?? [FLAG, `${TOKEN_FLAG}${token}`];
    const child = spawn(BINARY, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
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
// that ran a command joining its two halves. A build that spawns nothing cannot
// produce it, and neither can a stale log.
check(
  working.stdout.includes(working.token),
  'a shell inside the package echoed this run\'s token back',
);

/* ------------------------------------------------- and it can still fail */

// The floor. Four checks in this repository passed while covering nothing, so
// this one reproduces the defect on every run: with the native file gone, the
// same launch must fail, and it must fail by reporting a shell that would not
// start rather than by dying for an unrelated reason.
console.log(`${HEADING}\n`);

if (!existsSync(NATIVE)) {
  console.error(`No ${FRAGILE} at ${path.relative(ROOT, NATIVE)}.`);
  process.exit(1);
}
const nativeSize = statSync(NATIVE).size;

let broken;
try {
  renameSync(NATIVE, ASIDE);
  broken = await launch();
} finally {
  renameSync(ASIDE, NATIVE);
}

console.log(`${describe(broken)}\n`);

check(broken.code !== 0, `the packaged application fails without ${FRAGILE}`);
check(
  broken.stdout.includes(FAILED),
  'it fails by reporting the shell, not by dying before the check',
);
check(!broken.stdout.includes(broken.token), 'no token comes back when no shell can start');
check(
  existsSync(NATIVE) && statSync(NATIVE).size === nativeSize && !existsSync(ASIDE),
  `${FRAGILE} is back where it was`,
);

/* ------------------------------ and the engine runs, and can be survived */

/**
 * The llama.cpp half. Issue #133.
 *
 * `verify:package` reads names out of the archive listing, and until this ran,
 * `docs/architecture.md` said in as many words that nothing exercised the
 * packaged llama.cpp. A name in a listing is not a library that loads: #88 is
 * the same shape, and it shipped.
 *
 * The application forks its engine as a `utilityProcess`, makes it load
 * `node-llama-cpp` out of `app.asar.unpacked`, then makes it abort in native
 * code. A pass means both halves: the library resolved from the child, and the
 * main process outlived the abort well enough to print a line about it.
 */
console.log('\nLoading llama.cpp in the engine process, then killing it\n');

const engine = await launch([LLAMA_FLAG]);
console.log(`${describe(engine)}\n`);

check(engine.code === 0, 'the packaged application survives a native abort in the engine');
check(
  engine.stdout.includes(LLAMA_OK),
  'the engine loaded llama.cpp and the main process reported its death',
);
check(
  engine.stdout.includes('SIGABRT'),
  'it reports the fault by name rather than a bare failure',
);

/**
 * The floor for that one. With the prebuild scope gone, the engine cannot load
 * llama.cpp, and the check must say so rather than pass — and the application
 * must still exit rather than hang, because a crash the supervisor never hears
 * about is the failure this whole change exists to remove.
 */
console.log('Reproducing #113: moving the @node-llama-cpp scope aside\n');

const SCOPE = path.join(APP, 'Contents/Resources/app.asar.unpacked/node_modules/@node-llama-cpp');
const SCOPE_ASIDE = `${SCOPE}.aside`;
if (existsSync(SCOPE_ASIDE) && !existsSync(SCOPE)) renameSync(SCOPE_ASIDE, SCOPE);

if (!existsSync(SCOPE)) {
  console.error(`No llama.cpp prebuild scope at ${path.relative(ROOT, SCOPE)}.`);
  process.exit(1);
}
const scopeEntries = readdirSync(SCOPE).length;

let noEngine;
try {
  renameSync(SCOPE, SCOPE_ASIDE);
  noEngine = await launch([LLAMA_FLAG]);
} finally {
  renameSync(SCOPE_ASIDE, SCOPE);
}

console.log(`${describe(noEngine)}\n`);

check(noEngine.code !== 0, 'the llama check fails with no prebuild scope');
check(
  noEngine.stdout.includes(LLAMA_FAILED),
  'it fails by reporting the engine, not by dying before the check',
);
check(!noEngine.stdout.includes(LLAMA_OK), 'no pass line comes back when nothing loaded');
check(
  existsSync(SCOPE) && readdirSync(SCOPE).length === scopeEntries && !existsSync(SCOPE_ASIDE),
  'the prebuild scope is back where it was',
);

/* --------------------------------------------------------------- result */

if (failures.length > 0) {
  console.error(`\n${String(failures.length)} check(s) failed.`);
  process.exit(1);
}
console.log(
  '\nThe packaged application opened a shell, and cannot pass without one.\n' +
    'It loaded llama.cpp out of process, and outlived it aborting.',
);
