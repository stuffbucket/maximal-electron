import { BrowserWindow, shell, type BrowserWindowConstructorOptions } from 'electron';

export interface HostWindowOptions {
  /** Absolute path to the consumer's sandboxed preload bundle. */
  preloadPath: string;
  title: string;
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
  backgroundColor?: string;
  /**
   * Window and taskbar icon on Windows and Linux.
   *
   * macOS ignores it and uses the bundle icon, so a consumer targeting macOS
   * sets the icon at package time and, for an unpackaged run, calls
   * `app.dock.setIcon`.
   */
  icon?: BrowserWindowConstructorOptions['icon'];
  titleBarStyle?: BrowserWindowConstructorOptions['titleBarStyle'];
  titleBarOverlay?: BrowserWindowConstructorOptions['titleBarOverlay'];
  trafficLightPosition?: BrowserWindowConstructorOptions['trafficLightPosition'];
  /**
   * Show the window on `ready-to-show`. Default true. A consumer that reveals
   * the window itself — after moving it, or after a splash closes — sets this
   * false, and the ordering is then its own.
   */
  showWhenReady?: boolean;
  /** Load the renderer (dev-server URL or built index.html) into the window. */
  loadRenderer: (window: BrowserWindow) => void;
}

/**
 * A secured host window a consuming application drives.
 *
 * Carries this shell's security posture — `contextIsolation`, `sandbox`, no
 * `nodeIntegration`; every external link and cross-origin navigation is handed
 * to the real browser where it cannot reach Electron APIs. The consumer injects
 * its own preload and renderer through `options`, so the shell stays agnostic
 * about what it hosts. (Reusable seam consumed by e.g. maximal/client;
 * see maximal-electron#22.)
 */
export function createHostWindow(options: HostWindowOptions): BrowserWindow {
  const window = new BrowserWindow({
    width: options.width,
    height: options.height,
    minWidth: options.minWidth,
    minHeight: options.minHeight,
    title: options.title,
    show: false,
    backgroundColor: options.backgroundColor ?? '#16181d',
    icon: options.icon,
    titleBarStyle: options.titleBarStyle,
    titleBarOverlay: options.titleBarOverlay,
    trafficLightPosition: options.trafficLightPosition,
    webPreferences: {
      preload: options.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  // Anything that is not the consumer's own page goes to the real browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    const current = window.webContents.getURL();
    if (current && new URL(url).origin !== new URL(current).origin) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  if (options.showWhenReady ?? true) {
    window.once('ready-to-show', () => window.show());
  }
  options.loadRenderer(window);
  return window;
}
