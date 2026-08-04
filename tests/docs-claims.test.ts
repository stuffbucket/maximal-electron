import { describe, expect, it } from 'vitest';

import {
  constants,
  links,
  npmScripts,
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
