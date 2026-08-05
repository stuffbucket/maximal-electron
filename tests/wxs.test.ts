import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

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
