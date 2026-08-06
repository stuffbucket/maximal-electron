// Temporary. Issue #149: does the RunAsNode fuse account for the packaged hang?
//
// Copies the development Electron, burns one fuse onto the copy, and runs the
// engine probe under it. Nothing shipped is touched: the copy is a scratch
// directory this script creates and the packaged binary is not read.

import { cp, rm, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const { flipFuses, FuseVersion, FuseV1Options } = await import('@electron/fuses');

const ROOT = process.cwd();
const SOURCE = path.join(ROOT, 'node_modules', 'electron', 'dist');
const SCRATCH = path.join(ROOT, 'probe-electron');

const layout =
  process.platform === 'win32'
    ? { app: path.join(SCRATCH, 'electron.exe'), run: path.join(SCRATCH, 'electron.exe') }
    : {
        app: path.join(SCRATCH, 'Electron.app'),
        run: path.join(SCRATCH, 'Electron.app', 'Contents', 'MacOS', 'Electron'),
      };

await rm(SCRATCH, { recursive: true, force: true });
await cp(SOURCE, SCRATCH, { recursive: true });

await flipFuses(layout.app, {
  version: FuseVersion.V1,
  resetAdHocDarwinSignature: process.platform === 'darwin',
  [FuseV1Options.RunAsNode]: false,
});
console.log(`[fuse-electron] RunAsNode burned off on ${layout.app}`);

// The other half of the theory: it is the GPU prebuild that makes
// node-llama-cpp fork a test process at all. With no vulkan package to
// resolve, `getShouldTestBinaryBeforeLoading` is false for the CPU binary.
const VULKAN = path.join(ROOT, 'node_modules', '@node-llama-cpp', 'win-x64-vulkan');
const ASIDE = `${VULKAN}.aside`;
const hideVulkan = process.env.PROBE_HIDE_VULKAN === '1';
if (hideVulkan) {
  if (!existsSync(VULKAN)) {
    console.error(`[fuse-electron] nothing to move aside at ${VULKAN}`);
    process.exit(1);
  }
  await rename(VULKAN, ASIDE);
  console.log('[fuse-electron] @node-llama-cpp/win-x64-vulkan moved aside');
}

const restore = async () => {
  if (hideVulkan && existsSync(ASIDE)) await rename(ASIDE, VULKAN);
};

const started = Date.now();
const child = spawn(layout.run, [path.join(ROOT, 'probe', 'engine-main.js'), process.argv[2]], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' },
});
child.stdout.on('data', (chunk) => process.stdout.write(chunk));
child.stderr.on('data', (chunk) => process.stdout.write(chunk));
child.on('exit', (code) => {
  void restore().then(() => {
    console.log(
      `[fuse-electron] exited code=${String(code)} after ${String(Date.now() - started)} ms`,
    );
    process.exit(0);
  });
});
