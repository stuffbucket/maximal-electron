import type { ITheme } from 'ghostty-web';

/**
 * What a terminal needs from its host, as a contract rather than an import.
 *
 * The shell's own terminal talks to a pty in the main process over IPC. A
 * consumer of this package has a different main process, a different channel
 * set, and possibly no Electron at all, so the component takes the transport
 * as a value instead of reaching for one.
 *
 * Every method is asynchronous because the shell that backs it is in another
 * process. `subscribe` returns its own unsubscribe, so a caller never has to
 * pair two calls.
 */

/** What to open, and where. */
export interface TerminalDescriptor {
  /**
   * Identifies the session for its whole lifetime, and is distinct from any
   * tab or project id. Reusing one for a second session is what lets a late
   * exit event delete a live shell.
   */
  id: string;
  /** Absolute. Immutable for one session; a new directory is a new session. */
  cwd?: string;
  /** Defaults to the host's own choice when absent. */
  shell?: string;
  /** Names the terminal for assistive technology. */
  ariaLabel?: string;
}

/** Output, or the end of it. */
export type TerminalEvent =
  | { type: 'data'; data: string }
  | { type: 'exit'; exitCode: number };

/**
 * What unmounting a view does to its session.
 *
 * `terminate` is the default, and is what every caller got before there was a
 * choice. `detach` leaves the shell running, which is what a long build needs
 * and what `tmux detach` means.
 */
export type TerminalDisposition = 'terminate' | 'detach';

/** A live session, whether or not a view is showing it. */
export interface TerminalSession {
  id: string;
  cwd: string;
  shell: string;
  /** Milliseconds since the epoch. */
  startedAt: number;
}

export interface TerminalTransport {
  /**
   * Open a session, or attach to the one `id` already names.
   *
   * A host that supports detach replays what the session has printed, so
   * attaching is how a view returns to a shell it left running.
   */
  spawn(descriptor: TerminalDescriptor & { cols: number; rows: number }): Promise<void>;
  write(id: string, data: string): Promise<void>;
  resize(id: string, cols: number, rows: number): Promise<void>;
  terminate(id: string): Promise<void>;
  /** Only this session's events. Returns its own unsubscribe. */
  subscribe(id: string, listener: (event: TerminalEvent) => void): () => void;
}

/**
 * A transport whose sessions can be found again.
 *
 * `TerminalView` demands this to accept `disposition="detach"`. A session that
 * outlives its view and that nothing can enumerate is a process the user cannot
 * see and cannot stop, which is a leak rather than a feature, so the type
 * refuses the half of the pair that leaks.
 */
export interface DetachableTerminalTransport extends TerminalTransport {
  /** Every live session, including ones no view is showing. */
  list(): Promise<TerminalSession[]>;
}

/**
 * The colours the emulator needs, resolved from custom properties.
 *
 * `ghostty-web` renders to a canvas, so it inherits nothing from CSS and takes
 * literal strings. `read` returns a property's current value; taking it as a
 * parameter keeps this pure and lets a consumer resolve its own namespace.
 *
 * A property that does not resolve is left out rather than passed through
 * empty. `ghostty-web` parses an unrecognised colour to black, so an empty
 * string renders black on black; omitting the key keeps its own default, which
 * is legible.
 */
export function readTerminalTheme(
  read: (property: string) => string,
  properties: { background: string; foreground: string; cursor: string },
): ITheme {
  const theme: ITheme = {};

  const background = read(properties.background).trim();
  if (background) theme.background = background;

  const foreground = read(properties.foreground).trim();
  if (foreground) theme.foreground = foreground;

  const cursor = read(properties.cursor).trim();
  if (cursor) theme.cursor = cursor;

  return theme;
}

/** The properties a consumer of this package supplies. */
export const SHELL_TERMINAL_PROPERTIES = {
  background: '--shell-terminal-background',
  foreground: '--shell-terminal-foreground',
  cursor: '--shell-terminal-cursor',
} as const;
