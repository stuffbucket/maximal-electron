/**
 * Every selector a stylesheet writes a rule for.
 *
 * The check this replaces built its list from lines starting `.` or `*` and
 * ending `,` or `{`. A rule of any other shape was not in the list and was not
 * judged, so `button { color: red; }` appended to the package stylesheet left
 * the suite green and turned every button in a consumer's application red.
 * `:root {`, `[data-theme] {` and `html, body {` went through the same gap.
 * Issue #51.
 *
 * Plain ESM rather than TypeScript in `tests/`, because
 * `scripts/verify-exports.mjs` runs the same parse over `dist/renderer/
 * styles.css` under plain `node`.
 */

/** At-rules whose body holds style rules rather than declarations. */
const NESTS_RULES = new Set([
  'media',
  'supports',
  'layer',
  'container',
  'scope',
  'starting-style',
  'document',
]);

/**
 * The subset of those whose rules reach only some readers. `@layer` is absent:
 * it orders the cascade and applies to everyone.
 */
const CONDITIONAL = new Set([
  'media',
  'supports',
  'container',
  'scope',
  'starting-style',
  'document',
]);

/** The two block kinds whose body holds style rules. */
const RULES = 'rules';
const CONDITIONAL_RULES = 'conditional rules';

/** The index after the string literal opening at `start`. */
function endOfString(text, start) {
  const quote = text[start];
  let index = start + 1;
  while (index < text.length) {
    if (text[index] === '\\') index += 2;
    else if (text[index] === quote) return index + 1;
    else index += 1;
  }
  return text.length;
}

/** The index after the parenthesised group opening at `start`. */
function endOfGroup(text, start) {
  let depth = 0;
  let index = start;
  while (index < text.length) {
    const char = text[index];
    if (char === '"' || char === "'") {
      index = endOfString(text, index);
      continue;
    }
    if (char === '(') depth += 1;
    else if (char === ')') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
    index += 1;
  }
  return text.length;
}

/** The at-rule's name, lowercased, without the `@`. */
function atRuleName(prelude) {
  return (/^@([a-z-]+)/i.exec(prelude)?.[1] ?? '').toLowerCase();
}

/**
 * A selector list split on its top-level commas.
 *
 * A comma inside `:is(.a, .b)` or inside `[title=","]` separates nothing.
 */
function splitSelectorList(prelude) {
  const parts = [];
  let current = '';
  let depth = 0;
  let index = 0;

  while (index < prelude.length) {
    const char = prelude[index];
    if (char === '"' || char === "'") {
      const end = endOfString(prelude, index);
      current += prelude.slice(index, end);
      index = end;
      continue;
    }
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      index += 1;
      continue;
    }
    current += char;
    index += 1;
  }
  parts.push(current);

  return parts.map((part) => part.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/**
 * Every individual selector in a stylesheet, in source order, each with whether
 * a conditional at-rule encloses it.
 *
 * A style rule's own body is stepped over rather than parsed: a rule nested
 * inside `.sb-shell .tab { … }` is already confined by the selector this
 * returns, so judging it again would report a scoped rule as bare.
 *
 * `conditional` is what tells a rule every reader gets from one only some do.
 * `.tab__emphasis` is laid out by a rule at the top level and has its animation
 * shortened by a second inside `@media (prefers-reduced-motion: reduce)`; a
 * reader who loses the first still sees the second. Issue #118.
 */
export function selectorRules(css) {
  const found = [];
  /** What the innermost open block holds. The document holds rules. */
  const holds = [RULES];
  let prelude = '';
  let index = 0;

  while (index < css.length) {
    const char = css[index];

    if (char === '/' && css[index + 1] === '*') {
      const end = css.indexOf('*/', index + 2);
      index = end === -1 ? css.length : end + 2;
      continue;
    }

    if (char === '"' || char === "'") {
      const end = endOfString(css, index);
      prelude += css.slice(index, end);
      index = end;
      continue;
    }

    if (char === '(') {
      const end = endOfGroup(css, index);
      prelude += css.slice(index, end);
      index = end;
      continue;
    }

    if (char === '{') {
      const head = prelude.trim();
      prelude = '';
      index += 1;

      const top = holds.at(-1);
      if (top !== RULES && top !== CONDITIONAL_RULES) holds.push('declarations');
      else if (head.startsWith('@')) {
        const name = atRuleName(head);
        if (CONDITIONAL.has(name)) holds.push(CONDITIONAL_RULES);
        else holds.push(NESTS_RULES.has(name) ? RULES : 'declarations');
      } else {
        const conditional = holds.includes(CONDITIONAL_RULES);
        for (const selector of splitSelectorList(head)) found.push({ selector, conditional });
        holds.push('declarations');
      }
      continue;
    }

    if (char === '}') {
      if (holds.length > 1) holds.pop();
      prelude = '';
      index += 1;
      continue;
    }

    // `@import url(…);` and any other statement at-rule. Its prelude opens no
    // block, and carrying it forward would prefix the next rule's selector.
    if (char === ';') {
      prelude = '';
      index += 1;
      continue;
    }

    prelude += char;
    index += 1;
  }

  return found;
}

/** Every individual selector in a stylesheet, in source order. */
export function selectors(css) {
  return selectorRules(css).map((rule) => rule.selector);
}

/** A class name, matched only where a selector attaches a rule to it. */
const CLASS = /\.([a-z][a-z0-9_-]*)/gi;

/**
 * Every class a stylesheet writes a rule for.
 *
 * Read out of the parsed selectors rather than out of the file's text. The
 * predecessor matched `.name` anywhere, so a class named in a comment, in a
 * `content` string, or in nothing but prose counted as styled. Issue #118.
 *
 * An attribute selector's value is dropped first: `[title='.ghost']` selects on
 * a title, not on a class.
 */
export function styledClassNames(css) {
  const found = new Set();
  for (const selector of selectors(css)) {
    for (const match of selector.replace(/\[[^\]]*]/g, ' ').matchAll(CLASS)) found.add(match[1]);
  }
  return [...found].sort();
}

/**
 * Every class a stylesheet styles on its own, under `root` and under nothing
 * else.
 *
 * The selector has to reduce to the class alone: no second class, no attribute,
 * no pseudo-class, and no conditional at-rule around it. That is the rule a
 * consumer gets whatever the element's state, and it is the one whose loss
 * `styledClassNames` cannot see — `.tab__emphasis` renamed in its base rule
 * still appears in `.tab[data-emphasis='busy'] .tab__emphasis`. Issue #118.
 *
 * `root` may be empty, for a stylesheet that scopes nothing.
 */
export function baseStyledClassNames(css, root) {
  const found = new Set();
  for (const { selector, conditional } of selectorRules(css)) {
    if (conditional || !isScoped(selector, root)) continue;
    const name = /^\.([a-z][a-z0-9_-]*)$/i.exec(selector.slice(root.length).trim())?.[1];
    if (name !== undefined) found.add(name);
  }
  return [...found].sort();
}

/**
 * Whether a selector is confined to a root class.
 *
 * The boundary matters: `.sb-shellish .tab` starts with `.sb-shell` and is a
 * different element entirely.
 */
export function isScoped(selector, root) {
  if (!selector.startsWith(root)) return false;
  const next = selector.slice(root.length, root.length + 1);
  return next === '' || !/[\w-]/.test(next);
}

/** Every selector in a stylesheet that escapes the root class. */
export function unscopedSelectors(css, root) {
  return selectors(css).filter((selector) => !isScoped(selector, root));
}
