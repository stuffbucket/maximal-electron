import { describe, expect, it } from 'vitest';

import {
  AA_NORMAL,
  CONTRAST_PAIRS,
  checkPalette,
  REQUIRED_TOKENS,
  contrastRatio,
  luminance,
  meets,
  missingTokens,
  parseHex,
} from '../src/renderer/lib/contrast.js';
import { isPackageToken, readTokens, stylesheets } from './stylesheets.js';

/**
 * The contrast contract.
 *
 * What is tested here is the maths and the pair list — the part that is the
 * shell's. Whether `tokens.css` satisfies it is a different question, checked
 * by `npm run check:contrast`, because the values in that file are a reference
 * default and a consumer supplies their own.
 */

describe('parseHex', () => {
  it('reads the long form', () => {
    expect(parseHex('#16181d')).toEqual({ r: 0x16, g: 0x18, b: 0x1d });
  });

  it('reads the short form by doubling each digit', () => {
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex('#08f')).toEqual({ r: 0, g: 0x88, b: 255 });
  });

  it('is case insensitive, because tokens.css is not consistent', () => {
    expect(parseHex('#E6E8EC')).toEqual(parseHex('#e6e8ec'));
  });

  it('tolerates the whitespace getPropertyValue leaves on', () => {
    expect(parseHex('  #ffffff  ')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('declines a translucent colour rather than guessing what is behind it', () => {
    // `--accent-soft` and friends are `rgb(r g b / a)`. Compositing them needs
    // a backdrop this function is not given.
    expect(parseHex('rgb(110 168 254 / 0.16)')).toBeUndefined();
  });

  it('declines anything else', () => {
    for (const value of ['', 'white', '#ff', '#fffff', '#gggggg', 'var(--accent)']) {
      expect(parseHex(value), value).toBeUndefined();
    }
  });

  it('is anchored at both ends', () => {
    // Without the anchors a hex buried in a longer value would parse, and a
    // consumer writing `1px solid #ffffff` would get a colour out of a border.
    for (const value of ['x#fff', '#ffffff00', 'solid #ffffff', '#fff;']) {
      expect(parseHex(value), value).toBeUndefined();
    }
  });
});

describe('luminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(luminance({ r: 0, g: 0, b: 0 })).toBe(0);
    expect(luminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 10);
  });

  it('weights green most and blue least, as the specification does', () => {
    const red = luminance({ r: 255, g: 0, b: 0 });
    const green = luminance({ r: 0, g: 255, b: 0 });
    const blue = luminance({ r: 0, g: 0, b: 255 });
    expect(green).toBeGreaterThan(red);
    expect(red).toBeGreaterThan(blue);
  });

  it('uses the linear segment below the threshold', () => {
    // Values at or under 0.04045 scaled are divided rather than raised to a
    // power. Getting this branch backwards is invisible except in near-blacks,
    // which is most of this palette.
    expect(luminance({ r: 10, g: 10, b: 10 })).toBeCloseTo(10 / 255 / 12.92, 12);
  });
});

describe('contrastRatio', () => {
  const black = { r: 0, g: 0, b: 0 };
  const white = { r: 255, g: 255, b: 255 };

  it('is 21 for black on white', () => {
    expect(contrastRatio(black, white)).toBeCloseTo(21, 6);
  });

  it('is 1 for a colour against itself', () => {
    expect(contrastRatio(white, white)).toBeCloseTo(1, 10);
  });

  it('does not depend on the order of its arguments', () => {
    expect(contrastRatio(black, white)).toBeCloseTo(contrastRatio(white, black), 10);
  });

  it('agrees with a published figure', () => {
    // #6f7783 on #16181d, the pair that opened issue #28. Reported by axe as
    // 3.92; this pins the maths against an independent tool.
    const ratio = contrastRatio({ r: 0x6f, g: 0x77, b: 0x83 }, { r: 0x16, g: 0x18, b: 0x1d });
    expect(ratio).toBeCloseTo(3.92, 1);
  });
});

describe('meets', () => {
  it('passes a ratio exactly on the threshold', () => {
    // WCAG says a ratio *of* 4.5 passes. Written as `>` this is off by the
    // one case a palette gets deliberately tuned onto.
    expect(meets(4.5, 4.5)).toBe(true);
  });

  it('passes above and fails below', () => {
    expect(meets(4.51, 4.5)).toBe(true);
    expect(meets(4.49, 4.5)).toBe(false);
  });
});

describe('CONTRAST_PAIRS', () => {
  it('names a threshold every pair can be judged against', () => {
    for (const pair of CONTRAST_PAIRS) {
      expect(pair.minimum).toBeGreaterThan(1);
      expect(pair.where, `${pair.foreground} on ${pair.background}`).not.toBe('');
    }
  });

  it('names tokens, not colours', () => {
    for (const pair of CONTRAST_PAIRS) {
      expect(pair.foreground.startsWith('--')).toBe(true);
      expect(pair.background.startsWith('--')).toBe(true);
    }
  });

  it('lists no pair twice', () => {
    const keys = CONTRAST_PAIRS.map((pair) => `${pair.foreground}|${pair.background}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

/**
 * Set at run time by the `[data-status]` and `[data-band]` rules rather than
 * supplied by a palette. Requiring them would fail every consumer.
 */
const RUNTIME_ONLY = ['--status', '--status-soft', '--band'];

/** Every `var(--…)` the shell's own stylesheets read. */
function referencedTokens(): string[] {
  const found = new Set<string>();

  for (const [, css] of stylesheets()) {
    for (const token of readTokens(css)) {
      // The `--shell-*` namespace is the public package's contract: a consumer
      // supplies those, README.md documents them, and
      // `tests/package-styles.test.ts` checks them. This used to skip
      // `structural.css` by name, which holds only while there is one file on
      // each side. The namespace is the distinction, so classify the token.
      if (isPackageToken(token)) continue;
      if (!RUNTIME_ONLY.includes(token)) found.add(token);
    }
  }

  return [...found].sort();
}

describe('REQUIRED_TOKENS', () => {
  it('is exactly what the stylesheets read', () => {
    /*
     * The tripwire, and the reason this list is not just data.
     *
     * A component that starts using a token nobody has to define ships a rule
     * that resolves to nothing for a consumer — a transparent background or an
     * inherited colour, never an error. A token dropped from the stylesheets
     * and left here demands something of a consumer for no reason.
     *
     * Read from the files rather than pinned as a literal, so the list cannot
     * be right today and wrong after the next component.
     */
    expect([...REQUIRED_TOKENS].sort()).toEqual(referencedTokens());
  });


  it('names every token the pair list refers to', () => {
    // A pair naming a token nobody has to define is a pair that will always
    // be skipped, which is worse than not listing it.
    for (const pair of CONTRAST_PAIRS) {
      expect(REQUIRED_TOKENS, pair.foreground).toContain(pair.foreground);
      expect(REQUIRED_TOKENS, pair.background).toContain(pair.background);
    }
  });

  it('lists no token twice', () => {
    expect(new Set(REQUIRED_TOKENS).size).toBe(REQUIRED_TOKENS.length);
  });

  it('omits the run-time status properties', () => {
    // `--status`, `--status-soft` and `--band` are set by the `[data-status]`
    // and `[data-band]` rules, not supplied by a palette. Requiring them would
    // fail every consumer.
    expect(REQUIRED_TOKENS).not.toContain('--status');
    expect(REQUIRED_TOKENS).not.toContain('--status-soft');
    expect(REQUIRED_TOKENS).not.toContain('--band');
  });
});

describe('missingTokens', () => {
  it('names what a palette does not define', () => {
    expect(missingTokens({})).toEqual(REQUIRED_TOKENS);
  });

  it('is empty when everything is present', () => {
    const complete = Object.fromEntries(
      REQUIRED_TOKENS.map((token) => [token, '#000000']),
    );
    expect(missingTokens(complete)).toEqual([]);
  });

  it('counts a token as present whatever its value', () => {
    // A palette may define a colour this cannot parse. That is a skipped pair,
    // not a missing token, and the two need different fixes.
    const complete = Object.fromEntries(
      REQUIRED_TOKENS.map((token) => [token, 'oklch(0.7 0.1 250)']),
    );
    expect(missingTokens(complete)).toEqual([]);
  });
});

describe('checkPalette', () => {
  const full = (overrides: Record<string, string>): Record<string, string> => ({
    ...Object.fromEntries(REQUIRED_TOKENS.map((token) => [token, '#000000'])),
    ...overrides,
  });

  it('judges each pair against its own threshold', () => {
    const report = checkPalette(full({ '--text-primary': '#ffffff', '--bg-app': '#000000' }));
    const pair = report.checked.find(
      (result) => result.foreground === '--text-primary' && result.background === '--bg-app',
    );
    expect(pair?.passes).toBe(true);
    expect(pair?.ratio).toBeCloseTo(21, 6);
  });

  it('fails a pair that does not clear its threshold', () => {
    const report = checkPalette(full({ '--text-primary': '#777777', '--bg-app': '#888888' }));
    expect(report.checked.every((result) => result.passes)).toBe(false);
  });

  it('reports a pair it cannot read rather than dropping it', () => {
    // The failure this exists to prevent: an earlier version returned only the
    // pairs it judged, so a palette in `oklch()` produced an empty list and
    // read as success. A green run that checked nothing.
    const report = checkPalette(full({ '--text-primary': 'oklch(0.7 0.1 250)' }));
    expect(report.skipped.length).toBeGreaterThan(0);
    expect(report.skipped.every((pair) => pair.unreadable.includes('--text-primary'))).toBe(
      true,
    );
  });

  it('names which side of a pair it could not read', () => {
    const report = checkPalette(full({ '--bg-app': 'color-mix(in srgb, red, blue)' }));
    const pair = report.skipped.find((entry) => entry.background === '--bg-app');
    expect(pair?.unreadable).toEqual(['--bg-app']);
  });

  it('blames only the foreground when only the foreground is unreadable', () => {
    // The mirror of the case above. Without both, a version that always blames
    // both sides passes: every assertion about one side still holds.
    const report = checkPalette(full({ '--text-invalid': 'oklch(0.6 0.2 20)' }));
    const pair = report.skipped.find((entry) => entry.foreground === '--text-invalid');
    expect(pair?.unreadable).toEqual(['--text-invalid']);
  });

  it('names both sides when neither reads', () => {
    const report = checkPalette({});
    expect(report.checked).toEqual([]);
    expect(report.skipped).toHaveLength(CONTRAST_PAIRS.length);
    expect(report.skipped[0]?.unreadable).toHaveLength(2);
  });

  it('carries the missing tokens through', () => {
    expect(checkPalette({}).missing).toEqual(REQUIRED_TOKENS);
    expect(checkPalette(full({})).missing).toEqual([]);
  });

  it('accounts for every pair, either checked or skipped', () => {
    // The invariant that makes a summary trustworthy: nothing vanishes.
    const report = checkPalette(full({ '--text-primary': 'oklch(0.7 0.1 250)' }));
    expect(report.checked.length + report.skipped.length).toBe(CONTRAST_PAIRS.length);
  });

  it('reads the threshold from the pair, not from a constant', () => {
    const report = checkPalette(full({}));
    expect(report.checked[0]?.minimum).toBe(AA_NORMAL);
  });

  it('carries `where` through, so a failure names something findable', () => {
    const report = checkPalette(full({ '--text-muted': '#6f7783', '--bg-app': '#16181d' }));
    const pair = report.checked.find(
      (result) => result.foreground === '--text-muted' && result.background === '--bg-app',
    );
    expect(pair?.where).toContain('nav heading');
    expect(pair?.passes).toBe(false);
  });
});
