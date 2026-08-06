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

/**
 * Packages an entry point reaches, and the modules it took to get there.
 *
 * A specifier read out of anything but an import is a package that does not
 * exist. Two produced that here: a JSDoc line in `TabBar.js` contrasting
 * "reaches the edge" with "overflows it", and `export const
 * SHELL_TERMINAL_PROPERTIES = ['--shell-terminal-background', …]`. Hence the
 * anchor, the `from`, and the newline excluded from the run before it.
 */
const IMPORT_PATTERNS = [
  /^(?:import|export)[^'"\n]*\bfrom\s*['"]([^'"]+)['"]/gm,
  /^import\s*['"]([^'"]+)['"]/gm,
  /\b(?:import|require)\(\s*['"]([^'"]+)['"]/g,
];

const packageOf = (specifier) =>
  specifier.split('/').slice(0, specifier.startsWith('@') ? 2 : 1).join('/');

async function walk(entry) {
  const files = [];
  const packages = new Set();
  const pending = [entry];
  const seen = new Set();

  while (pending.length > 0) {
    const file = pending.pop();
    if (!file || seen.has(file)) continue;
    seen.add(file);
    files.push(file);

    const source = await readFile(file, 'utf8');
    for (const pattern of IMPORT_PATTERNS) {
      for (const [, specifier] of source.matchAll(pattern)) {
        if (specifier.startsWith('.')) {
          pending.push(path.resolve(path.dirname(file), specifier));
        } else if (!specifier.startsWith('node:')) {
          packages.add(packageOf(specifier));
        }
      }
    }
  }

  return { files, packages };
}

/*
 * npm resolves dependencies per package, not per export. One `dependencies`
 * entry therefore reaches every consumer of every entry point, and `./host`
 * used to install `node-llama-cpp`, `node-pty`, and six Radix packages for a
 * module that imports `electron` alone. Issue #31.
 *
 * Optional peers are the only npm mechanism that installs nothing.
 * `optionalDependencies` still install by default, and npm 7 and later
 * auto-installs a peer that is not marked optional.
 */
const runtimeEntries = Object.entries(manifest.exports ?? {})
  .map(([name, entry]) => [name, typeof entry === 'string' ? entry : entry.default])
  .filter(([, target]) => typeof target === 'string' && /\.m?js$/.test(target));

const graphs = new Map();
for (const [name, target] of runtimeEntries) {
  graphs.set(name, await walk(path.join(root, target)));
}

// The floor. Every claim below is about a set the walk produced, so a walk that
// reached nothing would report all of them as passing.
check(runtimeEntries.length > 0, 'the manifest declares at least one JavaScript entry point');
for (const [name, graph] of graphs) {
  check(graph.files.length > 0, `${name} resolves to at least one module`);
}

const imported = new Set([...graphs.values()].flatMap((graph) => [...graph.packages]));
check(imported.size > 0, 'the entry points import at least one package');

check(
  Object.keys(manifest.dependencies ?? {}).length === 0,
  'the package declares no runtime dependencies',
);
check(
  Object.keys(manifest.optionalDependencies ?? {}).length === 0,
  'the package declares no optional dependencies, which npm installs by default',
);

const peers = Object.keys(manifest.peerDependencies ?? {});
for (const [name, graph] of graphs) {
  for (const dependency of [...graph.packages].sort()) {
    check(peers.includes(dependency), `${name} imports ${dependency}, a declared peer`);
  }
}

// The headline of issue #31, stated as an equality rather than an absence. A
// subset check would pass on an entry point that imports nothing at all.
check(
  [...(graphs.get('./host')?.packages ?? [])].join(',') === 'electron',
  './host imports electron and nothing else',
);

for (const peer of peers) {
  check(
    manifest.peerDependenciesMeta?.[peer]?.optional === true,
    `${peer} is an optional peer, so a consumer installs it only when they need it`,
  );
  check(
    typeof manifest.devDependencies?.[peer] === 'string',
    `${peer} is a development dependency, so this repository builds against it`,
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
const visited = graphs.get('./renderer').files;

for (const file of visited) {
  const relative = path.relative(root, file).split(path.sep).join('/');
  const allowed =
    contracts.some((pattern) => pattern.test(relative)) ||
    !forbidden.some((pattern) => pattern.test(relative));
  check(allowed, `${relative} is generic`);
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

console.log(`\nAll exports passed (${String(visited.length)} renderer modules inspected).`);
