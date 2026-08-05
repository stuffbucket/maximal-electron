import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  exportedModules,
  isPackageToken,
  packageReads,
  readTokens,
  renderedClasses,
  styledClasses,
  stylesheets,
} from './stylesheets.js';

/**
 * What `structural.css` owes a consumer, and what a consumer owes it.
 *
 * `structural.css` is the stylesheet the package ships. It defines no palette:
 * it reads the `--shell-*` namespace, and `README.md` holds the table that
 * tells a consumer which of those they have to define. Nothing checked that
 * table, and nothing checked that the file styles the classes the exported
 * components actually render.
 *
 * Both are the `REQUIRED_TOKENS` defect on the seam `stuffbucket/maximal`
 * depends on. A token or a class the package stylesheet does not carry is a
 * rule that resolves to nothing for a consumer — a transparent background or an
 * unstyled element, never an error.
 */

const STYLES = new URL('../src/renderer/styles/', import.meta.url);
const structural = readFileSync(new URL('structural.css', STYLES), 'utf8');
const reads = packageReads(structural);

/** The table in README.md that tells a consumer what to define. */
function documented(): string[] {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  return [...readme.matchAll(/^\| `(--shell-[a-z0-9-]+)` \| /gm)]
    .map((match) => match[1] ?? '')
    .sort();
}

describe('the package token namespace', () => {
  it('partitions every token the stylesheets read', () => {
    // The claim that lets `contrast.test.ts` classify by prefix rather than by
    // filename. A stylesheet reading both namespaces would belong to both
    // contracts, and neither check could say which one owned it.
    for (const [name, css] of stylesheets()) {
      const tokens = readTokens(css);
      const ours = tokens.filter((token) => isPackageToken(token));
      const theirs = tokens.filter((token) => !isPackageToken(token));

      expect(
        ours.length === 0 || theirs.length === 0,
        `${name} reads both namespaces: ${theirs[0] ?? ''} and ${ours[0] ?? ''}`,
      ).toBe(true);
    }
  });

  it('is the whole of what structural.css reads', () => {
    // The package stylesheet ships no palette, so every value in it is the
    // consumer's. A palette token here would resolve against `tokens.css`
    // during development and against nothing in a consumer's application.
    expect(reads.required.size).toBeGreaterThan(0);
    expect(readTokens(structural).filter((token) => !isPackageToken(token))).toEqual([]);
  });

  it('declares none of its own tokens', () => {
    // A declaration here would be a default palette, which README.md says the
    // stylesheet does not ship. A consumer would inherit colours they did not
    // choose, on whichever properties happened to be declared.
    const declared = [...structural.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)].map(
      (match) => match[1] ?? '',
    );
    expect(declared).toEqual([]);
  });
});

describe('the README contract table', () => {
  it('names exactly the tokens a consumer has to define', () => {
    /*
     * The tripwire.
     *
     * Both sides are read from the files, so the table cannot be right today
     * and wrong after the next component. A token added to the CSS without a
     * fallback and left out of the table ships a rule that resolves to
     * nothing. A token in the table the CSS no longer reads asks a consumer
     * for a colour that is never drawn.
     */
    expect([...reads.required].sort()).toEqual(documented());
  });

  it('leaves out the tokens the CSS defaults for itself', () => {
    // README.md says these have structural fallbacks. Listing one as required
    // would make a consumer supply a value the CSS already carries.
    for (const token of reads.optional) {
      expect(documented(), token).not.toContain(token);
    }
  });

  it('reads no token both with and without a fallback', () => {
    // A fallback in one rule and none in another is a fallback that lies. The
    // consumer who trusts it gets a styled control in one place and an
    // unstyled one in the next.
    expect([...reads.required].filter((token) => reads.optional.has(token))).toEqual([]);
  });
});

describe('the exported components', () => {
  const modules = exportedModules();
  const styled = styledClasses(structural);

  it('are all reachable from the package entry point', () => {
    // The floor. Everything below iterates this list, so a walk that found
    // nothing would report a clean contract over no components at all. That is
    // the shape of both false passes this repository has shipped.
    expect(modules.length).toBeGreaterThan(1);
    expect(modules.map(([name]) => name)).toContain('components/TabBar');
  });

  it('render only classes structural.css styles', () => {
    /*
     * The second tripwire.
     *
     * A component may be styled twice: by `shell.css`, which is the reference
     * application's, and by `structural.css`, which is the package's. Only the
     * second ships. A class added to an exported component and styled in
     * `shell.css` alone looks correct in this repository and arrives at a
     * consumer with no rule at all.
     *
     * Found `nav__break`, added to the exported `NavRail` and styled only in
     * `shell.css`, and `icon-button--danger`, which had never been in the
     * package stylesheet.
     */
    const missing = modules
      .flatMap(([name, source]) =>
        renderedClasses(source)
          .filter((className) => !styled.has(className))
          .map((className) => `${name}: ${className}`),
      )
      .sort();

    expect(missing).toEqual([]);
  });
});
