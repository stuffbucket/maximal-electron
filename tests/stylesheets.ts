import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * What the two stylesheet contracts are, and how to tell them apart.
 *
 * `src/renderer/styles/` holds both. The shell's own palette is checked by
 * `tests/contrast.test.ts` against `REQUIRED_TOKENS`; the public package's is
 * the `--shell-*` namespace that `structural.css` reads, `README.md` documents,
 * and `tests/package-styles.test.ts` checks.
 *
 * They used to be told apart by a filename: `contrast.test.ts` skipped
 * `structural.css`. That exclusion was added when `structural.css` arrived and
 * broke the `REQUIRED_TOKENS` tripwire, and it holds only while there is one
 * file on each side. The namespace is the real distinction, so this module
 * classifies tokens and both tests share it.
 *
 * Not a `.test.ts` file, so Vitest does not collect it.
 */

const STYLES = new URL('../src/renderer/styles/', import.meta.url);
const RENDERER = new URL('../src/renderer/', import.meta.url);

/** The prefix that marks a token as the consumer's to supply. */
export const PACKAGE_NAMESPACE = '--shell-';

/** Whether a token belongs to the public package's contract. */
export function isPackageToken(token: string): boolean {
  return token.startsWith(PACKAGE_NAMESPACE);
}

/** Every stylesheet in the shell's style directory, as name and text. */
export function stylesheets(): [string, string][] {
  return readdirSync(STYLES)
    .filter((name) => name.endsWith('.css'))
    .map((name) => [name, readFileSync(new URL(name, STYLES), 'utf8')]);
}

/** Every `var(--…)` a stylesheet reads, in source order and with repeats. */
export function readTokens(css: string): string[] {
  return [...css.matchAll(/var\((--[a-z0-9-]+)/gi)].map((match) => match[1] ?? '');
}

/**
 * Every `--shell-*` token a stylesheet reads, split by whether it has a
 * fallback. A token read as `var(--shell-x)` is the consumer's to define; one
 * read as `var(--shell-x, 8px)` already has a value.
 */
export function packageReads(css: string): { required: Set<string>; optional: Set<string> } {
  const required = new Set<string>();
  const optional = new Set<string>();

  for (const match of css.matchAll(/var\((--shell-[a-z0-9-]+)\s*(,)?/gi)) {
    const token = match[1];
    if (token) (match[2] ? optional : required).add(token);
  }

  return { required, optional };
}

/**
 * Every module reachable from the package's renderer entry point.
 *
 * Follows relative imports from `src/renderer/index.ts`, which is the same walk
 * `scripts/verify-exports.mjs` makes over the built output. Reading the source
 * rather than `dist/` keeps this a unit test: it needs no build, and it sees a
 * class name written in a template literal that the emitter has since flattened.
 */
export function exportedModules(): [string, string][] {
  const found: [string, string][] = [];
  const seen = new Set<string>();
  const pending = ['index'];

  while (pending.length > 0) {
    const specifier = pending.pop();
    if (specifier === undefined || seen.has(specifier)) continue;
    seen.add(specifier);

    // The entry re-exports with a `.js` suffix, which is what the emitter
    // wants. On disk the file is `.ts` or `.tsx`.
    const base = specifier.replace(/\.js$/, '');
    const source = ['.ts', '.tsx']
      .map((extension) => new URL(base + extension, RENDERER))
      .find((url) => existsSync(url));
    if (!source) continue;

    const text = readFileSync(source, 'utf8');
    found.push([base, text]);

    const directory = path.posix.dirname(base);
    for (const match of text.matchAll(/from\s*'(\.[^']+)'/g)) {
      const target = match[1];
      if (target !== undefined) pending.push(path.posix.join(directory, target));
    }
  }

  return found;
}

/**
 * Every class name a component writes into `className`.
 *
 * Comments are stripped first. `Button.tsx` explains itself with
 * `className="row"` in its docstring, and counting that would report the
 * dense-list-row class as one the package stylesheet owes a rule.
 *
 * A template literal contributes both its literal chunks and any quoted string
 * inside an interpolation, which is where the modifier classes live:
 * `` `icon-button${danger ? ' icon-button--danger' : ''}` ``.
 */
export function renderedClasses(source: string): string[] {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  const found = new Set<string>();
  const add = (value: string): void => {
    for (const name of value.split(/\s+/)) if (name) found.add(name);
  };

  for (const match of text.matchAll(/className="([^"]*)"/g)) add(match[1] ?? '');

  for (const match of text.matchAll(/className=\{`([^`]*)`\}/g)) {
    const template = match[1] ?? '';
    add(template.replace(/\$\{[^}]*\}/g, ' '));
    for (const interpolation of template.matchAll(/\$\{[^}]*\}/g)) {
      for (const literal of interpolation[0].matchAll(/'([^']*)'|"([^"]*)"/g)) {
        add(literal[1] ?? literal[2] ?? '');
      }
    }
  }

  return [...found].sort();
}

/** Every class a stylesheet writes a rule for. */
export function styledClasses(css: string): Set<string> {
  return new Set([...css.matchAll(/\.([a-z][a-z0-9_-]*)/gi)].map((match) => match[1] ?? ''));
}
