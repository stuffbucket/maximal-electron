/**
 * Which packages an entry point needs installed, and which of them are not.
 *
 * The peer table in `README.md` says what to install. Nothing said whether a
 * consumer did: every peer is optional, so npm reports no missing one, and the
 * types resolve out of `dist/` whether or not the runtime package exists. A
 * `./renderer` consumer therefore gets a clean install and a clean `tsc`, and
 * the first signal is an unresolved import in a browser. Issue #172.
 *
 * The requirements are derived from the built graph rather than held as a list,
 * for the reason `scripts/peer-table.mjs` gives about the table it checks.
 *
 * Plain ESM in `scripts/`, matching `export-checks.mjs`: this runs under plain
 * `node` in a consumer's checkout, not through their bundler. Reading is scoped
 * to the package root the caller names, and resolution is the caller's
 * function, because only they can resolve from their own project.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { exportTargets, importedPackages, relativeImports } from './export-checks.mjs';

/**
 * @typedef {object} Check
 * @property {string} name
 * @property {boolean} ok
 * @property {string} detail What the check found, for one that did not pass.
 */

/**
 * A package an entry point requires that no import of it reaches.
 *
 * A React component does not import a renderer, so nothing in `dist/renderer`
 * names `react-dom`, and a consumer mounting these components still needs one.
 * `scripts/peer-table.mjs` re-exports this and asserts each name is a declared
 * peer no entry point imports, so a name that becomes reachable has to leave.
 */
export const REQUIRED_WITHOUT_IMPORT = [{ subpath: './renderer', name: 'react-dom' }];

/** A target that is an asset rather than a module to walk. */
function isModuleTarget(target) {
  return target.endsWith('.js') || target.endsWith('.mjs');
}

/**
 * Every bare specifier the graph under `entry` reaches.
 *
 * Unreadable files are skipped rather than thrown on: this runs against an
 * install the caller did not build, and a partial answer that names what it
 * could read beats no answer at all.
 */
async function packagesReached(packageRoot, entry) {
  const found = new Set();
  const visited = new Set();
  const pending = [entry];

  while (pending.length > 0) {
    // Defined because the loop guards the length, and remembered because a
    // graph may import itself in a circle.
    const file = /** @type {string} */ (pending.pop());
    if (visited.has(file)) continue;
    visited.add(file);

    let source;
    try {
      source = await readFile(file, 'utf8');
    } catch {
      continue;
    }

    for (const name of importedPackages(source)) found.add(name);
    for (const specifier of relativeImports(source)) {
      pending.push(path.resolve(path.dirname(file), specifier));
    }
  }

  return found;
}

/**
 * What each export subpath needs installed, as subpath to package names.
 *
 * Every condition of a subpath walks to the same graph, so the first module
 * target wins and the rest are skipped.
 */
export async function peerRequirements(packageRoot, exports) {
  /** @type {Map<string, string[]>} */
  const requirements = new Map();

  for (const { subpath, target } of exportTargets(exports)) {
    if (requirements.has(subpath) || !isModuleTarget(target)) continue;

    const entry = path.resolve(packageRoot, target);
    const reached = await packagesReached(packageRoot, entry);
    for (const { subpath: where, name } of REQUIRED_WITHOUT_IMPORT) {
      if (where === subpath) reached.add(name);
    }

    requirements.set(subpath, [...reached].sort());
  }

  return requirements;
}

/**
 * One check per package the named subpaths require.
 *
 * `resolve` answers whether a specifier resolves from the caller's project. It
 * is theirs to supply because resolution depends on where they ask from, and a
 * check that resolved from this file would answer about the wrong tree.
 */
export function missingPeerChecks(input) {
  const { requirements, subpaths, resolve } = input;
  /** @type {Check[]} */
  const checks = [];

  for (const subpath of subpaths) {
    const required = requirements.get(subpath);

    // A subpath with no entry is a caller naming an export that is not there,
    // which is a failure about the argument rather than about a peer.
    if (required === undefined) {
      checks.push({
        name: `${subpath} is an export of this package`,
        ok: false,
        detail: `the manifest names no module target for ${subpath}`,
      });
      continue;
    }

    for (const name of required) {
      checks.push({
        name: `${subpath} can resolve ${name}`,
        ok: resolve(name),
        detail: `${name} is required by ${subpath} and does not resolve`,
      });
    }
  }

  /*
   * The floor. Naming no subpath, or naming only ones that need nothing,
   * reports zero failures over zero questions, which reads as a pass.
   */
  checks.push({
    name: 'the requirements reached at least one package',
    ok: checks.some((check) => check.name.includes(' can resolve ')),
    detail: 'no named subpath required any package, so nothing was checked',
  });

  return checks;
}

/** The detail of every check that did not pass. */
export function failedPeerChecks(checks) {
  return checks.filter((check) => !check.ok).map((check) => check.detail);
}
