import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

interface PackageManifest {
  exports: Record<string, unknown>;
  scripts: Record<string, string>;
  files: string[];
  dependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

describe('package exports', () => {
  it('publishes host, renderer JavaScript and types, and structural CSS', async () => {
    const manifest = JSON.parse(
      await readFile(path.join(ROOT, 'package.json'), 'utf8'),
    ) as PackageManifest;

    expect(manifest.exports).toMatchObject({
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

  it('scopes every exported structural selector to the shell root', async () => {
    const stylesheet = await readFile(
      path.join(ROOT, 'src/renderer/styles/structural.css'),
      'utf8',
    );
    const selectorLines = stylesheet
      .split('\n')
      .map((line) => line.trim())
      .filter(
        (line) =>
          (line.startsWith('.') || line.startsWith('*')) &&
          (line.endsWith(',') || line.endsWith('{')),
      );

    expect(selectorLines.length).toBeGreaterThan(0);
    expect(selectorLines.every((line) => line.startsWith('.sb-shell'))).toBe(true);
    expect(stylesheet).toContain('.sb-shell.app {');
  });
});
