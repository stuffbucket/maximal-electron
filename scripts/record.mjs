#!/usr/bin/env node
/**
 * Record a screen capture of the running application.
 *
 * The recorder itself lives in `e2e/demo/`, in TypeScript, next to the harness
 * it shares with the end-to-end suite. This script is the front door: it checks
 * the two things that otherwise fail deep inside a five minute run, then hands
 * over to the Playwright runner.
 *
 * Playwright runs it rather than plain Node because it already transpiles the
 * TypeScript and resolves the `.js` import specifiers this repository uses. It
 * is a runner here, not a test framework. `e2e/demo/record.config.ts` matches
 * `*.demo.ts` only, so `npm run test:e2e` never picks a recording up.
 *
 * Usage:
 *
 *   npm run record                       the default timeline
 *   npm run record -- --grep terminal    one timeline out of several
 *
 * Set FFMPEG or FFPROBE to override the binaries. Set STUFFBUCKET_E2E_VISIBLE=1
 * to watch the run on screen, which is slower and takes over the desktop.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = path.join(ROOT, 'e2e/demo/record.config.ts');

/* ---------------------------------------------------------------- checks */

function tool(name, override) {
  if (override && override.length > 0) return override;
  const brew = `/opt/homebrew/bin/${name}`;
  return existsSync(brew) ? brew : name;
}

function usable(command) {
  if (path.isAbsolute(command)) return existsSync(command);
  // A bare name has to be on PATH. Ask the shell rather than reimplementing it.
  const probe = spawn(process.platform === 'win32' ? 'where' : 'which', [command]);
  return new Promise((resolve) => {
    probe.on('error', () => resolve(false));
    probe.on('close', (code) => resolve(code === 0));
  });
}

const failures = [];

const ffmpeg = tool('ffmpeg', process.env.FFMPEG);
const ffprobe = tool('ffprobe', process.env.FFPROBE);

if (!(await usable(ffmpeg))) {
  failures.push(`ffmpeg not found at "${ffmpeg}". Install it, or set FFMPEG.`);
}
if (!(await usable(ffprobe))) {
  failures.push(`ffprobe not found at "${ffprobe}". Install it, or set FFPROBE.`);
}

// The recorder drives the unpackaged build, for the reason in AGENTS.md: the
// `EnableNodeCliInspectArguments: false` fuse stops Playwright attaching to a
// packaged binary.
for (const artefact of ['.vite/build/main.js', '.vite/renderer/main_window/index.html']) {
  if (!existsSync(path.join(ROOT, artefact))) {
    failures.push(`${artefact} is missing. Run \`npm run package\` first.`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(` FAIL  ${failure}`);
  process.exit(1);
}

/* ----------------------------------------------------------------- run */

console.log(`recording with ${ffmpeg}`);

const child = spawn(
  process.execPath,
  [
    path.join(ROOT, 'node_modules/@playwright/test/cli.js'),
    'test',
    '--config',
    CONFIG,
    ...process.argv.slice(2),
  ],
  {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, FFMPEG: ffmpeg, FFPROBE: ffprobe },
  },
);

child.on('close', (code) => process.exit(code ?? 1));
