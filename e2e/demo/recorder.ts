import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { clearCaption, setCaption, type CaptionPlacement } from './caption.js';
import { encode, probe, type ProbeResult, type Segment } from './encode.js';
import { createRecorder, type CaptureMethod, type Frame } from './screencast.js';

/**
 * A scripted screen recorder for the running application.
 *
 * A timeline is a list of scenes. Each scene drives the interface, then holds
 * still long enough to be read. The pacing rules below are enforced here
 * rather than left to whoever writes a timeline, because every one of them is
 * the sort of thing that is easy to shave off and hard to notice until the
 * video is unwatchable.
 *
 * - A scene settles for `SETTLE_SECONDS` after its actions finish, and only
 *   then starts its hold. The two are separate on purpose. `drive` resolves
 *   when the last instruction returns, which can be before the interface has
 *   finished reacting to it, so counting the hold from there spends part of it
 *   on a screen that is still moving.
 * - A scene holds for at least `MIN_HOLD_SECONDS` on the settled screen. The
 *   number is deliberately generous. The first cut of this used two and a half
 *   seconds and read as a slideshow of things that had already happened: a
 *   change would land and the shot would cut before anyone could take it in.
 * - Scenes never butt up against each other. `GAP_SECONDS` of held frame sits
 *   between them, and ffmpeg dips through black across the join.
 * - A video runs for at least `MIN_TOTAL_SECONDS`. A short timeline pads its
 *   last scene. Nothing is ever sped up to fit.
 *
 * A timeline that cannot reach the minimum even with the largest allowed pad
 * is rejected before the application launches, not after a minute of
 * recording.
 *
 * One rule this cannot enforce, for whoever writes a timeline: when the point
 * of a scene is a visible change, make the change happen **early** in `drive`
 * and let the hold sit on the result. A scene that changes the theme on its
 * last line spends its whole hold on the wrong picture.
 */

/**
 * Shortest hold a scene may ask for, in seconds.
 *
 * This is time on a still screen, after `SETTLE_SECONDS`. Five seconds feels
 * long while writing a timeline and about right while watching one.
 */
export const MIN_HOLD_SECONDS = 5;

/** Pause after `drive` resolves, before the hold starts counting. */
export const SETTLE_SECONDS = 1.2;

/** Shortest video this will produce, in seconds. */
export const MIN_TOTAL_SECONDS = 30;

/** Held frame between two scenes, in seconds. The dip happens inside it. */
export const GAP_SECONDS = 1.2;

/** Fade at each end of a scene, in seconds. */
export const DIP_SECONDS = 0.35;

/**
 * Most a final scene may be padded by, in seconds.
 *
 * Padding rescues a timeline that runs a little short. Without a ceiling it
 * would also happily turn a ten second timeline into twelve seconds of frozen
 * screen, which meets the duration rule and fails the point of it.
 *
 * The number is tied to the two above it. A scene now costs at least
 * `MIN_HOLD_SECONDS + SETTLE_SECONDS + GAP_SECONDS`, so two scenes are worth
 * fourteen and a half seconds on their own. A cap of twenty would have made
 * every two scene timeline legal, and the check below dead code. Twelve keeps
 * it live: a timeline needs three scenes, or holds longer than the floor.
 */
export const MAX_FINAL_PAD_SECONDS = 12;

export const OUTPUT_FPS = 30;
export const OUTPUT_WIDTH = 1440;
export const OUTPUT_HEIGHT = 900;

export interface SceneContext {
  app: ElectronApplication;
  /** The main shell window. */
  shell: Page;
}

export interface Scene {
  /** The heading in the lower third. */
  name: string;
  /** An optional second line under the heading. */
  note?: string;
  /**
   * Where the caption sits. Move it to the top when the page draws something
   * along its bottom edge, which the overlay card does.
   */
  caption?: CaptionPlacement;
  /** Seconds to hold after `drive` resolves. At least `MIN_HOLD_SECONDS`. */
  hold: number;
  /**
   * Resolve the page this scene records. Runs before the scene's clock
   * starts, so setup work here stays out of the video. Defaults to the shell.
   */
  target?: (context: SceneContext) => Promise<Page>;
  /** What the viewer watches happen. */
  drive: (context: SceneContext) => Promise<void>;
}

export interface RecordOptions {
  app: ElectronApplication;
  shell: Page;
  scenes: Scene[];
  /** Absolute path to the mp4 to write. */
  output: string;
  /** Logical window size to record at. */
  width?: number;
  height?: number;
  /** Keep the captured stills instead of deleting them. */
  keepFrames?: boolean;
}

export interface RecordResult {
  output: string;
  /** Which capture method the shell window ended up using. */
  method: CaptureMethod;
  frames: number;
  /** Per-scene durations, in seconds, as recorded. */
  scenes: { name: string; seconds: number }[];
  probe: ProbeResult;
  /** The directory the stills went to, when `keepFrames` was set. */
  frameDir?: string;
}

/**
 * Declare a scene.
 *
 * Use this rather than an object literal: it is where the hold rule is
 * checked, and a bare literal would skip it.
 */
export function scene(definition: Scene): Scene {
  if (definition.name.trim().length === 0) {
    throw new Error('A scene needs a name. It is the caption the viewer reads.');
  }
  if (!(definition.hold >= MIN_HOLD_SECONDS)) {
    throw new Error(
      `Scene "${definition.name}" holds for ${String(definition.hold)}s. ` +
        `The floor is ${String(MIN_HOLD_SECONDS)}s, so the screen can be read.`,
    );
  }
  return definition;
}

/** Reject a timeline that cannot reach the minimum duration. */
export function validateTimeline(scenes: Scene[]): void {
  if (scenes.length < 2) {
    throw new Error('A timeline needs at least two scenes.');
  }

  for (const item of scenes) scene(item);

  // Actions add time on top of this, so it is a floor rather than an estimate.
  const floor = scenes.reduce(
    (total, item) => total + item.hold + SETTLE_SECONDS + GAP_SECONDS,
    0,
  );
  const reachable = floor + MAX_FINAL_PAD_SECONDS;

  if (reachable < MIN_TOTAL_SECONDS) {
    throw new Error(
      `This timeline tops out at ${reachable.toFixed(1)}s: ` +
        `${floor.toFixed(1)}s of holds and gaps, plus the ` +
        `${String(MAX_FINAL_PAD_SECONDS)}s cap on padding the last scene. ` +
        `The floor is ${String(MIN_TOTAL_SECONDS)}s. Add scenes or lengthen the holds.`,
    );
  }
}

const wait = (seconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, Math.round(seconds * 1000)));

/**
 * Lay one scene out as a numbered sequence at the output frame rate.
 *
 * A screencast only emits when the picture changes, so a scene that ends in a
 * three second hold ends in a single frame. Every output tick therefore takes
 * whichever still was last on screen at that moment, and a held frame is
 * simply linked once per tick. Links rather than copies: a minute of video is
 * eighteen hundred ticks over roughly nine hundred distinct stills.
 *
 * This is why the timing lives here rather than in a capture frame rate.
 */
async function writeSequence(
  frames: Frame[],
  start: number,
  end: number,
  dir: string,
): Promise<number> {
  const opening = frames.filter((frame) => frame.at <= start).at(-1) ?? frames[0];
  if (!opening) throw new Error('No frames were captured for a scene.');

  await mkdir(dir, { recursive: true });

  const ticks = Math.max(1, Math.round(((end - start) / 1000) * OUTPUT_FPS));
  let cursor = 0;
  let current = opening;

  for (let tick = 0; tick < ticks; tick += 1) {
    const at = start + (tick * 1000) / OUTPUT_FPS;
    while (cursor < frames.length) {
      const frame = frames[cursor];
      if (!frame || frame.at > at) break;
      current = frame;
      cursor += 1;
    }
    await symlink(
      current.file,
      path.join(dir, `${String(tick + 1).padStart(6, '0')}.jpg`),
    );
  }

  return ticks;
}

/** Put the window at the size the video is cut for. */
async function resizeShell(
  app: ElectronApplication,
  shell: Page,
  width: number,
  height: number,
): Promise<void> {
  const handle = await app.browserWindow(shell);
  // Keep the position. A quiet run has already moved the window out of the
  // user's way, and putting it back would hijack the desktop for a minute.
  await handle.evaluate(
    (win, size) => {
      const bounds = win.getBounds();
      win.setBounds({ x: bounds.x, y: bounds.y, ...size });
    },
    { width, height },
  );
  await shell.waitForFunction(
    (size) => window.innerWidth === size.width && window.innerHeight === size.height,
    { width, height },
    { timeout: 10_000 },
  );
}

/** Drive the timeline, capture it, and encode it. */
export async function record(options: RecordOptions): Promise<RecordResult> {
  const { app, shell, scenes, output } = options;
  const width = options.width ?? OUTPUT_WIDTH;
  const height = options.height ?? OUTPUT_HEIGHT;

  validateTimeline(scenes);

  await resizeShell(app, shell, width, height);
  await mkdir(path.dirname(output), { recursive: true });

  const frameDir = await mkdtemp(path.join(tmpdir(), 'stuffbucket-record-'));
  const recorder = createRecorder(frameDir);
  const context: SceneContext = { app, shell };
  const touched = new Set<Page>([shell]);
  const spans: { name: string; page: Page; start: number; end: number }[] = [];

  try {
    let accumulated = 0;

    for (const [index, item] of scenes.entries()) {
      const page = item.target ? await item.target(context) : shell;
      touched.add(page);
      await recorder.attach(page);
      await setCaption(page, item.name, item.note, item.caption);

      const start = Date.now();
      await item.drive(context);

      // Let the interface finish reacting before the hold starts counting.
      // `drive` resolves when the last instruction returns, which is often
      // before the screen has caught up with it.
      await wait(SETTLE_SECONDS);

      const last = index === scenes.length - 1;
      const hold = last
        ? finalHold(item.hold, accumulated + (Date.now() - start) / 1000)
        : item.hold;

      await wait(hold);
      // The deliberate pause between scenes. The dip happens across it.
      await wait(GAP_SECONDS);

      const end = Date.now();
      accumulated += (end - start) / 1000;
      spans.push({ name: item.name, page, start, end });
      process.stdout.write(
        `  scene ${String(index + 1)}/${String(scenes.length)} ` +
          `${item.name} — ${((end - start) / 1000).toFixed(1)}s\n`,
      );
    }
  } finally {
    await recorder.stop();
    for (const page of touched) await clearCaption(page);
  }

  const segments: Segment[] = [];
  for (const [index, span] of spans.entries()) {
    const dir = path.join(frameDir, `scene-${String(index).padStart(2, '0')}`);
    const frames = await writeSequence(
      recorder.frames(span.page),
      span.start,
      span.end,
      dir,
    );
    segments.push({ pattern: path.join(dir, '%06d.jpg'), frames });
  }

  await encode({ segments, output, width, height, fps: OUTPUT_FPS, dip: DIP_SECONDS });

  const result = await probe(output);
  if (result.seconds + 0.5 < MIN_TOTAL_SECONDS) {
    throw new Error(
      `${output} is ${result.seconds.toFixed(2)}s, under the ` +
        `${String(MIN_TOTAL_SECONDS)}s floor.`,
    );
  }
  if (result.codec !== 'h264') {
    throw new Error(`${output} is ${result.codec}, not h264.`);
  }

  const pages = new Set(spans.map((span) => span.page));
  let frames = 0;
  for (const page of pages) frames += recorder.frames(page).length;

  if (!options.keepFrames) await rm(frameDir, { recursive: true, force: true });

  return {
    output,
    method: recorder.methodFor(shell),
    frames,
    scenes: spans.map((span) => ({
      name: span.name,
      seconds: (span.end - span.start) / 1000,
    })),
    probe: result,
    ...(options.keepFrames ? { frameDir } : {}),
  };
}

/** Stretch the last hold to carry the video over the duration floor. */
function finalHold(hold: number, elapsed: number): number {
  const shortfall = MIN_TOTAL_SECONDS - elapsed - GAP_SECONDS;
  return Math.min(Math.max(hold, shortfall), hold + MAX_FINAL_PAD_SECONDS);
}
