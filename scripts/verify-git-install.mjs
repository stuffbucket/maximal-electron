#!/usr/bin/env node
/**
 * Install this package by git ref, the way `stuffbucket/maximal` consumes it,
 * and resolve every entry in `exports`.
 *
 * npm runs `prepare` for a git install and `prepack` for a tarball. #70 moved
 * the build into `prepack` alone, so a git install produced a package with no
 * `dist/` at all, and nothing here noticed: `verify:exports` runs `npm pack`,
 * which is the other path. #82 fixed it. This is what keeps it fixed. Issue
 * #83.
 *
 * The default installs a `git+file:` URL onto this checkout. npm treats that as
 * a git dependency like any other — clone the ref, run `prepare`, pack what
 * `files` lists — so it needs no network and no pushed ref, and a developer can
 * run it before cutting a release. `--repository github:owner/name` installs
 * the pushed ref instead, which is the exact specifier a consumer writes, and
 * is what CI passes for the branch under review.
 *
 *   node scripts/verify-git-install.mjs
 *   node scripts/verify-git-install.mjs --repository github:stuffbucket/maximal-electron --ref v0.0.4
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  RENDERER_SURFACE,
  VERIFY_SURFACE,
  dependencyContractChecks,
  exportTargets,
  moduleGraphChecks,
  reExportedNames,
} from './export-checks.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const name = manifest.name;

const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${message}`);
  if (!ok) failures.push(message);
};

/**
 * `--name value`, `--name=value`, and a bare `--name`.
 *
 * A bare flag takes the next token only when that token is not itself a flag,
 * so `--keep --ref x` keeps the ref.
 */
function options(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const match = /^--([a-z-]+)(?:=(.*))?$/.exec(argv[index] ?? '');
    if (match === null) continue;
    if (match[2] !== undefined) {
      parsed[match[1]] = match[2];
      continue;
    }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) {
      parsed[match[1]] = '';
    } else {
      parsed[match[1]] = next;
      index += 1;
    }
  }
  return parsed;
}

const argv = options(process.argv.slice(2));
const repository = argv.repository || `git+${pathToFileURL(root).href}`;
const ref =
  argv.ref ||
  execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const specifier = `${repository}#${ref}`;

const scratch = await mkdtemp(path.join(tmpdir(), 'stuffbucket-git-install-'));
console.log(`Installing ${specifier}`);
console.log(`  scratch: ${scratch}\n`);

async function run() {
  await writeFile(
    path.join(scratch, 'package.json'),
    `${JSON.stringify({ name: 'git-install-scratch', version: '0.0.0', private: true }, null, 2)}\n`,
  );

  /*
   * No `--ignore-scripts`. That flag reaches the clone as well, where it stops
   * `prepare` running, which is the lifecycle script this whole check is
   * about.
   */
  let installed = true;
  try {
    execFileSync('npm', ['install', '--no-audit', '--no-fund', specifier], {
      cwd: scratch,
      stdio: ['ignore', 'inherit', 'inherit'],
    });
  } catch {
    installed = false;
  }

  console.log('\nGit-ref install');
  check(installed, `npm install ${specifier} succeeded`);

  const installedPath = path.join(scratch, 'node_modules', name);
  check(existsSync(installedPath), `the install produced node_modules/${name}`);
  if (!existsSync(installedPath)) return;

  /*
   * Real path, because the comparison below is against what
   * `import.meta.resolve` returns and node resolves symbolic links. On macOS
   * the scratch directory is under `/var`, which is a link to `/private/var`,
   * so every specifier would otherwise report as resolving to the wrong file.
   */
  const packageRoot = realpathSync(installedPath);

  const installedManifest = JSON.parse(
    await readFile(path.join(packageRoot, 'package.json'), 'utf8'),
  );
  const targets = exportTargets(installedManifest.exports);

  /*
   * What the install actually put on disk, rather than what the manifest says
   * it would.
   *
   * This is the check issue #31 is about, and it is the only one that can see
   * the answer directly: before this change the same command installed 265
   * packages and 274 MB, because a `dependencies` entry reaches every consumer
   * of every entry point regardless of which one they import.
   */
  console.log('\nWhat the install put in node_modules');
  const modules = path.join(scratch, 'node_modules');
  const installedPackages = readdirSync(modules)
    .filter((entry) => !entry.startsWith('.'))
    .flatMap((entry) =>
      entry.startsWith('@')
        ? readdirSync(path.join(modules, entry)).map((scoped) => `${entry}/${scoped}`)
        : [entry],
    )
    .sort();

  // The floor. A directory listing that came back empty would report the
  // equality below as satisfied by finding nothing at all.
  check(installedPackages.length > 0, 'node_modules holds at least one package');
  check(
    installedPackages.join(', ') === name,
    `installing ${name} installed only ${name}`,
  );
  if (installedPackages.join(', ') !== name) {
    console.log(`         ${String(installedPackages.length)} packages: ${installedPackages.join(', ')}`);
  }

  console.log('\nDependency contract of the installed package');
  for (const { name: message, ok } of await dependencyContractChecks(
    packageRoot,
    installedManifest,
  )) {
    check(ok, message);
  }

  /*
   * The floor. An installed package with no `exports` map, or a resolver that
   * returned nothing, would otherwise report a clean run over an empty list.
   */
  check(targets.length > 0, 'the installed manifest declares at least one export');

  console.log('\nExport targets in the installed package');
  const present = (target) => {
    const file = path.join(packageRoot, target);
    return existsSync(file) && statSync(file).size > 0;
  };
  for (const { subpath, condition, target } of targets) {
    check(present(target), `${subpath} ${condition} -> ${target} exists and is not empty`);
  }

  if (!existsSync(path.join(packageRoot, 'dist'))) {
    console.log('\n  The installed package has no dist/. It contains:');
    for (const entry of readdirSync(packageRoot).sort()) console.log(`    ${entry}`);
    console.log('  npm runs `prepare` for a git install and `prepack` for a tarball.');
    console.log('  A build in `prepack` alone produces exactly this. See issue #83.');
  }

  console.log('\nExport resolution from the consumer directory');
  await copyFile(
    path.join(root, 'scripts/resolve-exports.mjs'),
    path.join(scratch, 'resolve-exports.mjs'),
  );

  let report;
  try {
    report = JSON.parse(
      execFileSync(process.execPath, ['resolve-exports.mjs', name], {
        cwd: scratch,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
      }),
    );
  } catch (error) {
    check(false, `the resolver ran in ${scratch}`);
    console.log(`         ${error.message}`);
    return;
  }

  /*
   * `import.meta.resolve` answers from the manifest alone and never touches the
   * disk, so a specifier for a file the install does not contain still returns
   * a URL. Against the published `v0.0.2`, which has no `dist/`, every
   * specifier "resolved" and the floor below passed on a package holding three
   * files. Resolution counts only when the file it names is there.
   */
  let resolvedCount = 0;
  for (const entry of report.resolved) {
    const declared = targets.find(
      (target) => target.subpath === entry.subpath && target.condition === 'default',
    )?.target;
    const expected =
      declared === undefined
        ? undefined
        : pathToFileURL(path.join(packageRoot, declared)).href;
    const ok = expected !== undefined && entry.url === expected && present(declared);
    if (ok) resolvedCount += 1;
    check(ok, `${entry.specifier} loads ${declared ?? 'a file the manifest names'}`);
    if (!ok) console.log(`         resolved to ${entry.url ?? 'nothing'}`);
    if (entry.error !== null) console.log(`         ${entry.error}`);
  }
  check(resolvedCount > 0, 'at least one export specifier resolved to a file that exists');

  console.log('\nConsumer verification export');
  // The floor. A specifier that fails to load leaves the comparison below with
  // nothing to compare, and a bare mismatch says nothing about why.
  check(report.verify.names.length > 0, 'the ./verify export loads under plain node');
  if (report.verify.error !== null) console.log(`         ${report.verify.error}`);
  check(
    JSON.stringify(report.verify.names) === JSON.stringify(VERIFY_SURFACE),
    'the ./verify export exposes the documented names',
  );

  /*
   * Resolving an export is more than the file existing. A `dist/` from a stale
   * or partial build resolves and then hands a consumer a surface that is not
   * the one this repository promises, so the installed renderer entry answers
   * the same two questions `verify:exports` asks of the local build.
   */
  console.log('\nInstalled renderer surface');
  const rendererTarget = installedManifest.exports?.['./renderer']?.default;
  check(typeof rendererTarget === 'string', 'the installed manifest declares ./renderer');
  if (typeof rendererTarget !== 'string') return;

  const rendererEntry = path.join(packageRoot, rendererTarget);
  let rendererSource;
  try {
    rendererSource = await readFile(rendererEntry, 'utf8');
  } catch {
    rendererSource = undefined;
  }
  check(
    rendererSource !== undefined &&
      JSON.stringify(reExportedNames(rendererSource)) === JSON.stringify(RENDERER_SURFACE),
    'the installed renderer entry exposes the approved component surface',
  );

  const { checks, inspected } = await moduleGraphChecks(packageRoot, rendererEntry);
  for (const { name: message, ok } of checks) check(ok, message);
  console.log(`         ${String(inspected)} ${inspected === 1 ? 'module' : 'modules'} reached`);
}

try {
  await run();
} finally {
  if (argv.keep === undefined) await rm(scratch, { recursive: true, force: true });
  else console.log(`\nLeft the scratch install at ${scratch}`);
}

if (failures.length > 0) {
  console.error(`\n${String(failures.length)} git-install check(s) failed.`);
  process.exit(1);
}

console.log(`\nA git-ref install of ${ref} resolves every export.`);
