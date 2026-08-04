/**
 * What a documentation check can decide.
 *
 * Prose style is a judgement and no tool has it. These four questions are not
 * judgements: a name either exists or it does not. Every documentation defect
 * found in this repository has been one of them.
 *
 * | Defect | Rule |
 * | --- | --- |
 * | `npm run lint:docs` after the script was deleted | `npmScripts` |
 * | `READ_ONLY_TOOLS`, three refactors stale | `constants` |
 * | `MIN_SCREENSHOT_BYTES`, replaced the same day | `constants` |
 * | A link to a file that moved | `links` |
 *
 * Kept pure, and separate from the script that walks the tree, so the matching
 * is unit tested rather than trusted.
 */

/** Strip fenced code blocks. Their contents are examples, not claims. */
export function withoutFences(text) {
  return text.replace(/^```[\s\S]*?^```/gm, '');
}

/** Every `npm run <name>` named in prose. */
export function npmScripts(text) {
  return [...withoutFences(text).matchAll(/`npm run ([a-z][a-z0-9:-]*)`/g)].map(
    (match) => match[1],
  );
}

/**
 * Backticked SCREAMING_SNAKE names.
 *
 * Four characters and up, because `ID` and `URL` appear in prose as words.
 * A trailing `()` or a leading `--` is excluded elsewhere; this is only the
 * shape that constants, fuses, and environment variables share.
 */
export function constants(text) {
  return [...withoutFences(text).matchAll(/`([A-Z][A-Z0-9_]{3,})`/g)].map(
    (match) => match[1],
  );
}

/** Relative markdown link targets, with any anchor removed. */
export function links(text) {
  return [...text.matchAll(/]\((?!https?:|mailto:|#)([^)\s]+)\)/g)].map((match) =>
    (match[1] ?? '').split('#')[0],
  );
}
