import path from 'node:path';

import { BrowserWindow, shell } from 'electron';

/**
 * The main application window.
 *
 * The title bar is hidden on macOS (`hiddenInset`) and overlaid on Windows, so
 * the React shell can draw its own toolbar into that strip. The renderer gets
 * window controls through the `window:action` IPC channel.
 */

/**
 * Demo mode, for screenshots and screen recordings.
 *
 * `STUFFBUCKET_DEMO=1` loads the renderer with `?demo=1`, and the renderer
 * branches on `location.search`. It travels as a query string rather than as an
 * IPC channel on purpose: the contract in `src/shared/ipc.ts` is checked by an
 * exhaustiveness proof and a tripwire test, and a presentation flag does not
 * belong there. Unset, every path below is the production path.
 */
function isDemo(): boolean {
  return process.env['STUFFBUCKET_DEMO'] === '1';
}

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 880,
    minHeight: 560,
    show: false,
    backgroundColor: '#16181d',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    // Windows and Linux draw the system controls over our toolbar.
    ...(process.platform === 'darwin'
      ? {}
      : {
          titleBarOverlay: {
            color: '#16181d',
            symbolColor: '#e6e8ec',
            height: 40,
          },
        }),
    trafficLightPosition: { x: 14, y: 13 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // The security posture of this application. Do not relax any of these.
      // See AGENTS.md.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // A quiet test run parks this window off screen, where macOS reports it
      // occluded. Without this, Chromium throttles the renderer and every
      // reference screenshot comes back blank.
      backgroundThrottling: false,
    },
  });

  // Send anything that is not our own page to the real browser, where it
  // cannot reach Electron APIs.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    const current = window.webContents.getURL();
    if (new URL(url).origin !== new URL(current).origin) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const url = new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    if (isDemo()) url.searchParams.set('demo', '1');
    void window.loadURL(url.href);
    // Development only. The upstream Forge template opens DevTools in packaged
    // builds too, which ships a debugger to users.
    window.webContents.openDevTools({ mode: 'detach' });
  } else {
    void window.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
      isDemo() ? { query: { demo: '1' } } : {},
    );
  }

  return window;
}
