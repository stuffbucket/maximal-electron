#!/usr/bin/env node
/**
 * Does this repository's reference palette meet the shell's own contract?
 *
 * Local, not CI, and the distinction matters. `src/renderer/lib/contrast.ts`
 * holds the maths and the list of pairs the shell draws — that is the shell's,
 * and it is tested in CI. The hex values in `tokens.css` are a default a
 * consumer replaces, the same way `lib/data.ts` says to replace the sample
 * data. Gating CI on them would be gating on sample content.
 *
 * A consumer runs the same check against their own palette by importing
 * `checkPalette` and handing it their tokens.
 *
 * Both schemes are checked. The light palette inherits from the dark one, so
 * a token defined once applies to both and a token redefined under
 * `[data-theme='light']` overrides it — which is exactly how the cascade
 * resolves at run time.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkPalette } from '../src/renderer/lib/contrast.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS = readFileSync(path.join(ROOT, 'src/renderer/styles/tokens.css'), 'utf8');

/** Every custom property in a block, in source order. */
function propertiesIn(block) {
  const found = {};
  for (const match of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    found[match[1]] = (match[2] ?? '').trim();
  }
  return found;
}

function blockFor(selector) {
  const start = CSS.indexOf(selector);
  if (start === -1) throw new Error(`No ${selector} block in tokens.css`);
  const open = CSS.indexOf('{', start);
  const close = CSS.indexOf('\n}', open);
  return CSS.slice(open, close);
}

const dark = propertiesIn(blockFor(':root {'));
const light = { ...dark, ...propertiesIn(blockFor(":root[data-theme='light']")) };

let failed = false;

for (const [scheme, palette] of [
  ['dark', dark],
  ['light', light],
]) {
  const results = checkPalette(palette);
  const bad = results.filter((result) => !result.passes);

  console.log(`\n${scheme} — ${String(results.length)} pairs checked`);

  if (bad.length === 0) {
    console.log('  ok   every pair clears its threshold');
    continue;
  }

  failed = true;
  for (const result of bad) {
    console.log(
      ` FAIL  ${result.foreground} on ${result.background}` +
        `\n         ${result.ratio.toFixed(2)} against ${String(result.minimum)} — ${result.where}`,
    );
  }
}

if (failed) {
  console.log(
    '\nThe reference palette does not meet the shell\'s contract. See issue #28.',
  );
}

process.exit(failed ? 1 : 0);
