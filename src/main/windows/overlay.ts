import path from 'node:path';

import { BrowserWindow, screen } from 'electron';

import { isE2EQuiet, quietBounds } from '../native/preferences.js';

/**
 * The floating command overlay, in the model `stuffbucket/wiggle` uses.
 *
 * Wiggle summons a full-screen transparent non-activating `NSPanel`, dims the
 * screen in CSS, and centres a card near the bottom of the focused monitor.
 * The native surface stays small; everything visual is CSS. This is the
 * Electron translation of that.
 *
 * Two things matter and are easy to get wrong:
 *
 * - **Do not steal focus from the application underneath.** On macOS a window
 *   with `type: 'panel'` is an `NSPanel`, which can take key input without
 *   activating this application. `showInactive` then `focus` gives a card the
 *   user can type into while the app behind keeps its own activation state.
 * - **Follow the cursor, not the primary display.** The overlay must appear on
 *   the monitor the user is looking at.
 *
 * Windows and Linux have no `NSPanel`. They get an always-on-top tool window,
 * which is close enough to be useful and is documented as a second phase in
 * `docs/roadmap.md`.
 *
 * ## Under test
 *
 * Everything that makes this window good at being an overlay makes it hostile
 * to the machine running the suite. It sits above full screen applications,
 * follows the user across spaces, covers the whole display, and takes key
 * input. A run then flashes over whatever the user is doing and pulls focus
 * out of their editor, once per scenario.
 *
 * None of that is needed to test it. Playwright dispatches input through the
 * debugger rather than the window server, and `capture` in `e2e/harness.ts`
 * reads the renderer rather than the screen. So under `STUFFBUCKET_E2E` the
 * window still shows, still reports visible, and still lays out exactly as it
 * does in production, but it stays out of the user's way.
 */

/** Quiet the overlay under test. See the note above. */
function applyStacking(window: BrowserWindow): void {
  if (isE2EQuiet()) {
    // Deliberately no always-on-top and no all-workspaces. Those are what put
    // a test run above the user's full-screen editor.
    return;
  }

  // Above full-screen applications and other always-on-top windows.
  window.setAlwaysOnTop(true, 'screen-saver');
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
}

let overlay: BrowserWindow | undefined;

function displayUnderCursor(): Electron.Display {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

function createOverlayWindow(): BrowserWindow {
  const { bounds } = displayUnderCursor();

  const window = new BrowserWindow({
    ...quietBounds(bounds),
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    // macOS: an NSPanel, so it can be key without activating the application.
    ...(process.platform === 'darwin' ? { type: 'panel' as const } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // A quiet run parks this window off screen, where macOS reports it
      // occluded. Without this, Chromium throttles the renderer and every
      // screenshot comes back blank.
      backgroundThrottling: false,
    },
  });

  // Above full-screen applications and other always-on-top windows.
  applyStacking(window);

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void window.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}/overlay.html`);
  } else {
    void window.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/overlay.html`),
    );
  }

  // Hiding rather than closing keeps the renderer warm, so the next summon is
  // instant. The overlay is summoned often and briefly.
  //
  // Deliberately no hide-on-blur. The window covers the whole display, so a
  // click outside the card already lands on the scrim, which dismisses. Adding
  // a blur handler on top of that means any notification or background window
  // stealing focus makes the card vanish mid-sentence.
  window.on('closed', () => {
    overlay = undefined;
  });

  return window;
}

export function showOverlay(): void {
  overlay ??= createOverlayWindow();

  // The cursor may be on a different monitor than last time.
  overlay.setBounds(quietBounds(displayUnderCursor().bounds));
  if (!isE2EQuiet()) {
    overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  // `showInactive` puts it on screen without activating this application.
  // `focus` then gives the panel key input. On macOS the panel type is what
  // makes that combination not raise the whole app.
  overlay.showInactive();

  // Under test, taking key input would pull focus out of whatever the user is
  // working in, once per scenario. Playwright dispatches keys through the
  // debugger, so the card receives them either way.
  if (!isE2EQuiet()) overlay.focus();
}

export function hideOverlay(): void {
  if (overlay && !overlay.isDestroyed() && overlay.isVisible()) overlay.hide();
}

export function toggleOverlay(): void {
  if (overlay && !overlay.isDestroyed() && overlay.isVisible()) hideOverlay();
  else showOverlay();
}

export function destroyOverlay(): void {
  if (overlay && !overlay.isDestroyed()) overlay.destroy();
  overlay = undefined;
}

export function overlayWindow(): BrowserWindow | undefined {
  return overlay;
}

export function isOverlayVisible(): boolean {
  return Boolean(overlay && !overlay.isDestroyed() && overlay.isVisible());
}
