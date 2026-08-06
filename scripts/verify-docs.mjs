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
 * So: no style rules, and no model. Four checks that a compiler would make if
 * prose went through one, each reporting how many claims it read.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { scopedChecks } from './check-scope.mjs';
import { constants, links, npmScripts, npmScriptsOutOfScope, repoPaths } from './docs-claims.mjs';

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

/** Where a backticked path is read as a claim about this checkout. */
const PATH_ROOTS = [...SOURCE_ROOTS, 'docs', '.claude'];

/**
 * Paths the documentation names that are deliberately not here.
 *
 * A document may name another repository's file, or record what a deletion
 * took with it. Nothing in the syntax tells those from a stale reference, so
 * they are declared, with the reason, and the check fails when one of them
 * starts existing. A list that only ever grows is the exemption becoming the
 * rule.
 */
const PATHS_NOT_HERE = new Map([
  ['scripts/build-msi.ps1', 'deleted with the MSI in #119; docs/release.md records what went'],
  ['scripts/verify-msi.ps1', 'deleted with the MSI in #119'],
  ['build/windows/app.wxs', 'deleted with the MSI in #119'],
  ['tests/wxs.test.ts', 'deleted with the MSI in #119'],
  ['scripts/prebuild.js', "node-pty's, run by its own install"],
  ['src/main/shell.ts', "maximal/client's, named in docs/embedding.md as the consumer's side"],
  ['src/renderer/.vite/', 'the output path a misconfigured `root` produces, and must not exist'],
]);

const { check, summary } = scopedChecks();

console.log('Verifying the corpus before verifying anything in it\n');

/**
 * Every file under `dir`.
 *
 * A `readdirSync` failure used to return an empty list, so a renamed `docs/`
 * left the run green over a smaller corpus. It throws now, and the roots are
 * floored below.
 */
function walk(dir, match) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(full, match));
    else if (entry.isFile() && match(entry.name)) found.push(full);
  }
  return found;
}

/** A glob's literal directory prefix, and a matcher for the whole pattern. */
function globMatches(pattern) {
  const firstStar = pattern.indexOf('*');
  const base = path.posix.dirname(pattern.slice(0, firstStar) + 'x');
  if (!existsSync(path.join(ROOT, base))) return [];

  const expression = pattern
    .split(/(\*\*|\*)/)
    .map((part) =>
      part === '**' ? '.*' : part === '*' ? '[^/]*' : part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('');
  const matcher = new RegExp(`^${expression}$`);

  return walk(path.join(ROOT, base), () => true)
    .map((file) => path.relative(ROOT, file).split(path.sep).join('/'))
    .filter((file) => matcher.test(file));
}

/** Whether a documented path names something in this checkout. */
function pathExists(target) {
  if (target.includes('*')) return globMatches(target).length > 0;
  return existsSync(path.join(ROOT, target));
}

/* ------------------------------------------------------------- the corpus */

const missingRoots = [...DOC_ROOTS, ...SOURCE_ROOTS].filter(
  (dir) => !existsSync(path.join(ROOT, dir)),
);
check(
  missingRoots.length === 0,
  missingRoots.length === 0
    ? 'every declared root exists'
    : `these declared roots do not exist: ${missingRoots.join(', ')}`,
  { count: DOC_ROOTS.length + SOURCE_ROOTS.length, of: 'declared roots' },
);
if (missingRoots.length > 0) process.exit(summary('verify:docs'));

const docsByRoot = new Map(
  DOC_ROOTS.map((dir) => [dir, walk(path.join(ROOT, dir), (name) => name.endsWith('.md'))]),
);
for (const [dir, found] of docsByRoot) {
  check(true, `${dir} holds documents`, { count: found.length, of: 'documents' });
}

const docs = [
  ...DOC_FILES.map((file) => path.join(ROOT, file)),
  ...[...docsByRoot.values()].flat(),
]
  .filter((file) => existsSync(file))
  .filter((file) => {
    const relative = path.relative(ROOT, file);
    return !DOC_EXEMPT.some((dir) => relative.startsWith(dir + path.sep));
  });

const sourceByRoot = new Map(
  SOURCE_ROOTS.map((dir) => [dir, walk(path.join(ROOT, dir), () => true)]),
);
for (const [dir, found] of sourceByRoot) {
  check(true, `${dir} holds source`, { count: found.length, of: 'files' });
}

const sourceFiles = [
  ...SOURCE_FILES.map((file) => path.join(ROOT, file)),
  ...[...sourceByRoot.values()].flat(),
]
  .filter((file) => existsSync(file))
  .filter((file) => !SELF.includes(path.relative(ROOT, file)));

// One string. These trees are small, and a substring test over it is both
// simpler and less wrong than guessing at each name's declaration syntax.
const haystack = sourceFiles.map((file) => readFileSync(file, 'utf8')).join('\n');

const scripts = Object.keys(JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts);

/* -------------------------------------------------------------- the checks */

/** One assertion per claim kind, over every claim of that kind in the corpus. */
const kinds = [
  {
    of: '`npm run` mentions',
    message: 'every documented script is in package.json',
    claims: (text) => npmScripts(text),
    holds: (name) => scripts.includes(name),
    say: (rel, name) => `${rel}: \`npm run ${name}\` is not a script in package.json`,
  },
  {
    of: 'constants',
    message: 'every documented constant appears in the source',
    claims: (text) => constants(text),
    holds: (name) => haystack.includes(name),
    say: (rel, name) => `${rel}: \`${name}\` appears nowhere outside the documentation`,
  },
  {
    of: 'links',
    message: 'every relative link resolves',
    claims: (text) => links(text),
    holds: (target, file) => existsSync(path.resolve(path.dirname(file), target)),
    say: (rel, target) => `${rel}: link to ${target} does not exist`,
  },
  {
    of: 'backticked paths',
    message: 'every backticked path names a file in this checkout',
    claims: (text) => repoPaths(text, PATH_ROOTS).filter((p) => !PATHS_NOT_HERE.has(p)),
    holds: (target) => pathExists(target),
    say: (rel, target) => `${rel}: \`${target}\` does not exist`,
  },
];

const failures = [];
let outOfScope = 0;

for (const kind of kinds) {
  let count = 0;
  const broken = [];
  for (const file of docs) {
    const rel = path.relative(ROOT, file);
    const text = readFileSync(file, 'utf8');
    for (const claim of new Set(kind.claims(text))) {
      count += 1;
      if (!kind.holds(claim, file)) broken.push(kind.say(rel, claim));
    }
  }
  check(broken.length === 0, kind.message, { count, of: kind.of });
  failures.push(...broken);
}

for (const file of docs) outOfScope += npmScriptsOutOfScope(readFileSync(file, 'utf8'));

check(
  [...PATHS_NOT_HERE.keys()].every((target) => !pathExists(target)),
  'every path declared absent is still absent',
  { count: PATHS_NOT_HERE.size, of: 'declared absences' },
);

/* --------------------------------------------------------------- result */

for (const failure of failures) console.error(`       ${failure}`);

console.log(
  `\nOut of scope by construction: ${String(outOfScope)} \`npm run\` mentions` +
    ' inside a fenced block or outside a code span.',
);

process.exit(summary('verify:docs'));
