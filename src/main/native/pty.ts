import { spawn, type IPty } from '@lydell/node-pty';
import { app } from 'electron';

import type { PtySpawnRequest } from '../../shared/ipc.js';

/**
 * Pseudo-terminal sessions, one per document tab.
 *
 * The shell runs here, in the main process. The renderer holds a `ghostty-web`
 * terminal, which is a view and an input encoder, not a process host. Bytes
 * flow main to renderer as `pty:data` events, and renderer to main through the
 * `pty:write` channel.
 *
 * This split is what keeps `sandbox: true` on the renderer. The renderer never
 * spawns anything.
 */

interface Session {
  pty: IPty;
  /** Buffered output, flushed on a timer. See `FLUSH_MS`. */
  pending: string[];
  timer: NodeJS.Timeout | undefined;
}

const sessions = new Map<string, Session>();

/**
 * Output is batched before it crosses the process boundary.
 *
 * A build log can emit thousands of small writes per second. One IPC message
 * each would swamp the channel and stall the renderer. Coalescing on a short
 * timer turns that into a few messages per frame, which is the same approach
 * a terminal in an editor takes.
 */
const FLUSH_MS = 8;

/** Emit batched output. The main entry point supplies this. */
type Emit = (id: string, chunk: string) => void;
type Exit = (id: string, exitCode: number) => void;

let emit: Emit = () => undefined;
let onExit: Exit = () => undefined;

export function configurePty(handlers: { emit: Emit; onExit: Exit }): void {
  emit = handlers.emit;
  onExit = handlers.onExit;
}

/** The user's login shell, or a sane default for the platform. */
export function defaultShell(): string {
  if (process.platform === 'win32') {
    return process.env['COMSPEC'] ?? 'powershell.exe';
  }
  return process.env['SHELL'] ?? '/bin/zsh';
}

function flush(id: string, session: Session): void {
  session.timer = undefined;
  if (session.pending.length === 0) return;
  const chunk = session.pending.join('');
  session.pending.length = 0;
  emit(id, chunk);
}

function schedule(id: string, session: Session): void {
  if (session.timer) return;
  session.timer = setTimeout(() => flush(id, session), FLUSH_MS);
}

export function spawnPty(request: PtySpawnRequest): void {
  // Replacing an existing session would leak the old process.
  if (sessions.has(request.id)) return;

  const shell = request.shell ?? defaultShell();
  const cwd = request.cwd ?? app.getPath('home');

  const pty = spawn(shell, [], {
    name: 'xterm-256color',
    cols: Math.max(1, request.cols),
    rows: Math.max(1, request.rows),
    cwd,
    env: {
      ...(process.env as Record<string, string>),
      // Tell programs they are on a capable terminal. Ghostty's own emulator
      // is what actually interprets the escape sequences.
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      TERM_PROGRAM: 'Stuffbucket',
    },
  });

  const session: Session = { pty, pending: [], timer: undefined };
  sessions.set(request.id, session);

  pty.onData((data) => {
    session.pending.push(data);
    schedule(request.id, session);
  });

  pty.onExit(({ exitCode }) => {
    flush(request.id, session);
    sessions.delete(request.id);
    onExit(request.id, exitCode);
  });
}

export function writePty(id: string, data: string): void {
  sessions.get(id)?.pty.write(data);
}

export function resizePty(id: string, cols: number, rows: number): void {
  const session = sessions.get(id);
  if (!session) return;
  // node-pty throws on a zero or negative dimension, which happens whenever a
  // tab is measured while hidden.
  session.pty.resize(Math.max(1, cols), Math.max(1, rows));
}

export function killPty(id: string): void {
  const session = sessions.get(id);
  if (!session) return;
  if (session.timer) clearTimeout(session.timer);
  sessions.delete(id);
  try {
    session.pty.kill();
  } catch {
    // Already gone. Nothing to do.
  }
}

/** Kill every session. Call on quit, so no shell outlives the application. */
export function killAllPtys(): void {
  for (const id of [...sessions.keys()]) killPty(id);
}
