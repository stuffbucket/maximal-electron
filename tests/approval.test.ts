import { describe, expect, it } from 'vitest';

import {
  MAX_SUMMARY,
  describeToolCall,
  needsApproval,
} from '../src/main/native/approval.js';

/**
 * The approval gate is the only thing between a local model and a shell on the
 * user's machine, so these tests are written against the failure it must not
 * have: quietly deciding that something does not need asking about.
 *
 * `approval.ts` is in the stryker mutate list. Every branch below is there to
 * kill a specific mutant, not for coverage.
 */

describe('needsApproval', () => {
  it('never asks under "none"', () => {
    for (const tool of ['read', 'write', 'edit', 'bash']) {
      expect(needsApproval('none', tool)).toBe(false);
    }
  });

  it('always asks under "all", including for reads', () => {
    for (const tool of ['read', 'write', 'edit', 'bash']) {
      expect(needsApproval('all', tool)).toBe(true);
    }
  });

  describe('under "writes"', () => {
    it('lets a read through', () => {
      expect(needsApproval('writes', 'read')).toBe(false);
    });

    it.each(['write', 'edit', 'bash'])('asks before %s', (tool) => {
      expect(needsApproval('writes', tool)).toBe(true);
    });

    // The allow-list is the point. A tool this build has never heard of must
    // default to asking, so adding one cannot widen what runs unattended.
    it('asks before a tool it does not recognise', () => {
      expect(needsApproval('writes', 'fetch')).toBe(true);
      expect(needsApproval('writes', '')).toBe(true);
    });
  });
});

describe('describeToolCall', () => {
  it('shows the command for bash, because that is what carries the risk', () => {
    expect(describeToolCall('bash', { command: 'rm -rf build', timeout: 30 })).toBe(
      'rm -rf build',
    );
  });

  it('shows the path for a file tool', () => {
    expect(describeToolCall('write', { path: '/tmp/notes.txt', content: 'hi' })).toBe(
      '/tmp/notes.txt',
    );
  });

  it('prefers the command when a call carries both', () => {
    expect(describeToolCall('bash', { command: 'cat x', path: '/etc/passwd' })).toBe(
      'cat x',
    );
  });

  it('falls back to the arguments for an unknown shape', () => {
    expect(describeToolCall('fetch', { url: 'https://example.com' })).toBe(
      '{"url":"https://example.com"}',
    );
  });

  it('does not treat a non-string command as the summary', () => {
    // A malformed call must not render `undefined` or `[object Object]` as if
    // it were the command the user is approving.
    expect(describeToolCall('bash', { command: 42 })).toBe('{"command":42}');
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'raw'],
  ])('survives %s arguments', (_label, args) => {
    expect(() => describeToolCall('bash', args)).not.toThrow();
  });

  describe('truncation', () => {
    it('leaves a summary at the limit untouched', () => {
      const exact = 'a'.repeat(MAX_SUMMARY);
      expect(describeToolCall('bash', { command: exact })).toBe(exact);
    });

    it('marks a longer summary as cut', () => {
      const long = 'a'.repeat(MAX_SUMMARY + 50);
      const result = describeToolCall('bash', { command: long });

      expect(result).toHaveLength(MAX_SUMMARY);
      expect(result.endsWith('…')).toBe(true);
    });
  });

  it('still describes a cyclic argument object', () => {
    // This runs inside the gate. A throw here would deny by accident rather
    // than by decision, and the user would never learn why. Assert the value,
    // not just that it did not throw: returning nothing is the same failure,
    // because an empty prompt reads as harmless.
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(describeToolCall('mystery', cyclic)).toBe('[object Object]');
  });
});
