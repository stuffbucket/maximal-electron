import { afterEach, describe, expect, it } from 'vitest';

import {
  candidatePaths,
  detectFfmpeg,
  findTool,
  installHint,
  missingMessage,
  requireFfmpeg,
} from '../src/main/native/ffmpeg.js';

/**
 * The detection rules.
 *
 * The pure parts are asserted exactly, because they are in the Stryker mutate
 * list. The impure parts are exercised against real commands that every
 * machine has, rather than against a mock, so the spawn path is actually
 * covered.
 */

describe('candidatePaths', () => {
  it('lets an override win outright', () => {
    const paths = candidatePaths('ffmpeg', 'darwin', { FFMPEG: '/custom/ffmpeg' });
    expect(paths).toEqual(['/custom/ffmpeg']);
  });

  it('trims an override, and ignores a blank one', () => {
    expect(candidatePaths('ffmpeg', 'darwin', { FFMPEG: '  /x/ffmpeg  ' })).toEqual([
      '/x/ffmpeg',
    ]);
    // Blank is not a choice, so the search proceeds as if it were unset.
    expect(candidatePaths('ffmpeg', 'darwin', { FFMPEG: '   ' }).length).toBeGreaterThan(
      1,
    );
    expect(candidatePaths('ffmpeg', 'darwin', { FFMPEG: '' }).length).toBeGreaterThan(1);
  });

  it('reads the override belonging to the named tool', () => {
    // ffprobe must not be found through FFMPEG.
    expect(candidatePaths('ffprobe', 'darwin', { FFMPEG: '/custom/ffmpeg' })).not.toEqual(
      ['/custom/ffmpeg'],
    );
    expect(candidatePaths('ffprobe', 'darwin', { FFPROBE: '/custom/probe' })).toEqual([
      '/custom/probe',
    ]);
  });

  it('searches macOS in a deliberate order', () => {
    // The order is the contract, so it is asserted exactly: Homebrew on Apple
    // Silicon, Homebrew on Intel, MacPorts, the system, then PATH.
    expect(candidatePaths('ffmpeg', 'darwin', {})).toEqual([
      '/opt/homebrew/bin/ffmpeg',
      '/usr/local/bin/ffmpeg',
      '/opt/local/bin/ffmpeg',
      '/usr/bin/ffmpeg',
      'ffmpeg',
    ]);
  });

  it('searches Linux in a deliberate order', () => {
    expect(candidatePaths('ffprobe', 'linux', {})).toEqual([
      '/usr/local/bin/ffprobe',
      '/usr/bin/ffprobe',
      '/bin/ffprobe',
      '/snap/bin/ffprobe',
      'ffprobe',
    ]);
  });

  it('adds the extension and uses backslashes on Windows', () => {
    expect(candidatePaths('ffmpeg', 'win32', {})).toEqual([
      'C:\\ffmpeg\\bin\\ffmpeg.exe',
      'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
      'ffmpeg.exe',
    ]);
  });

  it('falls back to PATH alone on an unknown platform', () => {
    expect(candidatePaths('ffmpeg', 'sunos', {})).toEqual(['ffmpeg']);
  });
});

describe('installHint', () => {
  it('gives one command per platform', () => {
    expect(installHint('darwin')).toBe('brew install ffmpeg');
    expect(installHint('win32')).toBe('winget install Gyan.FFmpeg');
    expect(installHint('linux')).toBe('sudo apt install ffmpeg');
  });

  it('points at the download page when the platform is unknown', () => {
    expect(installHint('sunos')).toContain('https://ffmpeg.org/download.html');
  });
});

describe('missingMessage', () => {
  it('reads as a singular when one tool is missing', () => {
    const message = missingMessage(['ffprobe'], 'darwin');
    expect(message).toContain('ffprobe is not installed');
    expect(message).toContain('needs it to encode');
    expect(message).not.toContain('are not installed');
  });

  it('names both when both are missing', () => {
    const message = missingMessage(['ffmpeg', 'ffprobe'], 'darwin');
    expect(message).toContain('ffmpeg and ffprobe are not installed');
    expect(message).toContain('needs them to encode');
  });

  it('carries the install command and the retry', () => {
    const message = missingMessage(['ffmpeg'], 'linux');
    expect(message).toContain('sudo apt install ffmpeg');
    // The reader must be told the fix is to run it again, not that the
    // application is now broken.
    expect(message).toContain('try again');
    expect(message).toContain('FFMPEG');
  });
});

describe('findTool', () => {
  it('accepts a command that runs, and reports what it printed', async () => {
    // `echo` echoes its arguments, so the captured version proves the tool was
    // asked for `-version` and that its output was actually read.
    const found = await findTool('ffmpeg', 'sunos', { FFMPEG: 'echo' });
    expect(found?.path).toBe('echo');
    expect(found?.name).toBe('ffmpeg');
    expect(found?.version).toBe('-version');
  });

  it('rejects a path that does not exist', async () => {
    const found = await findTool('ffmpeg', 'sunos', {
      FFMPEG: '/nonexistent/definitely/not/here',
    });
    expect(found).toBeUndefined();
  });

  it('rejects a command that exists but exits non-zero', async () => {
    // `false` runs, and fails. A stat would have accepted it.
    const found = await findTool('ffmpeg', 'sunos', { FFMPEG: 'false' });
    expect(found).toBeUndefined();
  });

  it('gives up on a command that never exits', async () => {
    const found = await findTool('ffmpeg', 'sunos', { FFMPEG: 'sleep' }, 200);
    expect(found).toBeUndefined();
  });

  it('settles when the spawn itself throws', async () => {
    // A null byte makes `spawn` throw synchronously rather than emit `error`.
    // Without the catch, this call would never settle and the search would
    // hang instead of moving to the next candidate.
    const found = await findTool('ffmpeg', 'sunos', { FFMPEG: '\0bad' }, 200);
    expect(found).toBeUndefined();
  });
});

describe('detectFfmpeg', () => {
  it('reports both tools as missing, with a hint', async () => {
    const status = await detectFfmpeg('darwin', {
      FFMPEG: '/nonexistent/ffmpeg',
      FFPROBE: '/nonexistent/ffprobe',
    });
    expect(status.state).toBe('missing');
    if (status.state !== 'missing') throw new Error('unreachable');
    expect(status.missing).toEqual(['ffmpeg', 'ffprobe']);
    expect(status.hint).toContain('brew install ffmpeg');
  });

  it('reports the one that is missing when the other is present', async () => {
    const status = await detectFfmpeg('sunos', {
      FFMPEG: 'echo',
      FFPROBE: '/nonexistent/ffprobe',
    });
    expect(status.state).toBe('missing');
    if (status.state !== 'missing') throw new Error('unreachable');
    expect(status.missing).toEqual(['ffprobe']);
  });

  it('is ready when both answer', async () => {
    const status = await detectFfmpeg('sunos', { FFMPEG: 'echo', FFPROBE: 'echo' });
    expect(status.state).toBe('ready');
    if (status.state !== 'ready') throw new Error('unreachable');
    expect(status.tools.map((tool) => tool.name)).toEqual(['ffmpeg', 'ffprobe']);
  });
});

/**
 * `requireFfmpeg` reads the real environment, because that is its whole job.
 * Restore whatever was there, or a later test inherits the override.
 */
describe('requireFfmpeg', () => {
  const original = { ffmpeg: process.env['FFMPEG'], ffprobe: process.env['FFPROBE'] };

  afterEach(() => {
    if (original.ffmpeg === undefined) delete process.env['FFMPEG'];
    else process.env['FFMPEG'] = original.ffmpeg;
    if (original.ffprobe === undefined) delete process.env['FFPROBE'];
    else process.env['FFPROBE'] = original.ffprobe;
  });

  it('returns a path for each tool', async () => {
    process.env['FFMPEG'] = 'echo';
    process.env['FFPROBE'] = 'echo';
    await expect(requireFfmpeg()).resolves.toEqual({ ffmpeg: 'echo', ffprobe: 'echo' });
  });

  it('throws the install guidance when a tool is absent', async () => {
    process.env['FFMPEG'] = '/nonexistent/ffmpeg';
    process.env['FFPROBE'] = 'echo';
    // The thrown text is what a blocked reader sees, so assert its substance:
    // what is missing, and that running it again is the fix.
    await expect(requireFfmpeg()).rejects.toThrow(/ffmpeg is not installed/);
    await expect(requireFfmpeg()).rejects.toThrow(/try again/);
  });
});
