import { expect, test, type Locator } from '@playwright/test';

import { capture, closeApp, launchApp, resetShell, setTheme, type Harness } from './harness.js';
import { createRegistry } from './shuffle.js';

/**
 * Shell behaviour, verified against the built bundles.
 *
 * The assertion style follows `stuffbucket/maximal`'s `ui-layout-verification`
 * skill. Its lesson: unit tests on a DOM with no layout engine cannot answer
 * "is there really a gap between these blocks?", so two real regressions
 * shipped past a green suite. These read **computed** layout from a real
 * engine, which is the only thing that catches that class.
 *
 * Tests run in a **random order**. Each one must therefore set up whatever it
 * needs, and `resetShell` returns the application to a known state first. The
 * seed is printed on every run; `E2E_SEED` replays one.
 */

let harness: Harness;

const { scenario, registerShuffled } = createRegistry();

test.beforeAll(async () => {
  harness = await launchApp();
});

test.beforeEach(async () => {
  await resetShell(harness);
});

test.afterAll(async () => {
  await closeApp(harness);
});

/* ------------------------------------------------------------------ shell */

scenario('shell renders all three panels', async () => {
  const { window } = harness;

  await expect(window.locator('[data-testid="titlebar"]')).toBeVisible();
  await expect(window.locator('[data-testid="left-nav"]')).toBeVisible();
  await expect(window.locator('[data-testid="canvas"]')).toBeVisible();
  await expect(window.locator('[data-testid="inspector"]')).toBeVisible();
});

scenario('IPC round trip populates the runtime section', async () => {
  const { window } = harness;

  // `app:versions` is a main-process call. Real values here prove the whole
  // contract: preload bridge, channel allow-list, and handler.
  await expect(window.locator('.field', { hasText: 'Electron' })).toContainText(
    /\d+\.\d+\.\d+/,
  );
});

scenario('left navigation switches view and updates the canvas', async () => {
  const { window } = harness;

  await window.click('[data-testid="nav-recents"]');
  await expect(window.locator('.toolbar__title')).toHaveText('Recents');

  // Recents has 6 sample rows; library has 12. A count change proves the view
  // re-rendered rather than only re-labelling.
  await expect(window.locator('.card')).toHaveCount(6);

  await window.click('[data-testid="nav-library"]');
  await expect(window.locator('.card')).toHaveCount(12);
});

scenario('grid and list modes swap the content layout', async () => {
  const { window } = harness;

  await window.click('[data-testid="mode-list"]');
  await expect(window.locator('[data-testid="view-list"]')).toBeVisible();

  // A computed-style check, not a class-name check: a dropped CSS selector
  // still leaves the class in place.
  const listDisplay = await window
    .locator('[data-testid="view-list"]')
    .evaluate((node) => getComputedStyle(node).display);
  expect(listDisplay).toBe('flex');

  await window.click('[data-testid="mode-grid"]');
  const gridStyles = await window
    .locator('[data-testid="view-grid"]')
    .evaluate((node) => {
      const style = getComputedStyle(node);
      return { display: style.display, gap: style.rowGap };
    });

  expect(gridStyles.display).toBe('grid');
  // The historical failure mode: the gap resolves to `normal` or `0px`,
  // because the token never reached the element. The number tracks
  // `--space-3`, which the grid moved to when the type ramp grew and the
  // cards needed the room back.
  expect(gridStyles.gap).toBe('12px');
});

scenario('both side panels collapse and expand', async () => {
  const { window } = harness;

  const navWidth = () =>
    window
      .locator('[data-testid="left-nav"]')
      .evaluate((node) => node.getBoundingClientRect().width);

  const inspectorWidth = () =>
    window
      .locator('[data-testid="inspector"]')
      .evaluate((node) => node.getBoundingClientRect().width);

  const navExpanded = await navWidth();
  await window.click('[data-testid="toggle-left"]');
  await expect.poll(navWidth).toBeLessThan(navExpanded);

  await window.click('[data-testid="toggle-left"]');
  await expect.poll(navWidth).toBeGreaterThan(0);

  const inspectorExpanded = await inspectorWidth();
  await window.click('[data-testid="toggle-right"]');
  await expect.poll(inspectorWidth).toBeLessThan(inspectorExpanded);

  await window.click('[data-testid="toggle-right"]');
  await expect.poll(inspectorWidth).toBeGreaterThan(0);
});

scenario('tabs open and close', async () => {
  const { window } = harness;

  const tabs = window.locator('.tab');
  const before = await tabs.count();

  await window.click('[data-testid="tab-new"]');
  await expect(tabs).toHaveCount(before + 1);

  await window.locator('.tab__close').last().click();
  await expect(tabs).toHaveCount(before);
});

scenario('selecting an item fills the inspector', async () => {
  const { window } = harness;

  await window.locator('.card').first().click();
  await expect(window.locator('[data-testid="inspector"]')).toContainText(
    'Properties',
  );
});

scenario('card name and subtitle sit on separate lines', async () => {
  const { window } = harness;

  // Regression guard. Both were inline spans once, so they rendered as
  // "Design systemEdited 1 day ago" on one line. Only real layout catches it:
  // the DOM and the class names were correct throughout.
  const card = window.locator('.card').first();
  const nameBox = await card.locator('.card__name').boundingBox();
  const subBox = await card.locator('.card__sub').boundingBox();

  expect(nameBox).not.toBeNull();
  expect(subBox).not.toBeNull();
  expect(subBox!.y).toBeGreaterThanOrEqual(nameBox!.y + nameBox!.height);
});

/* --------------------------------------------------------------- terminal */

scenario('a new tab opens a real Ghostty terminal', async () => {
  const { window } = harness;

  await window.click('[data-testid="tab-new"]');

  const terminal = window.locator('[data-testid="terminal"]').last();
  await expect(terminal).toBeVisible({ timeout: 20_000 });

  // ghostty-web renders to a canvas. Its presence proves `init()` resolved and
  // the WebAssembly parser is live, not that a div exists.
  const canvas = terminal.locator('canvas').first();
  await expect(canvas).toBeVisible({ timeout: 20_000 });

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.height).toBeGreaterThan(0);
});

scenario('a terminal takes its colours from the design tokens', async () => {
  const { window } = harness;

  // The emulator draws to a canvas, so it inherits nothing from CSS. It used
  // to carry the dark palette as three literal hex values, which left the
  // terminal dark in the light theme and made `docs/architecture.md`'s "no
  // component contains a hex value" false.
  //
  // This samples the canvas rather than the theme object the emulator was
  // handed. Only a pixel proves the colour reached the screen.
  //
  // A terminal keeps the scheme it opened in: the colours are baked into the
  // WebAssembly terminal at construction, and the only supported way to
  // rebuild it wipes the scrollback. So this opens a second terminal after
  // switching, rather than expecting the first to follow.
  const openTerminal = async () => {
    await window.click('[data-testid="tab-new"]');
    const terminal = window.locator('[data-testid="terminal"]').last();
    const canvas = terminal.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 20_000 });
    return canvas;
  };

  // Mid-width and near the bottom. The prompt sits at the top left and the
  // scrollbar hugs the right edge, so this stays background.
  const background = (canvas: Locator) =>
    canvas.evaluate((node) => {
      const element = node as HTMLCanvasElement;
      const context = element.getContext('2d', { willReadFrequently: true });
      if (!context) return null;
      const x = Math.floor(element.width / 2);
      const y = element.height - 6;
      return Array.from(context.getImageData(x, y, 1, 1).data.slice(0, 3));
    });

  const dark = await openTerminal();
  // `--bg-canvas`, dark: #101216.
  await expect.poll(() => background(dark), { timeout: 20_000 }).toEqual([
    16, 18, 22,
  ]);

  try {
    await setTheme(window, 'light');
    const light = await openTerminal();
    // `--bg-canvas`, light: #eef0f4.
    await expect.poll(() => background(light), { timeout: 20_000 }).toEqual([
      238, 240, 244,
    ]);
  } finally {
    // A persisted preference, and the order of these scenarios is random.
    await setTheme(window, 'dark');
  }
});

scenario('the terminal runs a command and shows its output', async () => {
  const { window } = harness;

  await window.click('[data-testid="tab-new"]');
  const terminal = window.locator('[data-testid="terminal"]').last();
  await expect(terminal.locator('canvas').first()).toBeVisible({
    timeout: 20_000,
  });
  await terminal.click();

  // A marker unlikely to appear in a shell banner, so a match is real output.
  await window.keyboard.type('echo GHOSTTY_OK_7391');
  await window.keyboard.press('Enter');

  // Read the emulator's own buffer. The renderer draws to a canvas, so there
  // is no DOM text to assert on, and a pixel comparison would prove nothing
  // about what the terminal actually parsed.
  await expect
    .poll(
      async () =>
        terminal.evaluate((node) => {
          const term = (node as HTMLElement & { __terminal?: unknown })
            .__terminal as
            | {
                buffer: {
                  active: {
                    length: number;
                    getLine: (
                      y: number,
                    ) => { translateToString: (trim?: boolean) => string } | undefined;
                  };
                };
              }
            | undefined;
          if (!term) return '';

          const active = term.buffer.active;
          const lines: string[] = [];
          for (let y = 0; y < active.length; y += 1) {
            lines.push(active.getLine(y)?.translateToString(true) ?? '');
          }
          return lines.join('\n');
        }),
      { timeout: 20_000, message: 'terminal never echoed the command output' },
    )
    .toContain('GHOSTTY_OK_7391');
});

/* ---------------------------------------------------------------- overlay */

scenario('the floating overlay summons and dismisses', async () => {
  const { app, window } = harness;

  await window.click('[data-testid="toggle-overlay"]');

  const overlay =
    app.windows().find((page) => page.url().includes('overlay')) ??
    (await app.waitForEvent('window', { timeout: 15_000 }));
  await overlay.waitForSelector('[data-testid="overlay-card"]', {
    timeout: 15_000,
  });

  // The status line reports the backend, or says plainly that none is running.
  await expect(overlay.locator('[data-testid="overlay-status"]')).not.toBeEmpty();

  // Ask the BrowserWindow, not the document. `document.visibilityState` stays
  // "visible" for a hidden Electron window, so it proves nothing here.
  //
  // Both directions poll. `showInactive` and `hide` are asynchronous on macOS,
  // so a bare assertion races the window server and fails intermittently.
  const handle = await app.browserWindow(overlay);

  await expect
    .poll(() => handle.evaluate((win) => win.isVisible()), { timeout: 10_000 })
    .toBe(true);

  await capture(overlay, 'test-results/overlay.png');

  await overlay.keyboard.press('Escape');

  await expect
    .poll(() => handle.evaluate((win) => win.isVisible()), { timeout: 10_000 })
    .toBe(false);
});

scenario('the overlay answers when a local backend is running', async () => {
  const { app, window } = harness;

  await window.click('[data-testid="toggle-overlay"]');
  const overlay =
    app.windows().find((page) => page.url().includes('overlay')) ??
    (await app.waitForEvent('window', { timeout: 15_000 }));

  await overlay.waitForSelector('[data-testid="overlay-card"]', {
    timeout: 15_000,
  });

  // Skip rather than fail when nothing is listening. A contributor without
  // maximal or Ollama should still get a green suite, and CI has neither.
  const status = await overlay
    .locator('[data-testid="overlay-status"]')
    .textContent();
  test.skip(
    !status || status.includes('Waiting') || status.includes('No local model'),
    `No local model backend: ${status ?? 'unknown'}`,
  );

  await overlay.fill('[data-testid="overlay-input"]', 'Reply with exactly: OVERLAY_OK');
  await overlay.keyboard.press('Enter');

  // The answer streams in as `agent:delta` events, so this asserts the whole
  // path: pi agent loop, provider, IPC events, and incremental render.
  await expect(overlay.locator('[data-testid="overlay-answer"]')).toContainText(
    'OVERLAY_OK',
    { timeout: 90_000 },
  );

  await overlay.keyboard.press('Escape');
});

/**
 * Summon the overlay and wait for its card.
 *
 * Three agent scenarios need this, and the window lookup has to tolerate the
 * overlay already existing from an earlier test in the shuffled order.
 */
async function openOverlay() {
  const { app, window } = harness;

  await window.click('[data-testid="toggle-overlay"]');
  const overlay =
    app.windows().find((page) => page.url().includes('overlay')) ??
    (await app.waitForEvent('window', { timeout: 15_000 }));
  await overlay.waitForSelector('[data-testid="overlay-card"]', {
    timeout: 15_000,
  });

  return overlay;
}

/** Skip rather than fail when no local model is running. */
async function requireBackend(overlay: Awaited<ReturnType<typeof openOverlay>>) {
  const status = await overlay
    .locator('[data-testid="overlay-status"]')
    .textContent();
  test.skip(
    !status || status.includes('Waiting') || status.includes('No local model'),
    `No local model backend: ${status ?? 'unknown'}`,
  );
}

scenario('the overlay agent asks before it runs bash, and runs it when allowed', async () => {
  const overlay = await openOverlay();
  await requireBackend(overlay);

  // A tool call is what separates the pi agent loop from a plain chat call.
  // The marker can only appear if a real shell ran.
  await overlay.fill(
    '[data-testid="overlay-input"]',
    'Use your bash tool to run: echo AGENT_TOOL_5521 — then report the output.',
  );
  await overlay.keyboard.press('Enter');

  // The gate must fire first. `agentApproval` defaults to `writes`, and bash
  // is not a read, so nothing should reach the shell without this prompt.
  const approval = overlay.locator('[data-testid="overlay-approval"]');
  await expect(approval).toBeVisible({ timeout: 120_000 });
  await expect(
    overlay.locator('[data-testid="overlay-approval-summary"]'),
  ).toContainText('AGENT_TOOL_5521');

  // The prompt has to be on screen, not merely in the DOM. A hidden window
  // still answers every locator, so this is the only assertion that proves
  // the user could actually have seen the question.
  const handle = await harness.app.browserWindow(overlay);
  await expect
    .poll(() => handle.evaluate((win) => win.isVisible()), { timeout: 10_000 })
    .toBe(true);

  await capture(overlay, 'test-results/overlay-approval.png');

  await overlay.click('[data-testid="overlay-allow"]');

  await expect(overlay.locator('[data-testid="overlay-answer"]')).toContainText(
    'AGENT_TOOL_5521',
    { timeout: 120_000 },
  );

  await capture(overlay, 'test-results/overlay-agent.png');
  await overlay.keyboard.press('Escape');
});

scenario('Escape answers a pending approval rather than dismissing the overlay', async () => {
  const overlay = await openOverlay();
  await requireBackend(overlay);

  await overlay.fill(
    '[data-testid="overlay-input"]',
    'Use your bash tool to run: echo AGENT_DENY_7788',
  );
  await overlay.keyboard.press('Enter');

  const approval = overlay.locator('[data-testid="overlay-approval"]');
  await expect(approval).toBeVisible({ timeout: 120_000 });

  await overlay.keyboard.press('Escape');

  // The prompt goes, and the card stays. A pending question owns Escape, so
  // denying a tool call must not also tear down the run behind it.
  await expect(approval).toBeHidden();
  await expect(overlay.locator('[data-testid="overlay-card"]')).toBeVisible();

  await overlay.keyboard.press('Escape');
});

/* ------------------------------------------------------------ screenshots */

scenario('capture a reference screenshot of the shell', async () => {
  const { window } = harness;
  // `resetShell` already put the shell in the library grid view.
  await capture(window, 'test-results/shell.png');
});

scenario('capture a reference screenshot of the terminal', async () => {
  const { window } = harness;

  await window.click('[data-testid="tab-new"]');
  const terminal = window.locator('[data-testid="terminal"]').last();
  await expect(terminal.locator('canvas').first()).toBeVisible({
    timeout: 20_000,
  });

  await capture(window, 'test-results/terminal.png');
});

/* ------------------------------------------------------------- registration */

registerShuffled((name, run) => {
  test(name, run);
});
