import { describe, expect, it } from 'vitest';

import {
  AA_NORMAL,
  CONTRAST_PAIRS,
  checkPalette,
  contrastRatio,
  luminance,
  meets,
  parseHex,
} from '../src/renderer/lib/contrast.js';

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

describe('checkPalette', () => {
  it('judges each pair against its own threshold', () => {
    const results = checkPalette({ '--text-primary': '#ffffff', '--bg-app': '#000000' });
    const pair = results.find((result) => result.foreground === '--text-primary');
    expect(pair?.passes).toBe(true);
    expect(pair?.ratio).toBeCloseTo(21, 6);
  });

  it('fails a pair that does not clear its threshold', () => {
    const results = checkPalette({ '--text-primary': '#777777', '--bg-app': '#888888' });
    expect(results.every((result) => result.passes)).toBe(false);
  });

  it('skips a pair whose colours it cannot read, rather than failing it', () => {
    // A consumer's palette may define a token in a form this cannot parse, or
    // not at all. Reporting that as a contrast violation would be a guess, and
    // a check that reports guesses is a check nobody runs.
    expect(checkPalette({})).toEqual([]);
    // A token present but unreadable, and a token absent, are both skipped.
    expect(checkPalette({ '--text-primary': '#fff' })).toEqual([]);
    expect(checkPalette({ '--text-primary': 'oklch(0.7 0.1 250)', '--bg-app': '#000' })).toEqual(
      [],
    );
  });

  it('reads the threshold from the pair, not from a constant', () => {
    const results = checkPalette({ '--text-primary': '#ffffff', '--bg-app': '#000000' });
    expect(results[0]?.minimum).toBe(AA_NORMAL);
  });

  it('carries `where` through, so a failure names something findable', () => {
    const results = checkPalette({ '--text-muted': '#6f7783', '--bg-app': '#16181d' });
    const pair = results.find((result) => result.foreground === '--text-muted');
    expect(pair?.where).toContain('nav heading');
    expect(pair?.passes).toBe(false);
  });
});
