/**
 * What "an export resolves" means, as functions over a package directory.
 *
 * `scripts/verify-exports.mjs` runs these against this repository's own build
 * and the tarball `npm pack` produces. `scripts/verify-git-install.mjs` runs
 * the same functions against a package installed by git ref, which is how
 * `stuffbucket/maximal` consumes this one. npm runs `prepare` for a git install
 * and `prepack` for a tarball, so a check that walks one path says nothing
 * about the other. Issue #83.
 *
 * Every function takes the package root as an argument, so the caller chooses
 * which copy is under test. That is the same reason `terminal-package.mjs`
 * takes its file lists rather than reading a directory.
 *
 * Plain ESM in `scripts/`, matching `terminal-package.mjs`: `dist/` is ESM
 * syntax in a package with no `"type": "module"`, so these run under plain
 * `node` and are not bundled.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * @typedef {object} Check
 * @property {string} name
 * @property {boolean} ok
 */

/**
 * @typedef {object} ExportTarget
 * @property {string} subpath
 * @property {string} condition
 * @property {string} target
 */

/**
 * Every file an `exports` map names, one entry per condition.
 *
 * Read from the manifest rather than listed here. A hardcoded list means a new
 * entry in `exports` is unchecked until somebody remembers to add it, and an
 * export nothing verifies is one that can ship pointing at a file the build
 * does not produce.
 *
 * @param {Record<string, unknown> | undefined} exports
 * @returns {ExportTarget[]}
 */
export function exportTargets(exports) {
  return Object.entries(exports ?? {}).flatMap(([subpath, entry]) => {
    if (typeof entry === 'string') return [{ subpath, condition: 'default', target: entry }];
    if (entry === null || typeof entry !== 'object') return [];
    return Object.entries(entry)
      .filter(([, target]) => typeof target === 'string')
      .map(([condition, target]) => ({ subpath, condition, target: String(target) }));
  });
}

/** The component surface `./renderer` promises a consumer. */
export const RENDERER_SURFACE = [
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

/** The names `./verify` exposes. `terminal-package.mjs` defines them. */
export const VERIFY_SURFACE = [
  'TERMINAL_CONTENT_SECURITY_POLICY',
  'contentSecurityPolicyChecks',
  'terminalNativeFiles',
  'terminalPackageChecks',
  'terminalPrebuildDirectory',
];

/**
 * Names a built entry re-exports, sorted.
 *
 * @param {string} source
 * @returns {string[]}
 */
export function reExportedNames(source) {
  return [...source.matchAll(/export\s*\{([^}]+)}\s*from/g)]
    .flatMap((match) =>
      (match[1] ?? '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean),
    )
    .sort();
}

/**
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
const CONTRACTS = [/(?:^|\/)lib\/terminal-transport(?:\.js)?$/];
const APPLICATION_ONLY = [
  /(?:^|\/)App(?:\.js)?$/,
  /(?:^|\/)lib\//,
  /(?:^|\/)native\//,
  /demo/i,
  /fixture/i,
  /\.stories\./,
];

/**
 * Whether a module a consumer reaches through an export is generic.
 *
 * @param {string} relativePath
 * @returns {boolean}
 */
export function isGeneric(relativePath) {
  return (
    CONTRACTS.some((pattern) => pattern.test(relativePath)) ||
    !APPLICATION_ONLY.some((pattern) => pattern.test(relativePath))
  );
}

/** Relative specifiers a module imports. */
export function relativeImports(source) {
  return [...source.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)]
    .map((match) => match[1])
    .filter((specifier) => specifier !== undefined);
}

/**
 * Walk everything an entry point reaches and ask whether each module is
 * generic. Resolving an export is more than the file existing.
 *
 * A module that cannot be read is a failed check rather than a thrown error.
 * An install missing `dist/` reaches here, and the answer wanted there is
 * "this export does not resolve", not a stack trace.
 *
 * @param {string} root
 * @param {string} entry
 * @returns {Promise<{ checks: Check[], inspected: number }>}
 */
export async function moduleGraphChecks(root, entry) {
  /** @type {Check[]} */
  const checks = [];
  const visited = new Set();
  const pending = [entry];

  while (pending.length > 0) {
    const file = pending.pop();
    if (file === undefined || visited.has(file)) continue;
    visited.add(file);

    const relative = path.relative(root, file).split(path.sep).join('/');
    let source;
    try {
      source = await readFile(file, 'utf8');
    } catch {
      // Before the genericity question, not after it. A file that is not there
      // passes a test over its own name, and an `ok` line about a module the
      // install does not contain is the report reading backwards.
      checks.push({ name: `${relative} can be read`, ok: false });
      continue;
    }

    checks.push({ name: `${relative} is generic`, ok: isGeneric(relative) });

    for (const specifier of relativeImports(source)) {
      pending.push(path.resolve(path.dirname(file), specifier));
    }
  }

  /*
   * The floor, and it counts past one. The entry is in `visited` before
   * anything reads it, so a size of one means the file was unreadable or the
   * import pattern matched nothing — and a walk of nothing reports every
   * assertion over it as a pass. The renderer entry re-exports from nine
   * modules.
   */
  checks.push({ name: 'the import graph reaches past the entry', ok: visited.size > 1 });
  return { checks, inspected: visited.size };
}
