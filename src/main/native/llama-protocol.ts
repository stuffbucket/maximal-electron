import type { ModelProgress } from '../../shared/ipc.js';

/**
 * The wire between the main process and the llama.cpp engine process, and the
 * decisions the main process makes when that process dies.
 *
 * The engine runs out of process because a native abort is not catchable. A
 * corrupt GGUF, an out-of-memory, or an unsupported quantisation ends in
 * `abort()` or a fault, and in the main process that took every window and
 * every terminal session with it. Issue #133.
 *
 * This module imports nothing that needs Electron, so it is mutation tested.
 * `llama-host.ts` owns the child, and `src/main/llama-worker.ts` is the child.
 */

/** A tool the engine may offer the model. Structured-clonable: no functions. */
export interface ToolOffer {
  name: string;
  description: string;
  /** JSON Schema. `grammar.ts` in the child decides whether it can be used. */
  parameters: unknown;
}

/** Main process to engine. */
export type EngineRequest =
  /** Load `node-llama-cpp` and say what it chose. The packaged self check. */
  | { kind: 'probe'; id: string }
  | { kind: 'ensure-model'; id: string; modelPath: string; url: string; minBytes: number }
  | { kind: 'cancel-download' }
  | {
      kind: 'run';
      id: string;
      modelPath: string;
      prompt: string;
      systemPrompt: string;
      maxTokens: number;
      contextSize: number;
      tools: ToolOffer[];
    }
  | { kind: 'abort' }
  | { kind: 'tool-result'; callId: string; text: string }
  /** The packaged self check. Proves supervision by dying on purpose. */
  | { kind: 'crash-on-purpose' };

/** Engine to main process. */
export type EngineEvent =
  /** The engine loaded `node-llama-cpp`. `device` is whatever it chose. */
  | { kind: 'loaded'; id: string; device: string }
  | { kind: 'progress'; id: string; progress: ModelProgress }
  | { kind: 'delta'; id: string; text: string }
  | { kind: 'tool-call'; id: string; callId: string; name: string; args: unknown }
  /** Tools with no expressible grammar. Named, never silently dropped. */
  | { kind: 'dropped'; id: string; names: string[] }
  | { kind: 'done'; id: string }
  | { kind: 'failed'; id: string; reason: string };

/* ------------------------------------------------------- reading the port */

/**
 * Read one message off the port, or nothing.
 *
 * A message that does not match is dropped rather than thrown. The port is the
 * seam to a process that is expected to die badly, and a half-written message
 * on the way down must not become an exception in the supervisor.
 */
export function parseEngineEvent(value: unknown): EngineEvent | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const message = value as Record<string, unknown>;
  if (typeof message.kind !== 'string') return undefined;
  if (typeof message.id !== 'string') return undefined;
  return message as unknown as EngineEvent;
}

/* -------------------------------------------------------- how it went down */

/**
 * Signal numbers that mean native code faulted. `SIGBUS` differs by platform,
 * which is the reason this is a per-platform table rather than one constant.
 */
const POSIX_FAULTS: Readonly<Record<string, number>> = {
  SIGILL: 4,
  SIGTRAP: 5,
  SIGABRT: 6,
  SIGFPE: 8,
  SIGKILL: 9,
  SIGSEGV: 11,
};

const SIGBUS: Readonly<Record<string, number>> = { darwin: 10, linux: 7 };

/** Windows reports a status code rather than a signal. */
const WINDOWS_FAULTS: Readonly<Record<number, string>> = {
  0xc0000005: 'access violation',
  0xc0000374: 'heap corruption',
  0xc0000409: 'stack buffer overrun',
  0xc000001d: 'illegal instruction',
};

/**
 * The name of the fault that killed the engine, or undefined for an ordinary
 * exit.
 *
 * Electron reports a POSIX signal death as the bare signal number, which is
 * indistinguishable from `process.exit(11)`. The engine therefore never exits
 * deliberately with anything but zero, so a non-zero code in this range is a
 * fault.
 */
export function faultName(code: number, platform: string): string | undefined {
  if (platform === 'win32') {
    const named = WINDOWS_FAULTS[code];
    if (named) return named;
    return code >= 0xc0000000 ? `native fault 0x${code.toString(16)}` : undefined;
  }

  // `code` is a number, so an unknown platform's absent entry never matches.
  if (code === SIGBUS[platform]) return 'SIGBUS';
  for (const [name, number] of Object.entries(POSIX_FAULTS)) {
    if (code === number) return name;
  }
  return undefined;
}

/**
 * What to tell the user when the engine process ends.
 *
 * The whole point of the boundary is that the application survives, so the
 * message says both halves: what died, and that nothing else did. A crash the
 * user cannot see is only marginally better than one that takes the app.
 */
export function describeEngineExit(code: number, platform: string): string {
  if (code === 0) return 'The model engine stopped.';

  const fault = faultName(code, platform);
  if (fault === undefined) {
    return `The model engine exited with code ${String(code)}. Nothing else was affected.`;
  }
  return (
    `The model engine crashed in native code (${fault}). Nothing else was affected. ` +
    'The model file may be corrupt, or the machine may have run out of memory. ' +
    'Delete the downloaded weights and try again.'
  );
}

/* ---------------------------------------------------------- restart budget */

/** How long a crash counts against the budget. */
export const CRASH_WINDOW_MS = 60_000;

/** Crashes allowed inside that window before the engine stops being restarted. */
export const CRASH_LIMIT = 3;

/** Crash times still inside the window, oldest first. */
export function recentCrashes(times: readonly number[], now: number): number[] {
  return times.filter((at) => now - at < CRASH_WINDOW_MS);
}

/**
 * May the engine be started again?
 *
 * A start only ever follows a request the user made, so there is no timer and
 * no loop. The budget is what stops a model that crashes on load from
 * respawning a 1 GB process on every keystroke, and it is the difference
 * between a failure the user can read and a machine that grinds.
 */
export function mayRestart(times: readonly number[], now: number): boolean {
  return recentCrashes(times, now).length < CRASH_LIMIT;
}

/** What to say once the budget is spent. */
export function exhaustedMessage(last: string): string {
  return (
    `${last} It has crashed ${String(CRASH_LIMIT)} times, so it will not be ` +
    'started again until the application restarts.'
  );
}

/* ------------------------------------------------------ the packaged check */

/**
 * The second half of the packaged self check, beside `--self-check=terminal`.
 *
 * `docs/architecture.md` said "nothing exercises the packaged llama.cpp", and
 * `verify:package` only reads names out of the archive listing. This launches
 * the installed binary, forks the engine, and makes it load the library from
 * `app.asar.unpacked` through a `utilityProcess` — which is the resolution
 * question moving the engine out of process created — and then kills it in
 * native code to prove the application survives.
 *
 * `scripts/smoke-packaged.mjs` runs under plain node and cannot import this
 * module, so it holds its own copies of these strings.
 * `tests/llama-protocol.test.ts` asserts they match.
 */
export const LLAMA_CHECK_FLAG = '--self-check=llama';
export const LLAMA_CHECK_OK = 'self-check llama: ok';
export const LLAMA_CHECK_FAILED = 'self-check llama: failed';

export type LlamaCheckResult =
  | { ok: true; device: string; survived: string }
  | { ok: false; reason: string };

export function llamaCheckRequested(argv: readonly string[]): boolean {
  return argv.includes(LLAMA_CHECK_FLAG);
}

/**
 * The one line the driver reads.
 *
 * A pass names the backend the engine chose and the crash it walked away from,
 * because "ok" alone would also be printed by a check that forked nothing.
 */
export function llamaCheckLine(result: LlamaCheckResult): string {
  return result.ok
    ? `${LLAMA_CHECK_OK} device=${result.device} survived=${result.survived}`
    : `${LLAMA_CHECK_FAILED}: ${result.reason}`;
}
