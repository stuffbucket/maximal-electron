#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const failures = [];
const check = (condition, message) => {
  console.log(`${condition ? '  ok  ' : ' FAIL '} ${message}`);
  if (!condition) failures.push(message);
};

console.log('Package dependency contract');
for (const dependency of ['react', 'react-dom']) {
  check(
    typeof manifest.peerDependencies?.[dependency] === 'string' &&
      typeof manifest.devDependencies?.[dependency] === 'string',
    `${dependency} is a consumer peer and a development dependency`,
  );
  check(
    manifest.dependencies?.[dependency] === undefined,
    `${dependency} is not installed as a package runtime dependency`,
  );
}

/*
 * Read from the manifest rather than listed here.
 *
 * A hardcoded list means a new entry in `exports` is unchecked until somebody
 * remembers to add it, and an export nothing verifies is one that can ship
 * pointing at a file the build does not produce.
 */
const exportTargets = Object.values(manifest.exports ?? {}).flatMap((entry) =>
  typeof entry === 'string' ? [entry] : Object.values(entry),
);

console.log('Package export targets');
// The floor. An empty map would report every check below as passing by
// checking nothing.
check(exportTargets.length > 0, 'the manifest declares at least one export');
for (const target of exportTargets) {
  check(
    typeof target === 'string' && existsSync(path.join(root, target)),
    `${String(target)} exists`,
  );
}

const rendererEntry = path.join(root, manifest.exports['./renderer'].default);
const rendererSource = await readFile(rendererEntry, 'utf8');
const expectedExports = [
  'Canvas',
  'IconButton',
  'NavRail',
  'SHELL_TERMINAL_PROPERTIES',
  'ShellLayout',
  'TabBar',
  'TerminalTabs',
  'TerminalView',
  'TitleBar',
  'getTabPanelId',
  'getTabTriggerId',
  'readTerminalTheme',
];
const actualExports = [
  ...rendererSource.matchAll(/export\s*\{([^}]+)}\s*from/g),
].flatMap((match) =>
  (match[1] ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean),
);
check(
  JSON.stringify(actualExports.sort()) === JSON.stringify(expectedExports),
  'renderer JavaScript exposes only the approved component surface',
);
check(
  import.meta.resolve(`${manifest.name}/renderer`) ===
    new URL(manifest.exports['./renderer'].default, `file://${root}/`).href,
  'renderer package specifier resolves to the built entry',
);

/*
 * The packaging checks a consumer runs. Issue #76.
 *
 * Plain ESM under `scripts/` rather than TypeScript in `src/`, because `dist/`
 * is ESM syntax in a package with no `"type": "module"`: a bundler reads it and
 * `node` refuses it. This one is imported by a packaging script, not bundled
 * into an application, so it has to load under plain `node`. Importing it here
 * is what proves that.
 */
console.log('\nConsumer verification export');
const verifySpecifier = `${manifest.name}/verify`;
const verifyTarget = manifest.exports['./verify']?.default;
check(typeof verifyTarget === 'string', 'the manifest declares a ./verify export');

let verifyNames = [];
let resolved;
try {
  resolved = import.meta.resolve(verifySpecifier);
  verifyNames = Object.keys(await import(verifySpecifier)).sort();
} catch (error) {
  console.log(`         ${error.message}`);
}

check(
  typeof verifyTarget === 'string' &&
    resolved === new URL(verifyTarget, `file://${root}/`).href,
  'the ./verify specifier resolves to the file the manifest names',
);
// The floor. A specifier that fails to load leaves the comparison below with
// nothing to compare, and a bare mismatch says nothing about why.
check(verifyNames.length > 0, 'the ./verify export loads under plain node');
check(
  JSON.stringify(verifyNames) ===
    JSON.stringify([
      'TERMINAL_CONTENT_SECURITY_POLICY',
      'contentSecurityPolicyChecks',
      'terminalNativeFiles',
      'terminalPackageChecks',
      'terminalPrebuildDirectory',
    ]),
  'the ./verify export exposes the documented names',
);

/*
 * The main-process seam. Issue #15.
 *
 * Names rather than an import: `dist/host/run-main.js` imports `electron`,
 * which plain `node` cannot load. The declaration is what a consumer's `tsc`
 * reads, so checking the declaration checks what breaks them.
 */
console.log('\nMain-process seam');
const mainTypes = manifest.exports['./main']?.types;
check(typeof mainTypes === 'string', 'the manifest declares a ./main export');

const mainDeclaration =
  typeof mainTypes === 'string' && existsSync(path.join(root, mainTypes))
    ? await readFile(path.join(root, mainTypes), 'utf8')
    : '';
// The floor. An unreadable declaration would report every name below as
// missing, which is a different failure from a name that was dropped.
check(mainDeclaration !== '', 'the ./main declaration is readable');
for (const name of [
  'runMain',
  'RUN_MAIN_OPTIONS_VERSION',
  'RunMainOptions',
  'MainContext',
  'MainRuntime',
]) {
  check(
    new RegExp(`\\b${name}\\b`).test(mainDeclaration),
    `the ./main declaration names ${name}`,
  );
}

/*
 * `lib/` holds this application's own things — the bridge, the sample data, the
 * palette — so reaching one from the export means the package carries the
 * application with it. The exceptions are contracts: types and pure functions a
 * consumer implements against, with no import of their own.
 *
 * An allowlist rather than a dropped rule. `TerminalView` used to be forbidden
 * outright because it imported `bridge.js`; it now takes a transport as a
 * value, and this is what keeps it that way — re-adding that import puts
 * `lib/bridge.js` in the graph and fails here.
 */
const contracts = [/(?:^|\/)lib\/terminal-transport(?:\.js)?$/];
const forbidden = [
  /(?:^|\/)App(?:\.js)?$/,
  /(?:^|\/)lib\//,
  /(?:^|\/)native\//,
  /demo/i,
  /fixture/i,
  /\.stories\./,
];
const visited = new Set();
const pending = [rendererEntry];
const importPattern = /(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g;

while (pending.length > 0) {
  const file = pending.pop();
  if (!file || visited.has(file)) continue;
  visited.add(file);

  const relative = path.relative(root, file).split(path.sep).join('/');
  const allowed =
    contracts.some((pattern) => pattern.test(relative)) ||
    !forbidden.some((pattern) => pattern.test(relative));
  check(allowed, `${relative} is generic`);

  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1];
    if (!specifier) continue;
    const dependency = path.resolve(path.dirname(file), specifier);
    pending.push(dependency);
  }
}

/*
 * Deliberately without `--ignore-scripts`. `dist/` is built by `prepack` and
 * not committed, so skipping scripts would test whether a stale build happens
 * to be on disk rather than what a publish produces.
 */
const packed = JSON.parse(
  execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }),
)[0].files.map((file) => file.path);

console.log('\nPacked library artifacts');
for (const target of exportTargets) {
  const packedPath = target?.replace(/^\.\//, '');
  check(packed.includes(packedPath), `${String(packedPath)} is included by npm pack`);
}

/* ------------------------------------------------------- artifact freshness */

/*
 * `dist/` is a build artifact that is also committed, and `.gitignore` lists
 * it. Once a file is tracked the ignore stops applying, so a build rewrites
 * tracked files and nothing says so. Everything above then reads whatever was
 * last committed: the export names, the import graph, the packed paths. Each
 * check passes against an artifact that may be several merges behind `src/`,
 * which is a green run over the wrong files.
 *
 * That is not hypothetical. `npm run verify:exports` builds first, so a
 * difference here means the committed artifact and the source disagree — which
 * they did after the tab strip landed, leaving the published `./renderer`
 * export one merged pull request behind.
 *
 * Issue #33 proposes building at pack time and untracking `dist/` entirely.
 * This check reports nothing once that lands, because there is nothing tracked
 * to be stale.
 */
console.log('\nCommitted artifacts');
const git = (...args) => {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  } catch {
    return undefined;
  }
};

const tracked = git('ls-files', '--', 'dist');
if (tracked === undefined) {
  console.log('  skip   git is not available, so staleness cannot be judged');
} else if (tracked.trim() === '') {
  console.log('  skip   dist is not tracked, so there is nothing to be stale');
} else {
  // Both directions. A modified file is a rebuild nobody committed. A file
  // this build wrote that git does not track is a new export missing from the
  // artifact a consumer installs, and `.gitignore` keeps it out of
  // `git status`.
  const changed = (git('status', '--porcelain', '--', 'dist') ?? '').trim();
  const onDisk = readdirSync(path.join(root, 'dist'), {
    recursive: true,
    encoding: 'utf8',
  })
    .map((entry) => `dist/${entry.split(path.sep).join('/')}`)
    .filter((entry) => existsSync(path.join(root, entry)) && /\.[a-z]+$/.test(entry));
  const untracked = onDisk.filter((entry) => !tracked.includes(`${entry}\n`));

  check(changed === '', 'committed dist matches a fresh build');
  if (changed !== '') console.log(changed);
  check(untracked.length === 0, 'every built file is committed');
  for (const entry of untracked) console.log(`         ${entry}`);
}

if (failures.length > 0) {
  console.error(`\n${String(failures.length)} export check(s) failed.`);
  process.exit(1);
}

console.log(`\nAll exports passed (${String(visited.size)} renderer modules inspected).`);
