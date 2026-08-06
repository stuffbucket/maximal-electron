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
 * Every individual selector in a stylesheet, in source order.
 *
 * A style rule's own body is stepped over rather than parsed: a rule nested
 * inside `.sb-shell .tab { … }` is already confined by the selector this
 * returns, so judging it again would report a scoped rule as bare.
 */
export function selectors(css) {
  const found = [];
  /** What the innermost open block holds. The document holds rules. */
  const holds = ['rules'];
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

      if (holds.at(-1) !== 'rules') holds.push('declarations');
      else if (head.startsWith('@')) {
        holds.push(NESTS_RULES.has(atRuleName(head)) ? 'rules' : 'declarations');
      } else {
        found.push(...splitSelectorList(head));
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
