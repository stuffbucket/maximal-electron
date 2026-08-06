import { existsSync, statSync } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import { app } from 'electron';

import type { ModelProgress } from '../../shared/ipc.js';

/**
 * The embedded model: download, load, and unload. The floor under the provider
 * chain, so that the application is never useless with nothing installed. See
 * `docs/agent.md`.
 *
 * The weights are not in the package. They are a third of a gigabyte and
 * change on a different schedule to the application, so shipping them would pin
 * the model to the app version and put that download on every update.
 *
 * `node-llama-cpp` is ESM only while this bundle is CommonJS, and Rollup
 * rewrites a plain dynamic import into `require`, which cannot load it. The
 * `Function` constructor below hides the import from the bundler. Main process
 * only: the library crashes a renderer.
 */

/**
 * Qwen3 0.6B, Q8_0, from Qwen's own GGUF repository.
 *
 * Chosen for the concierge case rather than for coding. In a published
 * comparison of 21 open-weight models it tied for the best agent score, and
 * the property that matters is restraint: it answers a general question
 * without reaching for a tool. Llama 3.2 at a similar size calls a tool on
 * every prompt, which trains people to dismiss the approval card unread.
 *
 * Only Q8_0 is published in that repository, so there is no smaller quant to
 * pick without moving to a community mirror.
 */
const MODEL = {
  file: 'Qwen3-0.6B-Q8_0.gguf',
  url: 'https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf',
  label: 'Qwen3 0.6B',
  approxMb: 610,
} as const;

export const EMBEDDED_MODEL_LABEL = MODEL.label;
export const EMBEDDED_MODEL_MB = MODEL.approxMb;

/** Smallest plausible weights file. Guards against a truncated download. */
const MIN_MODEL_BYTES = 100_000_000;

type EsmImport = (specifier: string) => Promise<Record<string, unknown>>;
const esmImport = new Function(
  's',
  'return import(s)',
) as unknown as EsmImport;

export async function loadLlamaModule(): Promise<Record<string, unknown>> {
  return esmImport('node-llama-cpp');
}

/* ----------------------------------------------------------------- paths */

export function modelPath(): string {
  // An override, for testing and for support. It lets a run point at weights
  // that are already on disk instead of fetching another copy into a throwaway
  // profile, which is what the end-to-end test does.
  const override = process.env['STUFFBUCKET_MODEL_PATH'];
  if (override) return override;
  return path.join(app.getPath('userData'), 'models', MODEL.file);
}

/**
 * Directory the weights live in.
 *
 * Derived from `modelPath` rather than computed alongside it. When the two
 * were independent, the override moved the file but not the directory, so a
 * download created the default folder and then renamed across to the override.
 */
function modelDir(): string {
  return path.dirname(modelPath());
}

/** Where a download lands before it is complete. */
function partialPath(): string {
  return `${modelPath()}.part`;
}

/**
 * Is the model on disk and plausibly whole?
 *
 * A size floor rather than a checksum. A hash of a 610 MB file costs seconds
 * on every summon, and the failure this needs to catch is a truncated or
 * interrupted download, which the floor catches. The final rename is what
 * makes a partial file impossible to mistake for a finished one.
 */
export function isModelPresent(): boolean {
  const file = modelPath();
  if (!existsSync(file)) return false;
  try {
    return statSync(file).size >= MIN_MODEL_BYTES;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------- download */

let inFlight: Promise<ModelProgress> | undefined;
let controller: AbortController | undefined;

/** Stop a download in progress. The partial file is left for a later resume. */
export function cancelModelDownload(): void {
  controller?.abort();
}

/**
 * Fetch the model if it is missing.
 *
 * Concurrent callers share one download rather than racing for the same file.
 * Progress is reported through `onProgress`, which the main process forwards
 * as `model:progress` events.
 */
export async function ensureModel(
  onProgress: (progress: ModelProgress) => void,
): Promise<ModelProgress> {
  if (isModelPresent()) return { state: 'ready' };
  if (inFlight) return inFlight;

  inFlight = download(onProgress).finally(() => {
    inFlight = undefined;
    controller = undefined;
  });
  return inFlight;
}

async function download(
  onProgress: (progress: ModelProgress) => void,
): Promise<ModelProgress> {
  controller = new AbortController();
  const target = modelPath();
  const partial = partialPath();

  try {
    await mkdir(modelDir(), { recursive: true });

    const nlc = await loadLlamaModule();
    const createModelDownloader = nlc.createModelDownloader as (
      options: Record<string, unknown>,
    ) => Promise<{
      totalSize: number;
      download: (options?: { signal?: AbortSignal }) => Promise<string>;
    }>;

    let total = 0;
    const downloader = await createModelDownloader({
      modelUri: MODEL.url,
      dirPath: modelDir(),
      fileName: path.basename(partial),
      // Keep a partial file on cancel so a retry resumes rather than restarts.
      deleteTempFileOnCancel: false,
      onProgress: ({ totalSize, downloadedSize }: {
        totalSize: number;
        downloadedSize: number;
      }) => {
        total = totalSize;
        onProgress({
          state: 'downloading',
          received: downloadedSize,
          total: totalSize,
        });
      },
    });

    onProgress({ state: 'downloading', received: 0, total: downloader.totalSize });
    await downloader.download({ signal: controller.signal });

    // Only now does the file take its real name. Anything that dies before
    // this point leaves a `.part`, which `isModelPresent` does not accept.
    const written = await stat(partial).catch(() => undefined);
    if (!written || written.size < MIN_MODEL_BYTES) {
      throw new Error(
        `Downloaded ${String(written?.size ?? 0)} bytes of an expected ` +
          `${String(total || downloader.totalSize)}, which is too small to be the model.`,
      );
    }
    await rename(partial, target);

    const ready: ModelProgress = { state: 'ready' };
    onProgress(ready);
    return ready;
  } catch (error) {
    const aborted = controller?.signal.aborted === true;
    const reason = aborted
      ? 'Download cancelled.'
      : describeDownloadFailure(error);

    // A failed attempt that is not a cancellation may have left a corrupt
    // partial. Clear it so a retry starts clean rather than resuming garbage.
    if (!aborted) await rm(partial, { force: true }).catch(() => undefined);

    const failed: ModelProgress = { state: 'error', reason };
    onProgress(failed);
    return failed;
  }
}

/** Turn a network failure into something a person can act on. */
function describeDownloadFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|fetch failed/i.test(message)) {
    return 'Could not reach the model host. Check your network connection, then try again.';
  }
  if (/ENOSPC/i.test(message)) {
    return 'Not enough disk space for the model.';
  }
  return `Download failed: ${message}`;
}

/* ------------------------------------------------------------ model load */

interface LoadedModel {
  model: unknown;
}

let loaded: LoadedModel | undefined;

/**
 * Load the weights, once.
 *
 * Loading costs seconds and holds memory, so it is cached for the life of the
 * process. The overlay is summoned briefly and often, and paying that on every
 * summon would make the embedded path feel broken.
 *
 * There is deliberately no counterpart that frees them.
 *
 * Disposal is native async work. Started while the application is quitting, it
 * completes inside `node::Environment::RunCleanup`, and the addon then calls
 * `ThrowAsJavaScriptException` against an environment that is already being
 * torn down. The exception escapes into ggml's terminate handler and the
 * process aborts. That crashed every embedded run on exit while the test suite
 * stayed green, because the abort happens after the last assertion.
 *
 * Freeing memory microseconds before the process exits buys nothing. The
 * operating system reclaims it either way, so the safe thing is to never ask.
 */
export async function getEmbeddedModel(): Promise<unknown> {
  if (loaded) return loaded.model;
  if (!isModelPresent()) {
    throw new Error('The embedded model has not been downloaded yet.');
  }

  const nlc = await loadLlamaModule();
  const getLlama = nlc.getLlama as () => Promise<{
    loadModel: (options: { modelPath: string }) => Promise<{
      dispose: () => Promise<void>;
    }>;
  }>;

  const llama = await getLlama();
  const model = await llama.loadModel({ modelPath: modelPath() });
  loaded = { model };
  return model;
}
