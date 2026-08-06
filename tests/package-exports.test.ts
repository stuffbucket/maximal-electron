import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { selectors, unscopedSelectors } from '../scripts/css-selectors.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The class every rule in the package stylesheet has to sit under. */
const SHELL_ROOT = '.sb-shell';

interface PackageManifest {
  exports: Record<string, unknown>;
  scripts: Record<string, string>;
  files: string[];
  dependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

describe('package exports', () => {
  it('publishes the main seam, host, renderer JavaScript and types, and structural CSS', async () => {
    const manifest = JSON.parse(
      await readFile(path.join(ROOT, 'package.json'), 'utf8'),
    ) as PackageManifest;

    expect(manifest.exports).toMatchObject({
      './main': {
        types: './dist/host/run-main.d.ts',
        default: './dist/host/run-main.js',
      },
      './host': {
        types: './dist/host/host-window.d.ts',
        default: './dist/host/host-window.js',
      },
      './renderer': {
        types: './dist/renderer/index.d.ts',
        default: './dist/renderer/index.js',
      },
      './renderer/styles.css': './dist/renderer/styles.css',
      './verify': {
        types: './scripts/terminal-package.d.mts',
        default: './scripts/terminal-package.mjs',
      },
    });
    expect(manifest.files).toContain('dist');
    expect(manifest.files).toContain('scripts/terminal-package.mjs');
    expect(manifest.scripts['build:package']).toBeTruthy();
    expect(manifest.scripts['verify:exports']).toBeTruthy();
  });

  /*
   * A caret on a runtime dependency is a version nobody chose. `^1.2.0-beta.14`
   * admitted every later beta and every 1.x release from a prerelease line.
   * Electron has always been pinned; issue #79 is the rest of them.
   */
  it('pins every runtime dependency to an exact version', async () => {
    const manifest = JSON.parse(
      await readFile(path.join(ROOT, 'package.json'), 'utf8'),
    ) as PackageManifest;

    const pinned = Object.entries(manifest.dependencies);
    expect(pinned.length).toBeGreaterThan(0);
    expect(
      pinned.filter(([, range]) => !/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(range)),
    ).toEqual([]);
  });

  it('requires the consumer React instance while retaining local build versions', async () => {
    const manifest = JSON.parse(
      await readFile(path.join(ROOT, 'package.json'), 'utf8'),
    ) as PackageManifest;

    for (const dependency of ['react', 'react-dom']) {
      expect(manifest.dependencies[dependency]).toBeUndefined();
      expect(manifest.peerDependencies[dependency]).toBe('>=18.0.0 <20.0.0');
      expect(manifest.devDependencies[dependency]).toBe('^19.2.8');
    }
  });

  it('makes every injected titlebar region non-draggable', async () => {
    const stylesheet = await readFile(
      path.join(ROOT, 'src/renderer/styles/structural.css'),
      'utf8',
    );

    expect(stylesheet).toMatch(
      /\.sb-shell \.titlebar__leading,\s*\.sb-shell \.titlebar__actions\s*\{[^}]*-webkit-app-region:\s*no-drag;/s,
    );
  });

  /*
   * Every selector, not the ones a prefix heuristic recognises.
   *
   * This list used to be lines starting `.` or `*` and ending `,` or `{`. A
   * rule of any other shape was not in the list and so was never judged:
   * `button { color: red; }` appended here left the suite green and turned
   * every button in a consumer's application red. Issue #51.
   *
   * `scripts/verify-exports.mjs` runs the same parse over
   * `dist/renderer/styles.css`, which is the file a consumer installs, and
   * asserts the two agree. It runs after a build, so the artifact is there;
   * this reads the source, which needs none.
   */
  it('scopes every exported structural selector to the shell root', async () => {
    const stylesheet = await readFile(
      path.join(ROOT, 'src/renderer/styles/structural.css'),
      'utf8',
    );
    const parsed = selectors(stylesheet);

    // The floor. A parser that returned nothing would report a clean
    // stylesheet over no selectors at all.
    expect(parsed.length).toBeGreaterThan(30);
    expect(unscopedSelectors(stylesheet, SHELL_ROOT)).toEqual([]);
    expect(stylesheet).toContain('.sb-shell.app {');
  });
});
