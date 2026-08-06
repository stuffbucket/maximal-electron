import { expect, test, type ElectronApplication, type Page } from '@playwright/test';

import {
  closeApp,
  launchApp,
  resetShell,
  terminalScreen,
  type Harness,
} from './harness.js';

/**
 * Closing a terminal tab, with detach off and on.
 *
 * The claim is about a process, not about a component: with `terminalDetach`
 * off the shell dies when its view unmounts, and with it on the same shell is
 * still running afterwards, still listed, and still answers when a view
 * attaches to it again. Asserting the same pid answers is what separates a
 * reattach from a second shell opened under the same id.
 *
 * Its own application, because the preference persists and the shared suite
 * runs in a random order.
 *
 * POSIX only: the pid comes from the shell itself through `$$`, and `cmd.exe`
 * has no equivalent. Windows is unverified.
 */

let harness: Harness;

test.beforeAll(async () => {
  harness = await launchApp();
});

test.afterAll(async () => {
  await closeApp(harness);
});

function setDetach(page: Page, terminalDetach: boolean): Promise<unknown> {
  return page.evaluate((value) => {
    const api = (
      globalThis as unknown as {
        stuffbucket?: {
          invoke: (channel: string, payload: unknown) => Promise<unknown>;
        };
      }
    ).stuffbucket;
    return api?.invoke('prefs:set', { terminalDetach: value });
  }, terminalDetach);
}

/** Signal 0 asks whether a process exists without delivering anything. */
function isAlive(app: ElectronApplication, pid: number): Promise<boolean> {
  return app.evaluate((_electron, value) => {
    try {
      process.kill(value, 0);
      return true;
    } catch {
      return false;
    }
  }, pid);
}

/** Open a terminal tab and wait for the shell to report its own pid. */
async function openTerminal(page: Page, marker: string): Promise<number> {
  await page.click('[data-testid="tab-new"]');
  const terminal = page.locator('[data-testid="terminal"]').last();
  await expect(terminal.locator('canvas').first()).toBeVisible({ timeout: 20_000 });
  await terminal.click();

  await page.keyboard.type(`echo ${marker}:$$`);
  await page.keyboard.press('Enter');

  const pattern = new RegExp(`${marker}:(\\d+)`);
  await expect
    .poll(() => terminalScreen(terminal), {
      timeout: 20_000,
      message: 'the shell never reported its pid',
    })
    .toMatch(pattern);

  return Number(pattern.exec(await terminalScreen(terminal))?.[1]);
}

/** Close a tab by its title, through the control a user clicks. */
function closeTab(page: Page, title: string): Promise<void> {
  return page.locator('.tab').filter({ hasText: title }).locator('.tab__close').click();
}

test('a tab close ends its shell, unless the shell is detached', async () => {
  test.skip(
    process.platform === 'win32',
    'No portable way to read a shell process id from cmd.exe.',
  );

  const { app, window } = harness;
  await resetShell(harness);
  await setDetach(window, false);

  /* --------------------------------------------------- the default: terminate */

  const reaped = await openTerminal(window, 'REAPED_PID');

  // The floor. Without a real pid every check below asks about nothing, and a
  // test that found no process would report both behaviours as correct.
  expect(reaped).toBeGreaterThan(0);
  expect(await isAlive(app, reaped)).toBe(true);

  await closeTab(window, 'Terminal 1');
  await expect
    .poll(() => isAlive(app, reaped), {
      timeout: 15_000,
      message: 'the shell outlived the tab that opened it',
    })
    .toBe(false);

  /* ------------------------------------------------------ opted in: detach */

  await setDetach(window, true);
  const kept = await openTerminal(window, 'KEPT_PID');

  expect(kept).toBeGreaterThan(0);
  expect(kept).not.toBe(reaped);
  expect(await isAlive(app, kept)).toBe(true);

  await closeTab(window, 'Terminal 1');

  // The reaped shell above was gone 42 milliseconds after its tab closed, so
  // five seconds of staying alive is a result rather than a race won.
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    expect(await isAlive(app, kept)).toBe(true);
    await window.waitForTimeout(1_000);
  }

  /* ------------------------------------------- enumerated, and attached to */

  // A session nothing can find again is a leak rather than a feature, so the
  // shell lists what is running with no tab.
  const reattach = window.locator('[data-testid="reattach-term-1"]');
  await expect(reattach).toBeVisible({ timeout: 10_000 });
  await reattach.click();

  const terminal = window.locator('[data-testid="terminal"]').last();
  await expect(terminal.locator('canvas').first()).toBeVisible({ timeout: 20_000 });

  // What the host retained crosses the unmount. The emulator's scrollback does
  // not: this is the replayed tail, not the buffer the closed view held.
  await expect
    .poll(() => terminalScreen(terminal), {
      timeout: 20_000,
      message: 'the attached view was never sent what the session had printed',
    })
    .toContain(`KEPT_PID:${String(kept)}`);

  // The same process, not a second one spawned under the same id.
  await terminal.click();
  await window.keyboard.type('echo AGAIN:$$');
  await window.keyboard.press('Enter');
  await expect
    .poll(() => terminalScreen(terminal), {
      timeout: 20_000,
      message: 'the attached view is talking to a different shell',
    })
    .toContain(`AGAIN:${String(kept)}`);

  /* ------------------------------------------------------- and back to off */

  await setDetach(window, false);
  await closeTab(window, 'Terminal 1');
  await expect
    .poll(() => isAlive(app, kept), {
      timeout: 15_000,
      message: 'turning detach off did not restore reaping',
    })
    .toBe(false);
});
