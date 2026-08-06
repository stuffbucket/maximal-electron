import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  SELF_CHECK_FAILED,
  SELF_CHECK_FLAG,
  SELF_CHECK_OK,
  SELF_CHECK_TOKEN_FLAG,
  selfCheckCommand,
  selfCheckLine,
  selfCheckPassed,
  selfCheckRequested,
  selfCheckToken,
} from '../src/main/native/self-check.js';

const TOKEN = '0123456789abcdef';

/**
 * The argument strings are pinned to their literal value.
 *
 * They are the interface between a shipped binary and a driver that runs under
 * plain node and cannot import this module. Every other test here reads them
 * through the constant, so nothing else notices what they say.
 */
describe('the arguments', () => {
  it('are the ones the driver passes', () => {
    expect(SELF_CHECK_FLAG).toBe('--self-check=terminal');
    expect(SELF_CHECK_TOKEN_FLAG).toBe('--self-check-token=');
    expect(SELF_CHECK_OK).toBe('self-check terminal: ok');
    expect(SELF_CHECK_FAILED).toBe('self-check terminal: failed');
  });
});

describe('selfCheckRequested', () => {
  it('answers only to the flag', () => {
    expect(selfCheckRequested(['/Stuffbucket', SELF_CHECK_FLAG])).toBe(true);
    expect(selfCheckRequested(['/Stuffbucket'])).toBe(false);
    expect(selfCheckRequested(['--self-check'])).toBe(false);
    expect(selfCheckRequested([])).toBe(false);
  });
});

describe('selfCheckToken', () => {
  it('reads the token off the argument', () => {
    expect(selfCheckToken([SELF_CHECK_FLAG, `${SELF_CHECK_TOKEN_FLAG}${TOKEN}`])).toBe(TOKEN);
  });

  it('is undefined when no argument carries one', () => {
    expect(selfCheckToken([SELF_CHECK_FLAG])).toBeUndefined();
    expect(selfCheckToken([TOKEN])).toBeUndefined();
  });

  it('reads the tail of an argument only after matching the flag', () => {
    // A path of the right length ending in hexadecimal is otherwise a token.
    const decoy = `${'x'.repeat(SELF_CHECK_TOKEN_FLAG.length)}${TOKEN}`;
    expect(selfCheckToken([decoy])).toBeUndefined();
  });

  it('refuses anything outside sixteen hexadecimal characters', () => {
    // The token is interpolated into a shell command. A loose pattern here is
    // an injection, so every direction is asserted rather than the happy one.
    const refuse = (value: string) => selfCheckToken([`${SELF_CHECK_TOKEN_FLAG}${value}`]);
    expect(refuse('')).toBeUndefined();
    expect(refuse('0123456789abcde')).toBeUndefined();
    expect(refuse('0123456789abcdef0')).toBeUndefined();
    expect(refuse('0123456789ABCDEF')).toBeUndefined();
    expect(refuse('0123456789abcdeg')).toBeUndefined();
    expect(refuse('; rm -rf /      ')).toBeUndefined();
    // Anchored at both ends, or a token with anything either side of it passes.
    expect(refuse(`x${TOKEN}`)).toBeUndefined();
    expect(refuse(`${TOKEN}x`)).toBeUndefined();
    expect(refuse(`${TOKEN}\n${TOKEN}`)).toBeUndefined();
  });

  it('takes the first argument that carries a valid token', () => {
    expect(
      selfCheckToken([`${SELF_CHECK_TOKEN_FLAG}nope`, `${SELF_CHECK_TOKEN_FLAG}${TOKEN}`]),
    ).toBe(TOKEN);
  });
});

describe('selfCheckCommand', () => {
  it('joins two halves, so the echo of the input cannot satisfy the check', () => {
    expect(selfCheckCommand(TOKEN)).toBe("printf '%s%s\\n' 01234567 89abcdef\r");
    // The property the whole check rests on. A pty echoes what is written to
    // it, so the command must not contain the string being looked for.
    expect(selfCheckCommand(TOKEN)).not.toContain(TOKEN);
  });

  it('ends with a carriage return, or the shell never runs the line', () => {
    expect(selfCheckCommand(TOKEN).endsWith('\r')).toBe(true);
  });
});

describe('selfCheckPassed', () => {
  it('wants the joined token somewhere in the output', () => {
    expect(selfCheckPassed(`some prompt\r\n${TOKEN}\r\n`, TOKEN)).toBe(true);
    expect(selfCheckPassed(selfCheckCommand(TOKEN), TOKEN)).toBe(false);
    expect(selfCheckPassed('', TOKEN)).toBe(false);
  });
});

describe('selfCheckLine', () => {
  it('says which it was, and prints the token only on a pass', () => {
    expect(selfCheckLine({ ok: true, token: TOKEN })).toBe(`${SELF_CHECK_OK} ${TOKEN}`);
    expect(selfCheckLine({ ok: false, reason: 'the shell exited with 1' })).toBe(
      `${SELF_CHECK_FAILED}: the shell exited with 1`,
    );
  });

  it('keeps the two lines apart', () => {
    expect(selfCheckLine({ ok: true, token: TOKEN }).startsWith(SELF_CHECK_FAILED)).toBe(false);
    expect(selfCheckLine({ ok: false, reason: 'x' }).startsWith(SELF_CHECK_OK)).toBe(false);
  });
});

/**
 * The driver runs under plain node and cannot import the module above, so it
 * holds its own copy of these three strings. Drift between them would launch
 * the application with an argument it ignores.
 */
describe('the driver and the application agree', () => {
  const driver = readFileSync(new URL('../scripts/smoke-packaged.mjs', import.meta.url), 'utf8');

  it('finds the driver, so an empty read cannot pass', () => {
    expect(driver.length).toBeGreaterThan(0);
  });

  for (const value of [SELF_CHECK_FLAG, SELF_CHECK_TOKEN_FLAG, SELF_CHECK_FAILED]) {
    it(`scripts/smoke-packaged.mjs names ${value}`, () => {
      expect(driver).toContain(value);
    });
  }
});
