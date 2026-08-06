/**
 * What a documentation check can decide.
 *
 * Prose style is a judgement and no tool has it. These questions are not
 * judgements: a name either exists or it does not. Every documentation defect
 * found in this repository has been one of them.
 *
 * | Defect | Rule |
 * | --- | --- |
 * | `npm run lint:docs` after the script was deleted | `npmScripts` |
 * | `READ_ONLY_TOOLS`, three refactors stale | `constants` |
 * | `MIN_SCREENSHOT_BYTES`, replaced the same day | `constants` |
 * | A link to a file that moved | `links` |
 * | A backticked path to a script that was never written | `repoPaths` |
 *
 * Kept pure, and separate from the script that walks the tree, so the matching
 * is unit tested rather than trusted.
 */

/** Strip fenced code blocks. Their contents are examples, not claims. */
export function withoutFences(text) {
  return text.replace(/^```[\s\S]*?^```/gm, '');
}

/**
 * The contents of every inline code span, fenced blocks removed.
 *
 * A backtick pair is the boundary between prose and a name. Matching names
 * outside one reports "you can npm run whatever you like" as a claim, which is
 * how the prose linter this replaced earned its removal.
 */
export function codeSpans(text) {
  return [...withoutFences(text).matchAll(/`([^`\n]+)`/g)].map((match) => match[1]);
}

/**
 * A `npm run <name>` mention, wherever it appears.
 *
 * One pattern for both rules below. Two copies drifted apart in nothing but
 * mutation score: every mutant of the second copy survived, because the count
 * it feeds is a length rather than a list of names.
 */
const NPM_RUN = /\bnpm run ([a-z][a-z0-9:-]*)/g;

/**
 * Every `npm run <name>` named in prose.
 *
 * Matched inside a span rather than against a whole span. The commands table
 * writes `npm run package && npm run test:e2e` in one pair of backticks, and
 * an anchored rule read the first of the two and dropped the second in
 * silence.
 */
export function npmScripts(text) {
  return codeSpans(text).flatMap((span) =>
    [...span.matchAll(NPM_RUN)].map((match) => match[1]),
  );
}

/**
 * Every backticked path into this repository, under one of `roots`.
 *
 * A whole span, so `npm run package` and a sentence are not paths, and a
 * `:142` line reference is trimmed to the file it points at. Globs are
 * returned as written: the caller decides whether a pattern matching nothing
 * is a defect, and here it is.
 *
 * A colon cannot appear in a path this repository carries — Windows forbids one
 * in a file name — so everything from the first colon is a location, whether it
 * is `:142` or `:142:7`.
 */
export function repoPaths(text, roots) {
  return codeSpans(text)
    .map((span) => span.trim().split(':')[0])
    .filter((span) => !/\s/.test(span))
    .filter((span) => roots.some((root) => span.startsWith(root + '/')));
}

/**
 * Every `npm run <name>` this deliberately does not check.
 *
 * A fenced block is a worked example and may show a command from another
 * project, and a mention outside a code span is prose. Both are choices, and
 * 29 of the 101 mentions in these documents fall into them. Counting them is
 * how the choice stays visible in the output instead of looking like coverage.
 */
export function npmScriptsOutOfScope(text) {
  const all = [...text.matchAll(NPM_RUN)].length;
  return all - npmScripts(text).length;
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
  return [...text.matchAll(/]\((?!https?:|mailto:|#)([^)\s]+)\)/g)].map(
    (match) => match[1].split('#')[0],
  );
}
