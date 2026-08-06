import path from 'node:path';

import { app, utilityProcess, type UtilityProcess } from 'electron';

import {
  describeEngineExit,
  exhaustedMessage,
  mayRestart,
  parseEngineEvent,
  type EngineEvent,
  type EnginePhase,
  type EngineRequest,
} from './llama-protocol.js';

/**
 * Supervise the llama.cpp engine process.
 *
 * The engine is an Electron `utilityProcess`: a Node child with a message port
 * and a lifetime this process controls. Everything that touches
 * `node-llama-cpp` lives there and nowhere else, so a native abort ends one
 * child instead of the application. Issue #133.
 *
 * `utilityProcess` rather than `child_process` for two reasons that matter
 * here. It is a Chromium child, so it appears in the task manager, dies with
 * the application, and cannot be orphaned by a main process that crashes. And
 * its port is a `MessagePortMain`, which posts structured clones without a
 * JSON round trip, so a token is a message rather than a line of a protocol
 * this repository would then own.
 */

/** Restarted on demand, never on a timer. See `mayRestart`. */
let child: UtilityProcess | undefined;
let crashes: number[] = [];
let lastFailure = '';

/**
 * How far the engine got. Read by the packaged self check, so a wait that ends
 * in a timeout says which of the three ways it can hang happened.
 */
let phase: EnginePhase = 'not started';

export function enginePhase(): EnginePhase {
  return phase;
}

type Listener = (event: EngineEvent) => void;

/** One entry per outstanding operation, keyed by the id the caller chose. */
const listeners = new Map<string, Listener>();

/**
 * Where the engine bundle is.
 *
 * Beside the main bundle, in `.vite/build`, packaged and unpackaged alike.
 * Deriving it from `__dirname` rather than from `app.getAppPath()` keeps the
 * two files together whatever the archive is called.
 */
function enginePath(): string {
  return path.join(__dirname, 'llama-worker.js');
}

/** Deliver to the operation that asked, once the lifecycle events are read. */
function fanOut(event: EngineEvent): void {
  if (event.kind === 'hello') {
    phase = 'running';
    return;
  }
  if (event.kind === 'loaded') phase = 'loaded';
  listeners.get(event.id)?.(event);
}

function failAll(reason: string): void {
  for (const [id, listener] of [...listeners]) {
    listeners.delete(id);
    listener({ kind: 'failed', id, reason });
  }
}

function onExit(code: number): void {
  child = undefined;
  phase = 'not started';

  const reason = describeEngineExit(code, process.platform);
  if (code !== 0) {
    crashes.push(Date.now());
    lastFailure = reason;
    console.error(`llama engine: ${reason}`);
  }

  failAll(reason);
}

/**
 * Start the engine, or return the one already running.
 *
 * Throws rather than returning undefined when the budget is spent, so a caller
 * cannot carry on with no engine and a silent absence of tokens.
 */
function engine(): UtilityProcess {
  if (child) return child;

  if (!mayRestart(crashes, Date.now())) {
    throw new Error(exhaustedMessage(lastFailure));
  }

  const forked = utilityProcess.fork(enginePath(), [], {
    // Named, so a user looking at Activity Monitor or the Electron task
    // manager sees which child is holding a gigabyte of weights.
    serviceName: 'llama',
    stdio: 'pipe',
  });

  // node-llama-cpp writes the backend it chose, and every load failure, to
  // stderr. Dropping it would trade a crash for a silence.
  forked.stderr?.on('data', (chunk: Buffer) => {
    process.stderr.write(`[llama] ${chunk.toString()}`);
  });
  forked.stdout?.on('data', (chunk: Buffer) => {
    process.stdout.write(`[llama] ${chunk.toString()}`);
  });

  forked.on('message', (message: unknown) => {
    const event = parseEngineEvent(message);
    if (event) fanOut(event);
  });
  forked.on('spawn', () => {
    if (phase === 'not started') phase = 'forked';
  });
  forked.on('exit', onExit);

  child = forked;
  return forked;
}

/**
 * Subscribe to one operation. Returns the unsubscribe.
 *
 * The caller picks the id and puts the same one on the request, which is what
 * lets a download and a turn be in flight at once without a second port.
 */
export function listen(id: string, listener: Listener): () => void {
  listeners.set(id, listener);
  return () => listeners.delete(id);
}

/** Send one request. Starts the engine if it is not running. */
export function send(request: EngineRequest): void {
  engine().postMessage(request);
}

/** Stop the engine. It is started again by the next request. */
export function stopEngine(): void {
  const running = child;
  if (!running) return;
  child = undefined;
  phase = 'not started';
  listeners.clear();
  running.kill();
}

/** For tests and for the packaged self check: forget the crash history. */
export function resetEngineBudget(): void {
  crashes = [];
  lastFailure = '';
}

// Nothing outlives the application. `utilityProcess` children die with the
// main process, and this only makes the weights go earlier.
app.on('will-quit', stopEngine);
