import { describe, expect, it } from 'vitest';

import {
  codeSpans,
  constants,
  links,
  npmScripts,
  npmScriptsOutOfScope,
  repoPaths,
  withoutFences,
} from '../scripts/docs-claims.mjs';

/**
 * What the documentation checker matches.
 *
 * The repository removed a prose linter because its rules could not tell a
 * rule from a description or an identifier from an English word. These rules
 * make no such judgement: they extract names, and the script asks whether each
 * one exists. The risk here is the opposite one — a rule so eager that it
 * reports a path in another repository, or a placeholder, as a defect. An
 * earlier version did exactly that and was cut.
 *
 * So these tests pin what is deliberately NOT matched as hard as what is.
 */

describe('withoutFences', () => {
  it('drops fenced blocks, because their contents are examples', () => {
    const text = ['before', '```bash', 'npm run imaginary', '```', 'after'].join(
      '\n',
    );
    expect(withoutFences(text)).toContain('before');
    expect(withoutFences(text)).toContain('after');
    expect(withoutFences(text)).not.toContain('imaginary');
  });

  it('drops several blocks, not just the first', () => {
    const text = ['```', 'one', '```', 'mid', '```', 'two', '```'].join('\n');
    const stripped = withoutFences(text);
    expect(stripped).not.toContain('one');
    expect(stripped).not.toContain('two');
    expect(stripped).toContain('mid');
  });
});

describe('npmScripts', () => {
  it('finds a script named in prose', () => {
    expect(npmScripts('Run `npm run verify:package` first.')).toEqual([
      'verify:package',
    ]);
  });

  it('finds every script on a line', () => {
    // The commands table lists two in one cell.
    expect(npmScripts('`npm run lint`, `npm run lint:fix`')).toEqual([
      'lint',
      'lint:fix',
    ]);
  });

  it('ignores a script inside a fenced block', () => {
    // A block is a worked example and may show a command from another project.
    const text = ['```bash', 'npm run something-else', '```'].join('\n');
    expect(npmScripts(text)).toEqual([]);
  });

  it('ignores an unbackticked mention', () => {
    expect(npmScripts('You can npm run whatever you like.')).toEqual([]);
  });

  it('finds both halves of a compound command in one span', () => {
    // The commands table writes this in a single pair of backticks. An
    // anchored rule matched the first and dropped the second in silence, so
    // `test:e2e` was named in three documents and checked in none.
    expect(npmScripts('`npm run package && npm run test:e2e`')).toEqual([
      'package',
      'test:e2e',
    ]);
  });

  it('finds a script named with an argument after it', () => {
    expect(npmScripts('`npm run compose -- <name>`')).toEqual(['compose']);
  });

  it('still refuses a mention that only looks like one', () => {
    // Widening the rule inside a span must not widen what counts as a span.
    expect(npmScripts('`the npm running joke`')).toEqual([]);
  });
});

describe('npmScriptsOutOfScope', () => {
  it('counts what the fence rule deliberately drops', () => {
    const text = ['`npm run lint`', '```bash', 'npm run other', '```'].join('\n');
    expect(npmScriptsOutOfScope(text)).toBe(1);
  });

  it('is zero when every mention is a claim', () => {
    expect(npmScriptsOutOfScope('`npm run lint`')).toBe(0);
  });
});

describe('codeSpans', () => {
  it('returns the contents of each span, fences removed', () => {
    const text = ['`a` and `b`', '```', '`c`', '```'].join('\n');
    expect(codeSpans(text)).toEqual(['a', 'b']);
  });

  it('does not join two spans across a line break', () => {
    expect(codeSpans('`a`\ntext\n`b`')).toEqual(['a', 'b']);
  });
});

describe('repoPaths', () => {
  const roots = ['scripts', 'src', 'docs'];

  it('finds a backticked path under a declared root', () => {
    expect(repoPaths('See `scripts/verify-docs.mjs`.', roots)).toEqual([
      'scripts/verify-docs.mjs',
    ]);
  });

  it('trims a line reference to the file it points at', () => {
    expect(repoPaths('`scripts/storybook-check.mjs:152` gives up.', roots)).toEqual([
      'scripts/storybook-check.mjs',
    ]);
  });

  it('keeps a glob, because a pattern matching nothing is the defect', () => {
    expect(repoPaths('`src/renderer/*.html`', roots)).toEqual(['src/renderer/*.html']);
  });

  it('ignores a span that is a command rather than a path', () => {
    // `npm run x` and a sentence in backticks both start with no root, and a
    // span with a space in it is prose however it starts.
    expect(repoPaths('`npm run package` and `scripts/a.mjs and more`', roots)).toEqual([]);
  });

  it('ignores a bare root, which is an English word', () => {
    expect(repoPaths('The `scripts` directory and `src`.', roots)).toEqual([]);
  });

  it('ignores a path under a root that was not declared', () => {
    expect(repoPaths('`node_modules/foo/index.js`', roots)).toEqual([]);
  });

  it('ignores a path inside a fenced block', () => {
    const text = ['```', 'scripts/from-another-project.mjs', '```'].join('\n');
    expect(repoPaths(text, roots)).toEqual([]);
  });
});

describe('constants', () => {
  it('finds a backticked SCREAMING_SNAKE name', () => {
    expect(constants('`MIN_BYTES_PER_PIXEL` is the floor.')).toEqual([
      'MIN_BYTES_PER_PIXEL',
    ]);
  });

  it('finds an environment variable, which shares the shape', () => {
    expect(constants('Set `STUFFBUCKET_E2E` to 1.')).toEqual(['STUFFBUCKET_E2E']);
  });

  it('ignores short all-caps words that are prose', () => {
    // `ID`, `URL` and `CSP` appear in these documents as words, not symbols.
    expect(constants('The `ID` in the `CSP` and the `URL`.')).toEqual([]);
  });

  it('ignores a name that is not backticked', () => {
    expect(constants('READ_ONLY_TOOLS was the old name.')).toEqual([]);
  });

  it('ignores mixed case, which is a function rather than a constant', () => {
    expect(constants('`riskOf` and `getCurrentFuseWire`.')).toEqual([]);
  });
});

describe('links', () => {
  it('finds a relative target', () => {
    expect(links('See [the harness](./harness.ts).')).toEqual(['./harness.ts']);
  });

  it('strips an anchor, because the file is what has to exist', () => {
    expect(links('[a section](../AGENTS.md#tests)')).toEqual(['../AGENTS.md']);
  });

  it('ignores an external link', () => {
    // Reachability is a network question, and a check that needs the network
    // fails for reasons that have nothing to do with the change under review.
    expect(links('[docs](https://example.com/a) and [mail](mailto:a@b.c)')).toEqual(
      [],
    );
  });

  it('ignores a bare anchor', () => {
    expect(links('[up](#top)')).toEqual([]);
  });
});
