import { statSync } from 'node:fs';

import { spawn, type IPty } from '@lydell/node-pty';
import { app } from 'electron';

import type { PtySpawnRequest } from '../../shared/ipc.js';
import {
  append,
  cwdMessage,
  drain,
  emptyBuffer,
  Generations,
  resolveCwd,
  type Buffered,
} from './pty-session.js';

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
  pending: Buffered;
  timer: NodeJS.Timeout | undefined;
  /** Distinguishes this session from a later one with the same id. */
  generation: number;
}

const sessions = new Map<string, Session>();
const generations = new Generations();

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
  const { text, dropped } = drain(session.pending);
  if (text === '' && dropped === 0) return;
  const notice =
    dropped > 0
      ? `\r\n\x1b[2m[${String(dropped)} characters dropped: output outran the display]\x1b[0m\r\n`
      : '';
  emit(id, notice + text);
}

function schedule(id: string, session: Session): void {
  if (session.timer) return;
  session.timer = setTimeout(() => flush(id, session), FLUSH_MS);
}

export function spawnPty(request: PtySpawnRequest): void {
  // Replacing an existing session would leak the old process.
  if (sessions.has(request.id)) return;

  const shell = request.shell ?? defaultShell();
  const home = app.getPath('home');
  const resolved = resolveCwd(request.cwd, home, (target) => {
    try {
      return { isDirectory: statSync(target).isDirectory() };
    } catch {
      return undefined;
    }
  });

  // A refused directory is reported into the terminal rather than thrown. The
  // renderer asked for a shell; it gets one, in a place it can see named.
  const generation = generations.next(request.id);
  if (!resolved.ok) {
    const reason = cwdMessage(resolved.reason, request.cwd ?? '');
    queueMicrotask(() => {
      emit(request.id, `\r\n\x1b[31m${reason}. Starting in ${home}.\x1b[0m\r\n`);
    });
  }
  const cwd = resolved.ok ? resolved.cwd : home;

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

  const session: Session = { pty, pending: emptyBuffer(), timer: undefined, generation };
  sessions.set(request.id, session);

  pty.onData((data) => {
    append(session.pending, data);
    schedule(request.id, session);
  });

  pty.onExit(({ exitCode }) => {
    flush(request.id, session);
    // A killed session's exit can arrive after the same id was reused. Acting
    // on it then would delete the live session and silence a running shell.
    if (!generations.release(request.id, generation)) return;
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
  generations.release(id, session.generation);
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
