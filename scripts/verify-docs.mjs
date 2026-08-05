#!/usr/bin/env node
/**
 * Verify what the documentation claims.
 *
 * This repository tried a prose linter and removed it. The rules could not
 * tell a rule from a description, an identifier from an English word, or a
 * hedge from an instruction, and a faithful pass over the docs inverted a
 * modal on the repository's central invariant.
 *
 * None of that applies to a name. `npm run lint:docs` either is a script or is
 * not. `READ_ONLY_TOOLS` either appears in the source or it does not. Those
 * are decidable, and every documentation defect this repository has actually
 * shipped was one of them, including three introduced in a single afternoon by
 * renaming code and not grepping the docs.
 *
 * So: no style rules, and no model. Three checks that a compiler would make if
 * prose went through one.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { constants, links, npmScripts } from './docs-claims.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Documented prose. Everything here is checked. */
const DOC_ROOTS = ['docs', '.claude/skills'];
const DOC_FILES = ['README.md', 'AGENTS.md'];

/**
 * Prose describing what does not exist yet.
 *
 * This check asks whether a documented name is real. A proposal argues for
 * names that are not real, which is the point of writing one, so running the
 * check over it produces a failure that says only "this has not been built".
 *
 * The cost is honest and worth stating: a proposal that is accepted and built
 * gets no name checking until its content moves into a document outside this
 * directory. Move it when it lands, rather than leaving it here as the record.
 */
const DOC_EXEMPT = ['docs/proposals'];

/**
 * Where a name has to appear to count as real.
 *
 * Deliberately wide. A constant may live in source, a fuse in `forge.config.ts`,
 * an environment variable in a workflow. The check is "does this exist
 * anywhere outside the prose", not "is it exported from the module I expect".
 */
const SOURCE_ROOTS = ['src', 'e2e', 'tests', 'scripts', '.github', 'build'];

/**
 * This checker does not count as evidence for itself.
 *
 * Both files name `READ_ONLY_TOOLS` and `MIN_SCREENSHOT_BYTES` as examples of
 * what they catch. Left in the haystack, those mentions make the two dead
 * symbols look alive, and the check silently stops working on exactly the
 * case it was written for.
 */
const SELF = ['scripts/verify-docs.mjs', 'scripts/docs-claims.mjs'];
const SOURCE_FILES = [
  'package.json',
  'forge.config.ts',
  'stryker.conf.json',
  'eslint.config.mjs',
  'vitest.config.ts',
  'playwright.config.ts',
  'tsconfig.json',
];

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

function walk(dir, match) {
  const found = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(full, match));
    else if (entry.isFile() && match(entry.name)) found.push(full);
  }
  return found;
}

/* ------------------------------------------------------------- the corpus */

const docs = [
  ...DOC_FILES.map((file) => path.join(ROOT, file)),
  ...DOC_ROOTS.flatMap((dir) => walk(path.join(ROOT, dir), (name) => name.endsWith('.md'))),
]
  .filter((file) => existsSync(file))
  .filter((file) => {
    const relative = path.relative(ROOT, file);
    return !DOC_EXEMPT.some((dir) => relative.startsWith(dir + path.sep));
  });

const sourceFiles = [
  ...SOURCE_FILES.map((file) => path.join(ROOT, file)),
  ...SOURCE_ROOTS.flatMap((dir) => walk(path.join(ROOT, dir), () => true)),
]
  .filter((file) => existsSync(file))
  .filter((file) => !SELF.includes(path.relative(ROOT, file)));

// One string. These trees are small, and a substring test over it is both
// simpler and less wrong than guessing at each name's declaration syntax.
const haystack = sourceFiles
  .map((file) => {
    try {
      return readFileSync(file, 'utf8');
    } catch {
      return '';
    }
  })
  .join('\n');

const scripts = Object.keys(JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts);

console.log(`Verifying ${String(docs.length)} documents against ${String(sourceFiles.length)} files\n`);

/* -------------------------------------------------------------- the checks */

for (const file of docs) {
  const rel = path.relative(ROOT, file);
  const text = readFileSync(file, 'utf8');

  for (const name of new Set(npmScripts(text))) {
    check(scripts.includes(name), `${rel}: \`npm run ${name}\` is not a script in package.json`);
  }

  for (const name of new Set(constants(text))) {
    check(haystack.includes(name), `${rel}: \`${name}\` appears nowhere outside the documentation`);
  }

  for (const target of new Set(links(text))) {
    const resolved = path.resolve(path.dirname(file), target);
    check(existsSync(resolved), `${rel}: link to ${target} does not exist`);
  }
}

/* --------------------------------------------------------------- result */

if (failures.length > 0) {
  for (const failure of failures) console.error(` FAIL  ${failure}`);
  console.error(`\n${String(failures.length)} claim(s) failed.`);
  process.exit(1);
}

console.log(`All documented names exist. ${String(docs.length)} documents checked.`);
