import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { BrowserWindow, app, globalShortcut } from 'electron';

import { registerIpcHandlers, sendEvent } from './ipc.js';
import { focusWindow, installApplicationMenu } from './native/menu.js';
import { clearBadge } from './native/notifications.js';
import { disposeEmbeddedModel } from './native/llama.js';
import {
  getPreferences,
  isE2E,
  isE2EQuiet,
  onPreferencesChanged,
  quietBounds,
} from './native/preferences.js';
import { configurePty, killAllPtys } from './native/pty.js';import { destroyTray, setTrayEnabled } from './native/tray.js';
import { checkForUpdates } from './native/updates.js';
import { createMainWindow } from './windows/main-window.js';
import { destroyOverlay, toggleOverlay } from './windows/overlay.js';
import { closeSplashWindow, createSplashWindow } from './windows/splash.js';

// Under test, use a throwaway profile. This must happen before `whenReady`,
// and it keeps a test run from clobbering a developer's real preferences.
if (isE2E()) {
  app.setPath('userData', mkdtempSync(path.join(tmpdir(), 'stuffbucket-e2e-')));
}

let mainWindow: BrowserWindow | undefined;

/* ------------------------------------------------------------ dock state */

/**
 * Show or hide the dock icon (macOS only).
 *
 * The rule the product wants:
 *
 * - A window is open, so the application is a normal foreground app. Dock icon
 *   visible.
 * - The menu bar icon is enabled and the last window closed. The application
 *   keeps running as a menu bar accessory. Pull the dock icon out, so it stops
 *   occupying a dock slot for a window that is not there.
 *
 * `app.dock.hide()` also removes the application from the Command-Tab switcher,
 * which is the correct behaviour for an accessory. Reopening a window calls
 * `show()` again.
 *
 * Windows and Linux have no equivalent, and `app.dock` is undefined there, so
 * every call is guarded.
 */
function setDockVisible(visible: boolean): void {
  if (process.platform !== 'darwin' || !app.dock) return;
  if (visible) void app.dock.show();
  else app.dock.hide();
}

function hasOpenWindow(): boolean {
  return BrowserWindow.getAllWindows().some((window) => !window.isDestroyed());
}

/** Bring the application forward, opening a window if none is left. */
function activate(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    setDockVisible(true);
    focusWindow(mainWindow);
    return;
  }

  setDockVisible(true);
  mainWindow = createMainWindow();
  wireWindow(mainWindow);

  // `app.dock.show()` resolves asynchronously. Focus after the window paints,
  // or the application can come forward without taking key status.
  //
  // Under test that focus lands in the middle of whatever the user is doing,
  // so a quiet run shows the window without ever taking the keyboard.
  mainWindow.once('ready-to-show', () => {
    if (isE2EQuiet()) return;
    focusWindow(mainWindow);
  });
}

/* ---------------------------------------------------------------- windows */

function wireWindow(window: BrowserWindow): void {
  // The renderer draws its own title bar, so it needs the maximized state to
  // pick the right control glyph.
  const report = () =>
    sendEvent(window, 'window:maximized-changed', {
      maximized: window.isMaximized(),
    });
  window.on('maximize', report);
  window.on('unmaximize', report);

  window.once('ready-to-show', () => {
    closeSplashWindow();
    // A quiet test run parks the window off screen rather than hiding it, so
    // layout, visibility, and the renderer behave exactly as in production.
    if (isE2EQuiet()) window.setBounds(quietBounds(window.getBounds()));
    window.show();
  });

  window.on('closed', () => {
    if (mainWindow === window) mainWindow = undefined;
  });
}

/* --------------------------------------------------------------- overlay */

let boundHotkey: string | undefined;

/**
 * Bind the summon accelerator.
 *
 * `globalShortcut.register` returns false when another application already
 * owns the combination. Report that rather than leaving the user with a key
 * that silently does nothing.
 */
function bindOverlayHotkey(accelerator: string): void {
  if (boundHotkey === accelerator) return;

  if (boundHotkey) globalShortcut.unregister(boundHotkey);
  boundHotkey = undefined;

  if (!accelerator) return;

  try {
    if (globalShortcut.register(accelerator, toggleOverlay)) {
      boundHotkey = accelerator;
    } else {
      console.error(
        `Overlay hotkey "${accelerator}" is already taken by another application.`,
      );
    }
  } catch (error) {
    // An malformed accelerator throws rather than returning false.
    console.error(`Overlay hotkey "${accelerator}" is not valid:`, error);
  }
}

/* --------------------------------------------------------------- updates */

async function runUpdateCheck(): Promise<void> {
  sendEvent(mainWindow, 'update:status', { state: 'checking' });
  sendEvent(mainWindow, 'update:status', await checkForUpdates());
}

/* ------------------------------------------------------------- bootstrap */

function bootstrap(): void {
  const prefs = getPreferences();

  registerIpcHandlers();

  // Terminal output is pushed, not polled, so the pty layer needs a way to
  // reach the window. It has no Electron import of its own.
  configurePty({
    emit: (id, data) => sendEvent(mainWindow, 'pty:data', { id, data }),
    onExit: (id, exitCode) => sendEvent(mainWindow, 'pty:exit', { id, exitCode }),
  });

  installApplicationMenu({
    onNavigate: (view) => {
      activate();
      sendEvent(mainWindow, 'menu:navigate', { view });
    },
    onTogglePanel: (panel) => {
      activate();
      sendEvent(mainWindow, 'menu:toggle-panel', { panel });
    },
    onCheckForUpdates: () => void runUpdateCheck(),
    onOpenPreferences: () => activate(),
  });

  // The tray is a plain click target: it activates the application.
  setTrayEnabled(prefs.menuBarIcon, activate);

  bindOverlayHotkey(prefs.overlayHotkey);

  // Preferences are the single source of truth, so react to a change from any
  // origin rather than only from the settings panel.
  onPreferencesChanged((next) => {
    setTrayEnabled(next.menuBarIcon, activate);
    bindOverlayHotkey(next.overlayHotkey);
    // Turning the menu bar icon off while no window is open would otherwise
    // strand the application with no way to reach it.
    if (!next.menuBarIcon && !hasOpenWindow()) activate();
    sendEvent(mainWindow, 'prefs:changed', next);
  });

  mainWindow = createMainWindow();
  wireWindow(mainWindow);
}

/* ------------------------------------------------------------- lifecycle */

// A second instance should activate the first, not open another window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', activate);

  void app.whenReady().then(() => {
    if (getPreferences().splash) createSplashWindow();
    bootstrap();

    // macOS: a dock or menu bar click with no window open.
    app.on('activate', activate);
  });

  app.on('window-all-closed', () => {
    // With the menu bar icon on, closing the last window is not a quit. The
    // application keeps running, and the dock icon comes out of the dock.
    if (getPreferences().menuBarIcon) {
      setDockVisible(false);
      return;
    }

    // Without it, the usual platform behaviour: quit everywhere except macOS,
    // where an application normally survives its last window.
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    // Kill every shell first. A surviving child would outlive the application.
    killAllPtys();
    globalShortcut.unregisterAll();
    destroyOverlay();
    clearBadge();
    destroyTray();
    closeSplashWindow();
    // The embedded weights hold a few hundred megabytes. Nothing depends on
    // this completing, so it is not awaited.
    void disposeEmbeddedModel();
  });
}
