import { FitAddon, Terminal as GhosttyTerminal, init } from 'ghostty-web';
import { useEffect, useRef } from 'react';

import { bridge } from '../lib/bridge.js';
import { currentTerminalTheme } from '../lib/theme.js';

/**
 * A real terminal in the tab. `ghostty-web` parses and renders; the shell lives
 * in the main process. See `docs/architecture.md` for the data flow.
 *
 * **The theme is fixed for a session.** The emulator draws to a canvas, so it
 * inherits nothing from CSS and is handed literal colours at construction.
 * `options.theme` after `open()` is a no-op that logs a warning, and the
 * supported route, `reset()`, wipes the screen and the scrollback. Losing a
 * build log to a theme toggle is the worse trade, so a terminal keeps the
 * scheme it opened in and a new tab picks up the current one.
 */

/** `init()` is shared, so several tabs opening at once await one load. */
let wasmReady: Promise<void> | undefined;
function ensureWasm(): Promise<void> {
  wasmReady ??= init();
  return wasmReady;
}

/** The host element carries the terminal instance, for end-to-end tests. */
export type TerminalHost = HTMLDivElement & { __terminal?: GhosttyTerminal };

export function TerminalView({ id, shell }: { id: string; shell?: string }) {
  const host = useRef<HTMLDivElement>(null);

  // `id` identifies the shell session for this tab's lifetime. Re-running this
  // effect would orphan a shell, so it depends on `id` alone. `shell` is read
  // at spawn time and never changes for a live session.
  useEffect(() => {
    const element = host.current;
    if (!element) return;

    let disposed = false;
    let term: GhosttyTerminal | undefined;
    let unsubscribeData: (() => void) | undefined;
    let unsubscribeExit: (() => void) | undefined;

    void ensureWasm().then(() => {
      // The tab can close while the WebAssembly module loads.
      if (disposed || !host.current) return;

      term = new GhosttyTerminal({
        fontSize: 13,
        fontFamily:
          'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
        theme: currentTerminalTheme(),
      });

      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host.current);
      fit.fit();

      // Test support. The emulator draws to a canvas, so there is no text in
      // the DOM to assert on. Exposing the instance lets an end-to-end test
      // read the real terminal buffer instead of guessing from pixels.
      (host.current as TerminalHost).__terminal = term;

      // Keystrokes to the shell.
      term.onData((data) => {
        void bridge.invoke('pty:write', { id, data });
      });

      // A resize can come from the addon or from a panel drag.
      term.onResize(({ cols, rows }) => {
        void bridge.invoke('pty:resize', { id, cols, rows });
      });

      // Shell output back to the view. Filter by id: every tab receives every
      // `pty:data` event, because the channel is per window, not per session.
      unsubscribeData = bridge.on('pty:data', (payload) => {
        if (payload.id === id) term?.write(payload.data);
      });

      unsubscribeExit = bridge.on('pty:exit', (payload) => {
        if (payload.id !== id) return;
        term?.write(`\r\n\x1b[2m[process exited with ${payload.exitCode}]\x1b[0m\r\n`);
      });

      void bridge.invoke('pty:spawn', { id, cols: term.cols, rows: term.rows, shell });

      // The panel group resizes the host without a window resize, so a
      // ResizeObserver is the only reliable trigger.
      const observer = new ResizeObserver(() => fit.fit());
      observer.observe(element);

      cleanupObserver = () => observer.disconnect();
    });

    let cleanupObserver: (() => void) | undefined;

    return () => {
      disposed = true;
      cleanupObserver?.();
      unsubscribeData?.();
      unsubscribeExit?.();
      void bridge.invoke('pty:kill', { id });
      term?.dispose();
    };
  }, [id, shell]);

  return <div className="terminal" data-testid="terminal" ref={host} />;
}
