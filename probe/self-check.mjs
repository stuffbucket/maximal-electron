// Temporary. Issue #149: run the real packaged binary's --self-check=llama and
// stamp every line, so a hang says where the time went.

import { spawn } from 'node:child_process';

const binary = process.argv[2];
const BOUND_MS = 300_000;

if (binary == null) {
  console.error('usage: node probe/self-check.mjs <path to the packaged binary>');
  process.exit(2);
}

const started = Date.now();
const child = spawn(binary, ['--self-check=llama'], { stdio: ['ignore', 'pipe', 'pipe'] });

function stamp(stream, chunk) {
  for (const line of String(chunk).split(/\r?\n/)) {
    if (line.length > 0) console.log(`${String(Date.now() - started).padStart(7)} ms ${stream} ${line}`);
  }
}

child.stdout.on('data', (chunk) => stamp('out', chunk));
child.stderr.on('data', (chunk) => stamp('err', chunk));

const timer = setTimeout(() => {
  console.log(`${String(Date.now() - started).padStart(7)} ms --- bound reached, killing`);
  child.kill();
}, BOUND_MS);

child.on('exit', (code, signal) => {
  clearTimeout(timer);
  console.log(
    `${String(Date.now() - started).padStart(7)} ms --- exited code=${String(code)} signal=${String(signal)}`,
  );
  process.exit(0);
});
