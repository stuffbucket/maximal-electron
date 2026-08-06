// Temporary. Issue #149: can a packaged build start a node child of itself?
//
// `testBindingBinary` in node-llama-cpp forks a child of `process.execPath` to
// load a binding before the real process does. Electron implements that fork by
// setting ELECTRON_RUN_AS_NODE, which the RunAsNode fuse turns off. This spawns
// the packaged binary the same way and reports what came back.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const exe = process.argv[2];
const script = process.argv[3] ?? path.join(HERE, 'echo-child.js');
const BOUND_MS = 20_000;

if (exe == null) {
  console.error('usage: node probe/fuse-fork.mjs <path to the packaged binary> [script]');
  process.exit(2);
}

async function attempt(label, env) {
  const started = Date.now();
  const child = spawn(exe, [script], {
    env: { ...process.env, TEST_BINDING_CP: 'true', ...env },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });

  let out = '';
  child.stdout?.on('data', (chunk) => (out += String(chunk)));
  child.stderr?.on('data', (chunk) => (out += String(chunk)));

  const outcome = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve('HUNG: nothing in 20 s'), BOUND_MS);
    child.on('message', (message) => {
      clearTimeout(timer);
      resolve(`ran as node: child said ${JSON.stringify(message)}`);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve(`spawn error: ${err.message}`);
    });
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      resolve(`exited code=${String(code)} signal=${String(signal)} with no message`);
    });
  });

  child.kill();
  const trimmed = out.trim().split('\n').slice(0, 4).join(' | ');
  console.log(`  ${label} after ${String(Date.now() - started)} ms -> ${outcome}`);
  if (trimmed.length > 0) console.log(`     output: ${trimmed}`);
}

console.log(`[fuse-fork] ${exe} running ${script}`);
await attempt('with ELECTRON_RUN_AS_NODE=1', { ELECTRON_RUN_AS_NODE: '1' });
await attempt('with no ELECTRON_RUN_AS_NODE', { ELECTRON_RUN_AS_NODE: undefined });
process.exit(0);
