import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  CRASH_LIMIT,
  CRASH_WINDOW_MS,
  LLAMA_CHECK_FAILED,
  LLAMA_CHECK_FLAG,
  LLAMA_CHECK_OK,
  describeEngineExit,
  exhaustedMessage,
  faultName,
  llamaCheckLine,
  llamaCheckRequested,
  mayRestart,
  parseEngineEvent,
  recentCrashes,
} from '../src/main/native/llama-protocol.js';

/**
 * The engine boundary, from the main process side.
 *
 * The engine is expected to die badly. Everything here is about what the
 * supervisor does with a number it is handed after that has happened, so the
 * cases are the numbers a real fault produces rather than a happy path.
 */

describe('faultName', () => {
  it('names the POSIX signals a native abort produces', () => {
    expect(faultName(6, 'darwin')).toBe('SIGABRT');
    expect(faultName(11, 'darwin')).toBe('SIGSEGV');
    expect(faultName(8, 'darwin')).toBe('SIGFPE');
    expect(faultName(4, 'darwin')).toBe('SIGILL');
    expect(faultName(5, 'darwin')).toBe('SIGTRAP');
    expect(faultName(9, 'darwin')).toBe('SIGKILL');
  });

  it('knows SIGBUS is a different number on each platform', () => {
    // Reproduced against a real llama.cpp mapping fault, which is signal 10 on
    // macOS and 7 on Linux. One constant would name the wrong fault on one of
    // them, which is worse than saying nothing.
    expect(faultName(10, 'darwin')).toBe('SIGBUS');
    expect(faultName(7, 'linux')).toBe('SIGBUS');
    expect(faultName(7, 'darwin')).toBeUndefined();
    expect(faultName(10, 'linux')).toBeUndefined();
  });

  it('has no SIGBUS number for a platform it does not know', () => {
    expect(faultName(10, 'freebsd')).toBeUndefined();
    expect(faultName(7, 'freebsd')).toBeUndefined();
    expect(faultName(6, 'freebsd')).toBe('SIGABRT');
  });

  it('reads a Windows status code instead of a signal', () => {
    expect(faultName(0xc0000005, 'win32')).toBe('access violation');
    expect(faultName(0xc0000374, 'win32')).toBe('heap corruption');
    expect(faultName(0xc0000409, 'win32')).toBe('stack buffer overrun');
    expect(faultName(0xc000001d, 'win32')).toBe('illegal instruction');
  });

  it('names an unlisted Windows status code by its number', () => {
    expect(faultName(0xc0000006, 'win32')).toBe('native fault 0xc0000006');
    expect(faultName(0xc0000000, 'win32')).toBe('native fault 0xc0000000');
  });

  it('does not read a Windows signal number as a fault', () => {
    // On Windows 6 and 11 are ordinary exit codes, not signals.
    expect(faultName(6, 'win32')).toBeUndefined();
    expect(faultName(11, 'win32')).toBeUndefined();
    expect(faultName(0xbfffffff, 'win32')).toBeUndefined();
  });

  it('treats an ordinary exit code as no fault', () => {
    expect(faultName(0, 'darwin')).toBeUndefined();
    expect(faultName(1, 'darwin')).toBeUndefined();
    expect(faultName(2, 'darwin')).toBeUndefined();
    expect(faultName(3, 'darwin')).toBeUndefined();
    expect(faultName(12, 'darwin')).toBeUndefined();
  });
});

describe('describeEngineExit', () => {
  it('says nothing alarming about a clean stop', () => {
    expect(describeEngineExit(0, 'darwin')).toBe('The model engine stopped.');
  });

  it('names the fault, and says the application is unaffected', () => {
    const message = describeEngineExit(6, 'darwin');
    expect(message).toContain('SIGABRT');
    expect(message).toContain('Nothing else was affected');
    // The two things a user can act on, both named, and the one instruction.
    expect(message).toContain('corrupt');
    expect(message).toContain('memory');
    expect(message).toContain('Delete the downloaded weights and try again.');
  });

  it('reports a code it cannot name as a code', () => {
    const message = describeEngineExit(1, 'darwin');
    expect(message).toContain('exited with code 1');
    expect(message).toContain('Nothing else was affected');
    expect(message).not.toContain('native code');
  });

  it('keeps the fault message and the plain one apart', () => {
    expect(describeEngineExit(11, 'darwin')).not.toBe(describeEngineExit(1, 'darwin'));
    expect(describeEngineExit(11, 'darwin')).toContain('native code');
  });
});

describe('parseEngineEvent', () => {
  it('reads a message off the port', () => {
    expect(parseEngineEvent({ kind: 'delta', id: 'a', text: 'hi' })).toEqual({
      kind: 'delta',
      id: 'a',
      text: 'hi',
    });
  });

  it('drops anything that is not a message', () => {
    // The port is the seam to a process that is expected to die badly. A
    // half-written message on the way down must not become an exception.
    expect(parseEngineEvent(undefined)).toBeUndefined();
    expect(parseEngineEvent(null)).toBeUndefined();
    expect(parseEngineEvent('delta')).toBeUndefined();
    expect(parseEngineEvent(42)).toBeUndefined();
    expect(parseEngineEvent([])).toBeUndefined();
    expect(parseEngineEvent({})).toBeUndefined();
    expect(parseEngineEvent({ kind: 7, id: 'a' })).toBeUndefined();
    expect(parseEngineEvent({ kind: 'delta' })).toBeUndefined();
    expect(parseEngineEvent({ kind: 'delta', id: 7 })).toBeUndefined();
  });

  it('accepts an array only through the object test, never as one', () => {
    expect(parseEngineEvent(['kind', 'id'])).toBeUndefined();
  });
});

describe('the restart budget', () => {
  const now = 1_000_000;

  it('forgets a crash older than the window', () => {
    expect(recentCrashes([now - CRASH_WINDOW_MS - 1], now)).toEqual([]);
    expect(recentCrashes([now - CRASH_WINDOW_MS], now)).toEqual([]);
    expect(recentCrashes([now - CRASH_WINDOW_MS + 1], now)).toEqual([
      now - CRASH_WINDOW_MS + 1,
    ]);
    expect(recentCrashes([now], now)).toEqual([now]);
  });

  it('keeps every crash inside the window, in order', () => {
    const times = [now - 3, now - 2, now - 1];
    expect(recentCrashes(times, now)).toEqual(times);
  });

  it('is empty for a process that has never crashed', () => {
    expect(recentCrashes([], now)).toEqual([]);
  });

  it('allows a restart until the budget is spent', () => {
    expect(mayRestart([], now)).toBe(true);
    expect(mayRestart([now, now], now)).toBe(true);
    expect(mayRestart(Array.from({ length: CRASH_LIMIT }, () => now), now)).toBe(false);
    expect(mayRestart(Array.from({ length: CRASH_LIMIT + 1 }, () => now), now)).toBe(false);
  });

  it('lets an old crash stop counting', () => {
    const stale = Array.from({ length: CRASH_LIMIT }, () => now - CRASH_WINDOW_MS - 1);
    expect(mayRestart(stale, now)).toBe(true);
  });

  it('says why it stopped, and that a restart fixes it', () => {
    const message = exhaustedMessage('The model engine crashed.');
    expect(message).toContain('The model engine crashed.');
    expect(message).toContain(String(CRASH_LIMIT));
    expect(message).toContain('restarts');
  });
});

describe('the packaged llama check', () => {
  /**
   * Pinned to their literal value. They are the interface between a shipped
   * binary and a driver that runs under plain node and cannot import this
   * module. Every other test here reads them through the constant, so nothing
   * else notices what they say.
   */
  it('uses the argument strings the driver passes', () => {
    expect(LLAMA_CHECK_FLAG).toBe('--self-check=llama');
    expect(LLAMA_CHECK_OK).toBe('self-check llama: ok');
    expect(LLAMA_CHECK_FAILED).toBe('self-check llama: failed');
  });

  it('answers only to the flag', () => {
    expect(llamaCheckRequested(['/Stuffbucket', LLAMA_CHECK_FLAG])).toBe(true);
    expect(llamaCheckRequested(['/Stuffbucket'])).toBe(false);
    expect(llamaCheckRequested(['--self-check=terminal'])).toBe(false);
    expect(llamaCheckRequested([])).toBe(false);
  });

  it('names the backend and the crash it walked away from', () => {
    // "ok" alone would also be printed by a check that forked nothing.
    expect(llamaCheckLine({ ok: true, device: 'metal', survived: 'SIGABRT' })).toBe(
      `${LLAMA_CHECK_OK} device=metal survived=SIGABRT`,
    );
  });

  it('says why it failed', () => {
    expect(llamaCheckLine({ ok: false, reason: 'no engine' })).toBe(
      `${LLAMA_CHECK_FAILED}: no engine`,
    );
  });

  it('keeps the two lines apart', () => {
    const pass = llamaCheckLine({ ok: true, device: 'cpu', survived: 'x' });
    expect(pass.startsWith(LLAMA_CHECK_FAILED)).toBe(false);
    expect(llamaCheckLine({ ok: false, reason: 'x' }).startsWith(LLAMA_CHECK_OK)).toBe(false);
  });
});

/**
 * The driver runs under plain node and cannot import this module, so it holds
 * its own copy of these strings. Drift would launch the application with an
 * argument it ignores, and the check would pass on a build that forked nothing.
 */
describe('the driver and the application agree', () => {
  const driver = readFileSync(new URL('../scripts/smoke-packaged.mjs', import.meta.url), 'utf8');

  it('finds the driver, so an empty read cannot pass', () => {
    expect(driver.length).toBeGreaterThan(0);
  });

  for (const value of [LLAMA_CHECK_FLAG, LLAMA_CHECK_OK, LLAMA_CHECK_FAILED]) {
    it(`scripts/smoke-packaged.mjs names ${value}`, () => {
      expect(driver).toContain(value);
    });
  }
});
