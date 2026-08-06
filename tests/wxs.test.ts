import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Is the installer source well-formed XML?
 *
 * `wix build` runs only on a Windows runner, and only after a tag is pushed.
 * So a malformed `.wxs` file is discovered at release time, on the one path
 * that cannot be re-run without a new tag.
 *
 * It happened on the first tag this repository ever pushed. `app.wxs` carried
 * its own build commands in a comment, and `--global` is a double hyphen,
 * which XML forbids. `WIX0104`, and no MSI.
 */

const WINDOWS = new URL('../build/windows/', import.meta.url);

function wxsFiles(): string[] {
  return readdirSync(WINDOWS).filter((name) => name.endsWith('.wxs'));
}

/**
 * Reject a comment containing `--`, and report where.
 *
 * `DOMParser` in Node reports a parse failure as a document rather than a
 * throw, and the message it produces does not name the line. This is the one
 * rule that has actually bitten, so it is checked directly.
 */
function badComments(xml: string): string[] {
  const found: string[] = [];

  for (const match of xml.matchAll(/<!--([\s\S]*?)-->/g)) {
    const body = match[1] ?? '';
    if (!body.includes('--')) continue;

    const line = xml.slice(0, match.index).split('\n').length;
    const offending = body.split('\n').find((text) => text.includes('--'))?.trim() ?? '';
    found.push(`comment at line ${String(line)} contains a double hyphen: ${offending}`);
  }

  return found;
}

describe('the Windows installer source', () => {
  const files = wxsFiles();

  it('finds a file to check, so an empty scan cannot pass', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const name of files) {
    it(`${name} has no double hyphen inside a comment`, () => {
      const xml = readFileSync(path.join(WINDOWS.pathname, name), 'utf8');
      expect(badComments(xml)).toEqual([]);
    });

    it(`${name} has balanced comments and a root element`, () => {
      const xml = readFileSync(path.join(WINDOWS.pathname, name), 'utf8');
      const opens = (xml.match(/<!--/g) ?? []).length;
      const closes = (xml.match(/-->/g) ?? []).length;
      expect(opens).toBe(closes);
      expect(xml).toContain('<Wix');
    });
  }
});

/**
 * Does the harvest reach the packaged application?
 *
 * `<Files Include="!(bindpath.AppDir)\**" />` names no file, so nothing inside
 * the .wxs says whether it found any. WiX resolves a relative bind path in a
 * harvest against the .wxs file's own directory rather than the working
 * directory, warns, and produces an MSI with no application in it. That is
 * what `v0.0.2` shipped (#86).
 *
 * The two things that decide the answer both live outside the .wxs: the bind
 * path `scripts/build-msi.ps1` passes, and whether an empty harvest is an
 * error rather than a warning.
 */

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const BUILD_MSI = 'scripts/build-msi.ps1';
const VERIFY_MSI = 'scripts/verify-msi.ps1';

function read(relative: string): string {
  return readFileSync(path.join(ROOT, relative), 'utf8');
}

/** The bind path names a `Files` harvest depends on. */
function harvestBindPaths(xml: string): string[] {
  return [...xml.matchAll(/<Files\b[^>]*\bInclude="([^"]*)"/g)]
    .map((match) => match[1] ?? '')
    .flatMap((include) =>
      [...include.matchAll(/!\(bindpath\.([^)]+)\)/g)].map((match) => match[1] ?? ''),
    );
}

/** Executable names the installer hard-codes: the icon, the shortcuts, taskkill. */
function executablesNamed(xml: string): string[] {
  const patterns = [
    /<Icon\b[^>]*\bSourceFile="([^"]*)"/g,
    /\bTarget="([^"]*)"/g,
    /\bExeCommand="[^"]*\/IM\s+(\S+)/g,
  ];

  return patterns
    .flatMap((pattern) => [...xml.matchAll(pattern)].map((match) => match[1] ?? ''))
    .map((value) => value.split(/[\\\]]/).pop() ?? '')
    .filter((value) => value.endsWith('.exe'));
}

describe('the MSI harvest', () => {
  const { productName } = JSON.parse(read('package.json')) as { productName: string };
  const buildScript = read(BUILD_MSI);
  const wxs = read('build/windows/app.wxs');

  it('names the executable the packaged application produces', () => {
    const named = executablesNamed(wxs);
    expect(named.length).toBeGreaterThan(0);
    expect([...new Set(named)]).toEqual([`${productName}.exe`]);
  });

  it('builds and verifies that same executable', () => {
    for (const file of [BUILD_MSI, VERIFY_MSI]) {
      expect(read(file), `${file} does not name ${productName}.exe`).toContain(
        `${productName}.exe`,
      );
    }
  });

  it('passes every bind path the harvest reads, resolved to an absolute path', () => {
    const names = harvestBindPaths(wxs);
    expect(names.length).toBeGreaterThan(0);

    for (const name of names) {
      const passed = new RegExp(`-bindpath "${name}=\\$(\\w+)"`).exec(buildScript);
      expect(passed, `${BUILD_MSI} passes no -bindpath for ${name}`).not.toBeNull();

      expect(
        buildScript,
        `${BUILD_MSI} passes ${name} without resolving it to an absolute path`,
      ).toMatch(new RegExp(`\\$${passed?.[1] ?? ''}\\s*=\\s*\\(Resolve-Path`));
    }
  });

  it('treats a harvest that found nothing as an error', () => {
    // WIX8600 is zero files harvested, WIX8601 a missing harvest directory.
    expect(buildScript).toContain('-wx8600');
    expect(buildScript).toContain('-wx8601');
  });

  it('leaves no workflow calling wix build around those flags', () => {
    const directory = path.join(ROOT, '.github/workflows');
    const workflows = readdirSync(directory).filter((name) => name.endsWith('.yml'));

    expect(workflows.length).toBeGreaterThan(0);
    expect(
      workflows.filter((name) =>
        readFileSync(path.join(directory, name), 'utf8').includes('wix build'),
      ),
    ).toEqual([]);
  });
});
