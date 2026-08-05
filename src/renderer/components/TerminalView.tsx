import { FitAddon, Terminal as GhosttyTerminal, init } from 'ghostty-web';
import type { ITheme } from 'ghostty-web';
import { useEffect, useRef } from 'react';

import type {
  TerminalDescriptor,
  TerminalTransport,
} from '../lib/terminal-transport.js';

/**
 * A real terminal, driven by an injected transport.
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

export interface TerminalViewProps extends TerminalDescriptor {
  transport: TerminalTransport;
  /** Literal colours. Resolve with `readTerminalTheme`. */
  theme?: ITheme;
  testId?: string;
}

export function TerminalView({
  id,
  cwd,
  shell,
  ariaLabel = 'Terminal',
  transport,
  theme,
  testId = 'terminal',
}: TerminalViewProps) {
  const host = useRef<HTMLDivElement>(null);

  // `id` identifies the session for this view's lifetime. Re-running this
  // effect would orphan a shell, so the descriptor fields read at spawn time
  // are deliberately not dependencies.
  useEffect(() => {
    const element = host.current;
    if (!element) return;

    let disposed = false;
    let term: GhosttyTerminal | undefined;
    let unsubscribe: (() => void) | undefined;
    let cleanupObserver: (() => void) | undefined;

    void ensureWasm().then(() => {
      // The view can unmount while the WebAssembly module loads.
      if (disposed || !host.current) return;

      term = new GhosttyTerminal({
        fontSize: 13,
        fontFamily:
          'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
        ...(theme ? { theme } : {}),
      });

      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host.current);
      fit.fit();

      // The emulator draws to a canvas, so there is no text in the DOM to
      // assert on. Exposing the instance lets a test read the real buffer.
      (host.current as TerminalHost).__terminal = term;

      term.onData((data) => {
        void transport.write(id, data);
      });

      term.onResize(({ cols, rows }) => {
        void transport.resize(id, cols, rows);
      });

      unsubscribe = transport.subscribe(id, (event) => {
        if (event.type === 'data') term?.write(event.data);
        else {
          term?.write(
            `\r\n\x1b[2m[process exited with ${String(event.exitCode)}]\x1b[0m\r\n`,
          );
        }
      });

      void transport.spawn({ id, cwd, shell, cols: term.cols, rows: term.rows });

      // The panel group resizes the host without a window resize, so a
      // ResizeObserver is the only reliable trigger.
      const observer = new ResizeObserver(() => fit.fit());
      observer.observe(element);
      cleanupObserver = () => observer.disconnect();
    });

    return () => {
      disposed = true;
      cleanupObserver?.();
      unsubscribe?.();
      void transport.terminate(id);
      term?.dispose();
    };
  }, [id]);

  return (
    <div
      className="terminal"
      data-testid={testId}
      role="group"
      aria-label={ariaLabel}
      ref={host}
    />
  );
}
