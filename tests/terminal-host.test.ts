import { homedir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { TerminalHost } from '../src/host/terminal-host.js';

/**
 * Owner-scoped reaping, against real shells.
 *
 * `Owners` in `tests/pty-session.test.ts` proves the registry rule with fake
 * managers. This proves the thing the rule exists for: terminating one
 * manager kills its shell process and leaves another manager's alone. A map
 * entry disappearing is not the claim; a process ending is.
 *
 * POSIX only. The shell reports its own pid through `$$`, and `cmd.exe` has
 * no equivalent, so Windows is unverified here and the end-to-end suite says
 * the same.
 */

const POSIX = process.platform !== 'win32';

/** Does a process still exist? Signal 0 checks without delivering anything. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function until(condition: () => boolean, budgetMs = 3_000): Promise<boolean> {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return condition();
}

/** One owner: a manager, its shell, and everything that shell has printed. */
function owner() {
  let output = '';
  const host = new TerminalHost({
    homeDirectory: homedir(),
    // `/bin/sh` rather than the login shell: no profile, no prompt theme, and
    // it exists on every POSIX runner.
    defaultShell: '/bin/sh',
    flushMs: 1,
    emit: (_id, chunk) => {
      output += chunk;
    },
    onExit: () => undefined,
  });

  host.spawn({ id: 'session', cols: 80, rows: 24 });
  host.write('session', 'echo PID:$$\n');

  return {
    host,
    /** The shell's own pid, once it has said it. */
    async pid(): Promise<number | undefined> {
      await until(() => /PID:(\d+)/.test(output), 20_000);
      const match = /PID:(\d+)/.exec(output);
      return match ? Number(match[1]) : undefined;
    },
  };
}

describe.skipIf(!POSIX)('TerminalHost, per owner', () => {
  it('reaps its own shells and leaves another owner\'s running', async () => {
    const closing = owner();
    const staying = owner();

    const closingPid = await closing.pid();
    const stayingPid = await staying.pid();

    // The floor. Without a real pid every assertion below inspects nothing,
    // and a test that finds no process would report the reaping as correct.
    expect(closingPid).toBeGreaterThan(0);
    expect(stayingPid).toBeGreaterThan(0);
    expect(closingPid).not.toBe(stayingPid);
    expect(alive(closingPid!)).toBe(true);
    expect(alive(stayingPid!)).toBe(true);

    // What a window closing does.
    closing.host.terminateAll();

    expect(await until(() => !alive(closingPid!))).toBe(true);
    expect(alive(stayingPid!)).toBe(true);

    staying.host.terminateAll();
    expect(await until(() => !alive(stayingPid!))).toBe(true);
  });

  it('keeps a session its view left, lists it, and attaches to it again', async () => {
    let output = '';
    const host = new TerminalHost({
      homeDirectory: homedir(),
      defaultShell: '/bin/sh',
      flushMs: 1,
      emit: (_id, chunk) => {
        output += chunk;
      },
      onExit: () => undefined,
    });

    host.spawn({ id: 'kept', cols: 80, rows: 24 });
    host.write('kept', 'echo PID:$$\n');
    await until(() => /PID:(\d+)/.test(output), 20_000);
    const pid = Number(/PID:(\d+)/.exec(output)?.[1]);

    // The floor. Without a real pid nothing below inspects a process at all.
    expect(pid).toBeGreaterThan(0);
    expect(alive(pid)).toBe(true);

    // The view goes away. Detach is the absence of a terminate, so nothing is
    // called here, and the session has to still be findable afterwards.
    expect(host.list()).toEqual([
      { id: 'kept', cwd: homedir(), shell: '/bin/sh', startedAt: expect.any(Number) },
    ]);
    expect(alive(pid)).toBe(true);

    output = '';
    host.spawn({ id: 'kept', cols: 100, rows: 30 });
    expect(await until(() => output.includes(`PID:${String(pid)}`))).toBe(true);

    // The same process, rather than a second one spawned under the same id.
    host.write('kept', 'echo AGAIN:$$\n');
    expect(await until(() => output.includes(`AGAIN:${String(pid)}`))).toBe(true);
    expect(host.list()).toHaveLength(1);

    // The owner still reaps it, which is what keeps a detach from being a leak.
    host.terminateAll();
    expect(await until(() => !alive(pid))).toBe(true);
    expect(host.list()).toEqual([]);
  });
});
