import { expect, test } from '@playwright/test';

import {
  closeApp,
  launchApp,
  providerAnswers,
  providerState,
  resetShell,
  type Harness,
} from './harness.js';

/**
 * The concierge loop, end to end.
 *
 * This is the scenario the whole `app` toolset exists for: a natural request,
 * the agent picking the right named tool, the gate classifying it, and the
 * running application changing as a result.
 *
 * The property worth protecting is that `set_theme` needs **no renderer
 * wiring**. The tool runs in the main process, `setPreferences` broadcasts
 * `prefs:changed`, and the shell already tracks that event, so the window
 * repaints on its own. A future refactor that routes this through a new IPC
 * channel has made the design worse, and this test should fail.
 *
 * It skips when no local backend is running, the same as the other agent
 * scenarios.
 */
let harness: Harness;

test.beforeAll(async () => {
  harness = await launchApp();
});

test.afterAll(async () => {
  await closeApp(harness);
});

test('the overlay agent flips the shell theme', async () => {
  await resetShell(harness);
  const { app, window } = harness;

  const theme = () =>
    window.evaluate(() => document.documentElement.getAttribute('data-theme'));

  await window.click('[data-testid="toggle-overlay"]');
  const overlay =
    app.windows().find((page) => page.url().includes('overlay')) ??
    (await app.waitForEvent('window', { timeout: 15_000 }));
  await overlay.waitForSelector('[data-testid="overlay-card"]', { timeout: 15_000 });

  const state = await providerState(overlay);
  test.skip(state !== 'ready', `No local model backend: ${state}`);
  test.skip(
    !(await providerAnswers(overlay)),
    'The backend reported ready and did not answer a one-word prompt',
  );

  await overlay.fill(
    '[data-testid="overlay-input"]',
    'Switch this application to the light theme.',
  );
  await overlay.keyboard.press('Enter');

  // set_theme is `mutating`, so the gate must ask first.
  const approval = overlay.locator('[data-testid="overlay-approval"]');
  await expect(approval).toBeVisible({ timeout: 120_000 });
  await expect(
    overlay.locator('[data-testid="overlay-approval-summary"]'),
  ).toContainText('light');

  await overlay.click('[data-testid="overlay-allow"]');

  // The shell repaints with no renderer change and no new IPC channel.
  await expect.poll(theme, { timeout: 30_000 }).toBe('light');

  await overlay.keyboard.press('Escape');
});
