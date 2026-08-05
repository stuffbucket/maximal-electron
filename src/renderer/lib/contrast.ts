/**
 * What the shell requires of a palette.
 *
 * The values in `tokens.css` are a reference default. A consumer of this shell
 * supplies their own, the same way `lib/data.ts` says to supply your own data,
 * so asserting *these* hex values in CI would be gating on sample content.
 *
 * What does belong to the shell is the list below: which token is drawn on
 * which surface, and therefore which pairs have to be legible. That is a claim
 * about the shell's own markup, and it holds whoever supplies the colours.
 *
 * So this module ships. The maths and the pair list are checked in CI; whether
 * a given palette satisfies them is checked by `npm run check:contrast`, and
 * by whatever a consumer runs against theirs.
 *
 * WCAG 2.2 contrast, from the relative-luminance definition in the
 * specification. Only opaque colours: a token defined as `rgb(r g b / a)`
 * composites against whatever is behind it, which this cannot know.
 */

/** The ratio normal text must reach. Large text may use `AA_LARGE`. */
export const AA_NORMAL = 4.5;
/** 18pt, or 14pt bold. Nothing in this shell qualifies at present. */
export const AA_LARGE = 3;

export interface ContrastPair {
  /** The token drawn in the foreground. */
  foreground: string;
  /** The token it is drawn on. */
  background: string;
  /** Where this happens, so a failure names something findable. */
  where: string;
  /** The threshold this pair has to clear. */
  minimum: number;
}

/**
 * Every foreground-on-background pair the shell actually draws.
 *
 * Derived from the stylesheets rather than from what looks plausible. A pair
 * missing here is a pair nothing checks, so add one when a component starts
 * drawing a token on a surface that is not already listed.
 */
export const CONTRAST_PAIRS: ContrastPair[] = [
  { foreground: '--text-primary', background: '--bg-app', where: 'body text', minimum: AA_NORMAL },
  { foreground: '--text-primary', background: '--bg-canvas', where: 'canvas text', minimum: AA_NORMAL },
  { foreground: '--text-primary', background: '--bg-raised', where: 'card title', minimum: AA_NORMAL },
  { foreground: '--text-primary', background: '--bg-panel', where: 'dialog text', minimum: AA_NORMAL },
  { foreground: '--text-primary', background: '--bg-input', where: 'field value', minimum: AA_NORMAL },
  { foreground: '--text-secondary', background: '--bg-app', where: 'nav item, field label', minimum: AA_NORMAL },
  { foreground: '--text-secondary', background: '--bg-raised', where: 'card subtitle', minimum: AA_NORMAL },
  { foreground: '--text-muted', background: '--bg-app', where: 'nav heading, tab label, placeholder', minimum: AA_NORMAL },
  { foreground: '--text-muted', background: '--bg-raised', where: 'row subtitle, hint', minimum: AA_NORMAL },
  { foreground: '--text-muted', background: '--bg-canvas', where: 'empty state', minimum: AA_NORMAL },
  { foreground: '--accent', background: '--bg-app', where: 'current nav item', minimum: AA_NORMAL },
  { foreground: '--accent-contrast', background: '--accent', where: 'primary button label', minimum: AA_NORMAL },
  { foreground: '--text-on-solid', background: '--danger', where: 'danger button label', minimum: AA_NORMAL },
  { foreground: '--text-invalid', background: '--bg-app', where: 'field error', minimum: AA_NORMAL },
  { foreground: '--text-muted', background: '--bg-panel', where: 'menu item, overlay hint', minimum: AA_NORMAL },
];

/** An opaque colour, 0-255 per channel. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * Parse `#rgb` or `#rrggbb`.
 *
 * Returns undefined for anything else, including the `rgb(r g b / a)` form the
 * soft tokens use. A translucent colour has no contrast of its own, and
 * guessing what sits behind it would be worse than declining.
 */
export function parseHex(value: string): Rgb | undefined {
  const text = value.trim();
  // Tested rather than captured. Capture groups would be indexed, and
  // `noUncheckedIndexedAccess` would then require a fallback that the match
  // itself already rules out — a branch no test can reach.
  if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(text)) return undefined;

  const hex = text.slice(1);
  const width = hex.length === 3 ? 1 : 2;
  const channel = (index: number): number => {
    const part = hex.slice(index * width, index * width + width);
    return Number.parseInt(width === 1 ? part + part : part, 16);
  };

  return { r: channel(0), g: channel(1), b: channel(2) };
}

/** Relative luminance, per the WCAG definition. */
export function luminance({ r, g, b }: Rgb): number {
  const channel = (value: number): number => {
    const scaled = value / 255;
    // Stryker disable next-line EqualityOperator: the boundary is 0.04045,
    // which is 10.31 in a 0-255 channel. No integer channel value lands on it,
    // so `<` and `<=` cannot be told apart by any colour. The specification
    // says `<=`, and that is why it says `<=`.
    return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio, between 1 and 21. Order of the arguments does not matter. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const first = luminance(a);
  const second = luminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

export interface PairResult extends ContrastPair {
  ratio: number;
  passes: boolean;
}

/**
 * Whether a ratio clears a threshold.
 *
 * Its own function because the boundary is the part that gets written wrong:
 * WCAG says a ratio *of* 4.5 passes, so this is `>=`. Exactly 4.5 is a case a
 * palette can be tuned onto deliberately.
 */
export function meets(ratio: number, minimum: number): boolean {
  return ratio >= minimum;
}

/**
 * Check a palette against the pairs above.
 *
 * `palette` maps a token name to its value. A pair whose colours are missing
 * or translucent is skipped rather than failed: this cannot know what a
 * consumer meant by a token it does not recognise, and reporting a guess as a
 * violation would make the check worth ignoring.
 */
export function checkPalette(palette: Record<string, string>): PairResult[] {
  const results: PairResult[] = [];

  for (const pair of CONTRAST_PAIRS) {
    const front = palette[pair.foreground];
    const back = palette[pair.background];
    if (front === undefined || back === undefined) continue;

    const foreground = parseHex(front);
    const background = parseHex(back);
    if (!foreground || !background) continue;

    const ratio = contrastRatio(foreground, background);
    results.push({ ...pair, ratio, passes: meets(ratio, pair.minimum) });
  }

  return results;
}
