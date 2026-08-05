import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron';
export interface HostWindowOptions {
    /** Absolute path to the consumer's sandboxed preload bundle. */
    preloadPath: string;
    title: string;
    width: number;
    height: number;
    minWidth?: number;
    minHeight?: number;
    backgroundColor?: string;
    titleBarStyle?: BrowserWindowConstructorOptions['titleBarStyle'];
    titleBarOverlay?: BrowserWindowConstructorOptions['titleBarOverlay'];
    trafficLightPosition?: BrowserWindowConstructorOptions['trafficLightPosition'];
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
export declare function createHostWindow(options: HostWindowOptions): BrowserWindow;
