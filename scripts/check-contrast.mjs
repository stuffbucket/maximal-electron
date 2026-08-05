#!/usr/bin/env node
/**
 * Does a palette meet the shell's design contract?
 *
 * The shell's part is `src/renderer/lib/contrast.ts`: which token is drawn on
 * which surface, which pairs must be legible, and which tokens have to exist at
 * all. That travels with the shell and is checked in CI.
 *
 * Takes the palette as an argument so a fixture can be checked, but the point
 * is the default: `npm run check:contrast` measures `tokens.css` and CI runs
 * it, so the shipped palette stays legible.
 *
 *   node scripts/check-contrast.mjs [tokens.css] [--selectors <list>]
 *
 * `--selectors` is comma separated and read in cascade order, later overriding
 * earlier, which is how a light theme layered on a dark base resolves.
 *
 * Three sections, because they need three different fixes: a token that is not
 * defined, a token defined in a form this cannot read, and a pair that reads
 * fine and does not contrast.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkPalette } from '../src/renderer/lib/contrast.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A path worth printing: relative inside the repo, absolute outside it. */
const show = (target) => {
  const relative = path.relative(ROOT, target);
  return relative.startsWith('..') ? target : relative;
};

/* ------------------------------------------------------------- arguments */

const argv = process.argv.slice(2);
const value = (name, fallback) => {
  const at = argv.indexOf(name);
  return at === -1 ? fallback : (argv[at + 1] ?? fallback);
};

const positional = argv.filter(
  (item, index) =>
    !item.startsWith('--') && (index === 0 || argv[index - 1] !== '--selectors'),
);

const file = path.resolve(
  ROOT,
  positional[0] ?? 'src/renderer/styles/tokens.css',
);
const selectors = value('--selectors', ":root,:root[data-theme='light']")
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

/* ----------------------------------------------------------------- parse */

let css;
try {
  css = readFileSync(file, 'utf8');
} catch {
  console.error(` FAIL  no such file: ${show(file)}`);
  process.exit(1);
}

/**
 * Every custom property declared in the first block matching a selector.
 *
 * Deliberately simple. A palette is a flat list of declarations, and a CSS
 * parser would be a dependency this does not need. A selector that is not
 * present is reported rather than silently contributing nothing.
 */
function propertiesFor(selector) {
  const at = css.indexOf(selector);
  if (at === -1) return undefined;

  const open = css.indexOf('{', at);
  const close = css.indexOf('\n}', open);
  if (open === -1 || close === -1) return undefined;

  const found = {};
  for (const match of css.slice(open, close).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    found[match[1]] = (match[2] ?? '').trim();
  }
  return found;
}

const layers = [];
for (const selector of selectors) {
  const properties = propertiesFor(selector);
  if (properties === undefined) {
    console.error(` FAIL  no ${selector} block in ${show(file)}`);
    process.exit(1);
  }
  layers.push([selector, properties]);
}

/* --------------------------------------------------------------- report */

console.log(`${show(file)} — ${String(layers.length)} scheme(s)\n`);

let failed = false;
let palette = {};

for (const [selector, properties] of layers) {
  // Later selectors override earlier ones, as the cascade does at run time.
  palette = { ...palette, ...properties };
  const report = checkPalette(palette);
  const bad = report.checked.filter((result) => !result.passes);

  console.log(
    `${selector} — ${String(report.checked.length)} pairs checked, ` +
      `${String(report.skipped.length)} skipped, ` +
      `${String(report.missing.length)} tokens missing`,
  );

  if (report.missing.length > 0) {
    failed = true;
    console.log('   missing — the shell reads these and this palette does not define them');
    for (const token of report.missing) console.log(`     ${token}`);
  }

  if (report.skipped.length > 0) {
    failed = true;
    console.log('   unreadable — defined, but not as #rgb or #rrggbb, so no verdict');
    for (const pair of report.skipped) {
      console.log(`     ${pair.unreadable.join(', ')}  (${pair.where})`);
    }
  }

  if (bad.length > 0) {
    failed = true;
    console.log('   contrast — legible tokens that do not contrast enough');
    for (const result of bad) {
      console.log(
        `     ${result.foreground} on ${result.background}` +
          `  ${result.ratio.toFixed(2)} < ${String(result.minimum)}  — ${result.where}`,
      );
    }
  }

  if (!failed) console.log('   ok');
  console.log('');
}

process.exit(failed ? 1 : 0);
