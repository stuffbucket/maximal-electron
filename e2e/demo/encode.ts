import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * The ffmpeg half of the recording pipeline.
 *
 * The capture side produces one still per compositor frame, at irregular
 * intervals, because a screencast only emits when something changes. So the
 * timing lives in a concat list per scene rather than in a frame rate, and
 * ffmpeg resamples that to a constant thirty frames a second.
 */

/**
 * One scene, as a numbered image sequence at the output frame rate.
 *
 * The sequence is built rather than timed. Feeding ffmpeg a concat list of
 * stills with a `duration` each looks simpler and is wrong: the concat demuxer
 * rounds every duration to the inner demuxer's time base, which for a still is
 * a fortieth of a second. Frames arriving at about thirty a second each got
 * rounded up to forty milliseconds, and a thirty eight second timeline came
 * out as fifty one seconds of slow motion.
 */
export interface Segment {
  /** Absolute `printf` pattern, for example `/tmp/scene-00/%06d.jpg`. */
  pattern: string;
  /** How many stills the sequence holds. */
  frames: number;
}

export interface EncodeOptions {
  segments: Segment[];
  output: string;
  width: number;
  height: number;
  fps: number;
  /** Length of the fade at each end of a scene, in seconds. */
  dip: number;
}

export interface ProbeResult {
  seconds: number;
  codec: string;
  width: number;
  height: number;
  frameRate: string;
  bytes: number;
}

function resolveTool(name: string, override: string | undefined): string {
  if (override && override.length > 0) return override;
  const candidate = `/opt/homebrew/bin/${name}`;
  return existsSync(candidate) ? candidate : name;
}

export function ffmpegPath(): string {
  return resolveTool('ffmpeg', process.env['FFMPEG']);
}

export function ffprobePath(): string {
  return resolveTool('ffprobe', process.env['FFPROBE']);
}

/** Run a command and collect its output, rejecting on a non-zero exit. */
function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`${command} exited ${String(code)}\n${err.slice(-4000)}`));
    });
  });
}

/**
 * Build the filter graph.
 *
 * Every scene is scaled into the same frame, padded rather than stretched, so
 * a scene recorded from a differently shaped window still cuts together. The
 * fade at each end is the dip that keeps two scenes from butting up against
 * each other. The first fade in and the last fade out double as the titles.
 */
function filterGraph(options: EncodeOptions): string {
  const { width: w, height: h, fps, dip } = options;
  // `in_range=full:out_range=tv` matters. The stills are JPEG, which is full
  // range, and carrying that through tags the mp4 as `yuvj420p`. Players
  // disagree about what to do with that tag, so the same file comes out washed
  // out in one and crushed in another. Converting here writes a plain
  // `yuv420p` limited-range stream instead. It also puts black at the level
  // the fade below expects.
  const scale =
    `scale=${String(w)}:${String(h)}:force_original_aspect_ratio=decrease` +
    ':in_range=full:out_range=tv,' +
    `pad=${String(w)}:${String(h)}:(ow-iw)/2:(oh-ih)/2:color=black,` +
    'setsar=1,format=yuv420p';

  const parts = options.segments.map((segment, index) => {
    const seconds = segment.frames / fps;
    const out = Math.max(0, seconds - dip).toFixed(3);
    return (
      `[${String(index)}:v]${scale},` +
      `fade=t=in:st=0:d=${dip.toFixed(3)},` +
      `fade=t=out:st=${out}:d=${dip.toFixed(3)}[v${String(index)}]`
    );
  });

  const inputs = options.segments.map((_, index) => `[v${String(index)}]`).join('');
  parts.push(`${inputs}concat=n=${String(options.segments.length)}:v=1:a=0[out]`);
  return parts.join(';');
}

/** Encode every scene into one mp4 that plays anywhere. */
export async function encode(options: EncodeOptions): Promise<void> {
  const args = ['-y', '-hide_banner', '-loglevel', 'error'];

  for (const segment of options.segments) {
    args.push(
      '-framerate',
      String(options.fps),
      '-start_number',
      '1',
      '-i',
      segment.pattern,
    );
  }

  args.push(
    '-filter_complex',
    filterGraph(options),
    '-map',
    '[out]',
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '20',
    // Constant frame rate, and a pixel format every player understands.
    '-r',
    String(options.fps),
    '-fps_mode',
    'cfr',
    '-pix_fmt',
    'yuv420p',
    '-color_range',
    'tv',
    // Put the index at the front, so the file streams rather than downloads.
    '-movflags',
    '+faststart',
    options.output,
  );

  await run(ffmpegPath(), args);
}

/** Read back what was actually written. */
export async function probe(file: string): Promise<ProbeResult> {
  const raw = await run(ffprobePath(), [
    '-v',
    'error',
    '-show_entries',
    'format=duration,size:stream=codec_name,width,height,avg_frame_rate',
    '-select_streams',
    'v:0',
    '-of',
    'json',
    file,
  ]);

  const parsed = JSON.parse(raw) as {
    format?: { duration?: string; size?: string };
    streams?: {
      codec_name?: string;
      width?: number;
      height?: number;
      avg_frame_rate?: string;
    }[];
  };

  const stream = parsed.streams?.[0];
  if (!stream) throw new Error(`${file} has no video stream.`);

  return {
    seconds: Number(parsed.format?.duration ?? '0'),
    bytes: Number(parsed.format?.size ?? '0'),
    codec: stream.codec_name ?? 'unknown',
    width: stream.width ?? 0,
    height: stream.height ?? 0,
    frameRate: stream.avg_frame_rate ?? 'unknown',
  };
}
