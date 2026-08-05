import { describe, expect, it } from 'vitest';

import {
  append,
  cwdMessage,
  drain,
  emptyBuffer,
  Generations,
  MAX_PENDING_BYTES,
  resolveCwd,
} from '../src/main/native/pty-session.js';

/** A filesystem, as a lookup. */
const fs = (entries: Record<string, boolean>) => (target: string) =>
  target in entries ? { isDirectory: entries[target] === true } : undefined;

describe('resolveCwd', () => {
  const HOME = '/Users/someone';

  it('falls back when no directory is asked for', () => {
    expect(resolveCwd(undefined, HOME, fs({}))).toEqual({ ok: true, cwd: HOME });
    expect(resolveCwd('', HOME, fs({}))).toEqual({ ok: true, cwd: HOME });
  });

  it('accepts an absolute directory that exists', () => {
    const result = resolveCwd('/work/repo', HOME, fs({ '/work/repo': true }));
    expect(result).toEqual({ ok: true, cwd: '/work/repo' });
  });

  it('refuses a relative path', () => {
    // It would resolve against whatever the main process happens to have,
    // which is never what the caller meant.
    expect(resolveCwd('repo', HOME, fs({ repo: true }))).toEqual({
      ok: false,
      reason: 'relative',
    });
    expect(resolveCwd('./repo', HOME, fs({})).ok).toBe(false);
    expect(resolveCwd('../repo', HOME, fs({})).ok).toBe(false);
  });

  it('accepts a Windows path on any platform', () => {
    // Deliberately not `path.isAbsolute`, which reads the host platform and
    // would call this relative when the tests run on POSIX.
    expect(resolveCwd('C:\\work', HOME, fs({ 'C:\\work': true }))).toEqual({
      ok: true,
      cwd: 'C:\\work',
    });
    expect(resolveCwd('d:/work', HOME, fs({ 'd:/work': true })).ok).toBe(true);
  });

  it('anchors the drive-letter form at the start', () => {
    // Unanchored, this matches anywhere, so a relative path with a colon in it
    // reads as absolute.
    expect(resolveCwd('work/c:/repo', HOME, fs({ 'work/c:/repo': true }))).toEqual({
      ok: false,
      reason: 'relative',
    });
  });

  it('refuses a path that does not exist', () => {
    expect(resolveCwd('/gone', HOME, fs({}))).toEqual({ ok: false, reason: 'missing' });
  });

  it('refuses a file', () => {
    expect(resolveCwd('/work/file.txt', HOME, fs({ '/work/file.txt': false }))).toEqual({
      ok: false,
      reason: 'not-a-directory',
    });
  });
});

describe('cwdMessage', () => {
  it('names the path and what is wrong with it', () => {
    expect(cwdMessage('relative', 'repo')).toBe('repo is not an absolute path');
    expect(cwdMessage('missing', '/gone')).toBe('/gone does not exist');
    expect(cwdMessage('not-a-directory', '/f.txt')).toBe('/f.txt is not a directory');
  });
});

describe('Generations', () => {
  it('hands out an increasing generation per id', () => {
    const generations = new Generations();
    expect(generations.next('a')).toBe(1);
    expect(generations.next('a')).toBe(2);
    // Ids are independent.
    expect(generations.next('b')).toBe(1);
  });

  it('recognises only the newest generation', () => {
    const generations = new Generations();
    const first = generations.next('a');
    const second = generations.next('a');
    expect(generations.isCurrent('a', first)).toBe(false);
    expect(generations.isCurrent('a', second)).toBe(true);
  });

  it('does not recognise an id it has never seen', () => {
    expect(new Generations().isCurrent('a', 1)).toBe(false);
  });

  it('releases only for the current generation', () => {
    const generations = new Generations();
    const stale = generations.next('a');
    const live = generations.next('a');

    // This is the bug. A killed session's exit arrives late, after the id was
    // reused. Acting on it would delete the live session.
    expect(generations.release('a', stale)).toBe(false);
    expect(generations.isCurrent('a', live)).toBe(true);

    expect(generations.release('a', live)).toBe(true);
    expect(generations.isCurrent('a', live)).toBe(false);
  });

  it('counts from the last generation after a release', () => {
    // Release deletes the entry, so a naive implementation restarts at 1 and
    // hands a new session the number a stale callback is still holding.
    const generations = new Generations();
    const first = generations.next('a');
    generations.release('a', first);
    const second = generations.next('a');
    expect(second).not.toBe(first);
  });
});

describe('append and drain', () => {
  it('keeps everything under the limit', () => {
    const buffer = emptyBuffer();
    append(buffer, 'one');
    append(buffer, 'two');
    expect(drain(buffer)).toEqual({ text: 'onetwo', dropped: 0 });
  });

  it('empties the buffer', () => {
    const buffer = emptyBuffer();
    append(buffer, 'x');
    drain(buffer);
    expect(drain(buffer)).toEqual({ text: '', dropped: 0 });
  });

  it('keeps exactly the limit without dropping', () => {
    // The boundary. Written as `>=` this drops a character at the one length a
    // buffer is most likely to sit at.
    const buffer = emptyBuffer();
    append(buffer, 'abcd', 4);
    expect(drain(buffer)).toEqual({ text: 'abcd', dropped: 0 });
  });

  it('drops from the front, and only the overflow', () => {
    const buffer = emptyBuffer();
    append(buffer, 'abcdef', 4);
    // The newest output is what a user is looking at, so the front goes.
    expect(drain(buffer)).toEqual({ text: 'cdef', dropped: 2 });
  });

  it('accumulates dropped counts across appends', () => {
    const buffer = emptyBuffer();
    append(buffer, 'aa', 3);
    append(buffer, 'bb', 3);
    append(buffer, 'cc', 3);
    const result = drain(buffer);
    expect(result.text).toBe('bcc');
    expect(result.dropped).toBe(3);
  });

  it('resets the dropped count after draining', () => {
    const buffer = emptyBuffer();
    append(buffer, 'aaaa', 1);
    drain(buffer);
    append(buffer, 'cc');
    expect(drain(buffer).dropped).toBe(0);
  });

  it('has a limit large enough for a build log burst', () => {
    expect(MAX_PENDING_BYTES).toBeGreaterThan(100_000);
  });
});
