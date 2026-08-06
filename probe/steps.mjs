// Temporary. Issue #149: find the rung of the ladder where getLlama() hangs on
// Windows. Deleted once the answer is in the issue.

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { fork } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.PROBE_ROOT ?? process.cwd();
const NLC = path.join(ROOT, 'node_modules', 'node-llama-cpp', 'dist');

function internal(...parts) {
  return pathToFileURL(path.join(NLC, ...parts)).href;
}

async function timed(log, name, ms, fn) {
  const started = Date.now();
  let settled = false;
  const bound = new Promise((resolve) =>
    setTimeout(() => resolve({ timedOut: true }), ms).unref?.(),
  );
  try {
    const outcome = await Promise.race([
      (async () => ({ value: await fn() }))().catch((err) => ({ err })),
      bound,
    ]);
    settled = true;
    const took = Date.now() - started;
    if (outcome.timedOut) {
      log(`  HUNG   ${name} did not settle in ${String(ms)} ms`);
      return { name, hung: true };
    }
    if ('err' in outcome) {
      const message = String(outcome.err?.message ?? outcome.err).split('\n')[0];
      log(`  err    ${name} threw after ${String(took)} ms: ${outcome.err?.constructor?.name}: ${message}`);
      return { name, error: message };
    }
    log(`  ok     ${name} in ${String(took)} ms -> ${JSON.stringify(outcome.value)}`);
    return { name, value: outcome.value };
  } finally {
    if (!settled) log(`  ?      ${name} left the race`);
  }
}

const STEP_MS = Number(process.env.PROBE_STEP_MS ?? 20_000);
const LOAD_MS = Number(process.env.PROBE_LOAD_MS ?? 45_000);

export async function runSteps(label, log) {
  log(`[${label}] node=${process.versions.node} electron=${process.versions.electron ?? 'none'} ` +
    `platform=${process.platform} arch=${process.arch} release=${os.release()}`);
  log(`[${label}] parentPort=${process.parentPort == null ? 'no' : 'yes'} ` +
    `send=${typeof process.send === 'function' ? 'yes' : 'no'} ` +
    `execPath=${path.basename(process.execPath)} ` +
    `PATH entries=${String((process.env.PATH ?? '').split(path.delimiter).length)}`);
  log(`[${label}] node-llama-cpp dist present=${fs.existsSync(NLC) ? 'yes' : 'no'} at ${NLC}`);

  const results = [];

  results.push(
    await timed(log, 'import electron', STEP_MS, async () => {
      if (process.versions.electron == null) return 'not electron';
      const mod = await import('electron');
      return `utilityProcess=${typeof mod.utilityProcess?.fork === 'function' ? 'forkable' : 'absent'}`;
    }),
  );

  results.push(
    await timed(log, 'child_process.fork echo', STEP_MS, async () => {
      const child = fork(path.join(HERE, 'echo-child.js'), [], {
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      });
      return await new Promise((resolve, reject) => {
        child.on('message', (message) => {
          child.kill();
          resolve(`child said ${JSON.stringify(message)}`);
        });
        child.on('error', reject);
        child.on('exit', (code, signal) =>
          reject(new Error(`child exited code=${String(code)} signal=${String(signal)} with no message`)),
        );
      });
    }),
  );

  results.push(
    await timed(log, 'import node-llama-cpp', STEP_MS, async () => {
      const mod = await import('node-llama-cpp');
      return typeof mod.getLlama === 'function' ? 'getLlama exported' : 'no getLlama';
    }),
  );

  results.push(
    await timed(log, 'hasFileInPath nvml.dll', STEP_MS, async () => {
      const { hasFileInPath } = await import(internal('bindings', 'utils', 'hasFileInPath.js'));
      return await hasFileInPath('nvml.dll');
    }),
  );

  results.push(
    await timed(log, 'getWindowsProgramFilesPaths', STEP_MS, async () => {
      const mod = await import(internal('bindings', 'utils', 'detectAvailableComputeLayers.js'));
      return await mod.getWindowsProgramFilesPaths();
    }),
  );

  results.push(
    await timed(log, 'getCudaNvccPaths', STEP_MS, async () => {
      const mod = await import(internal('bindings', 'utils', 'detectAvailableComputeLayers.js'));
      return await mod.getCudaNvccPaths();
    }),
  );

  results.push(
    await timed(log, 'detectAvailableComputeLayers', STEP_MS, async () => {
      const mod = await import(internal('bindings', 'utils', 'detectAvailableComputeLayers.js'));
      return await mod.detectAvailableComputeLayers();
    }),
  );

  results.push(
    await timed(log, 'getClonedLlamaCppRepoReleaseInfo', STEP_MS, async () => {
      const mod = await import(internal('bindings', 'utils', 'cloneLlamaCppRepo.js'));
      return (await mod.getClonedLlamaCppRepoReleaseInfo()) ?? 'none';
    }),
  );

  results.push(
    await timed(log, 'getBestComputeLayersAvailable', STEP_MS, async () => {
      const mod = await import(internal('bindings', 'utils', 'getBestComputeLayersAvailable.js'));
      return await mod.getBestComputeLayersAvailable();
    }),
  );

  results.push(
    await timed(log, 'getLlama gpu=false', LOAD_MS, async () => {
      const { getLlama } = await import(internal('index.js'));
      const llama = await getLlama({ gpu: false, build: 'never', progressLogs: false });
      return `gpu=${String(llama.gpu)}`;
    }),
  );

  results.push(
    await timed(log, 'getLlama auto', LOAD_MS, async () => {
      const { getLlama } = await import(internal('index.js'));
      const llama = await getLlama();
      return `gpu=${String(llama.gpu)}`;
    }),
  );

  const hung = results.filter((entry) => entry.hung).map((entry) => entry.name);
  log(`[${label}] verdict: ${hung.length === 0 ? 'nothing hung' : `hung at ${hung.join(', ')}`}`);
  return results;
}
