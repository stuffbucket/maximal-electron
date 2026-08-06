import { describe, expect, it } from 'vitest';

import {
  defaultCacheRoot,
  inspectCache,
  parseDownload,
  resolveCacheRoot,
} from '../scripts/electron-cache.mjs';

/**
 * Where Electron's download lands, and what the cache root is allowed to hold.
 *
 * The path is asserted against `env-paths`, which is what `@electron/get` falls
 * back to, because the composite action caches whatever this returns. The
 * matching decides whether the job that was supposed to download Electron did.
 * A job that never resolves it caches an empty directory and reports a hit
 * forever, which is the shape of every check this repository has shipped with
 * an empty scope.
 */

describe('defaultCacheRoot', () => {
  it('is under Library/Caches on macOS', () => {
    expect(defaultCacheRoot({ platform: 'darwin', home: '/Users/x', env: {} })).toBe(
      '/Users/x/Library/Caches/electron',
    );
  });

  it('is a Cache folder under LOCALAPPDATA on Windows', () => {
    // A value the home-directory fallback cannot also produce, or the
    // assertion passes without ever reading the variable.
    expect(
      defaultCacheRoot({
        platform: 'win32',
        home: 'C:\\Users\\x',
        env: { LOCALAPPDATA: 'D:\\local' },
      }),
    ).toBe('D:\\local\\electron\\Cache');
  });

  it('falls back to AppData/Local when Windows does not say', () => {
    expect(defaultCacheRoot({ platform: 'win32', home: 'C:\\Users\\x', env: {} })).toBe(
      'C:\\Users\\x\\AppData\\Local\\electron\\Cache',
    );
  });

  it('follows the XDG rules everywhere else', () => {
    expect(defaultCacheRoot({ platform: 'linux', home: '/home/x', env: {} })).toBe(
      '/home/x/.cache/electron',
    );
    expect(
      defaultCacheRoot({ platform: 'linux', home: '/home/x', env: { XDG_CACHE_HOME: '/tmp/c' } }),
    ).toBe('/tmp/c/electron');
  });
});

describe('resolveCacheRoot', () => {
  it('takes electron_config_cache, because install.js does', () => {
    expect(
      resolveCacheRoot({
        platform: 'linux',
        home: '/home/x',
        env: { electron_config_cache: '/pinned' },
      }),
    ).toBe('/pinned');
  });

  it('ignores the variable when it is empty, rather than caching the working directory', () => {
    expect(
      resolveCacheRoot({ platform: 'linux', home: '/home/x', env: { electron_config_cache: '' } }),
    ).toBe('/home/x/.cache/electron');
  });

  it('falls back to the default when nothing pins it', () => {
    expect(resolveCacheRoot({ platform: 'darwin', home: '/Users/x', env: {} })).toBe(
      '/Users/x/Library/Caches/electron',
    );
  });
});

describe('parseDownload', () => {
  it('reads the version, the platform, and the arch off the name', () => {
    expect(parseDownload('electron-v43.2.0-darwin-arm64.zip')).toEqual({
      version: '43.2.0',
      platform: 'darwin',
      arch: 'arm64',
    });
  });

  it('keeps a prerelease version whole, dashes and all', () => {
    // The version is what is left after platform and arch come off the end,
    // so a name with four dashes is still one version and two fields.
    expect(parseDownload('electron-v44.0.0-alpha.1-win32-x64.zip')).toEqual({
      version: '44.0.0-alpha.1',
      platform: 'win32',
      arch: 'x64',
    });
  });

  it('reads a linux name', () => {
    expect(parseDownload('electron-v43.2.0-linux-x64.zip')).toEqual({
      version: '43.2.0',
      platform: 'linux',
      arch: 'x64',
    });
  });

  it('refuses a name that is not an Electron download', () => {
    expect(parseDownload('SHASUMS256.txt')).toBeUndefined();
    expect(parseDownload('chromedriver-v43.2.0-darwin-arm64.zip')).toBeUndefined();
    expect(parseDownload('electron-v43.2.0-darwin-arm64.zip.part')).toBeUndefined();
    expect(parseDownload('electron-v43.2.0-darwin-arm64')).toBeUndefined();
  });

  it('refuses a name with no platform and arch to take off the end', () => {
    expect(parseDownload('electron-v43.2.0-darwin.zip')).toBeUndefined();
    expect(parseDownload('electron-v43.2.0.zip')).toBeUndefined();
  });
});

describe('inspectCache', () => {
  const wanted = { version: '43.2.0', platform: 'darwin', arch: 'arm64' };

  it('finds the download the runner needs', () => {
    const result = inspectCache({
      names: ['electron-v43.2.0-darwin-arm64.zip'],
      ...wanted,
    });
    expect(result.downloads).toHaveLength(1);
    expect(result.stale).toEqual([]);
    expect(result.wanted).toEqual([
      { version: '43.2.0', platform: 'darwin', arch: 'arm64' },
    ]);
  });

  it('reports an empty root as no downloads rather than as a match', () => {
    const result = inspectCache({ names: [], ...wanted });
    expect(result.downloads).toEqual([]);
    expect(result.wanted).toEqual([]);
    expect(result.stale).toEqual([]);
  });

  it('drops the files that are not downloads', () => {
    const result = inspectCache({
      names: ['SHASUMS256.txt', 'electron-v43.2.0-darwin-arm64.zip'],
      ...wanted,
    });
    expect(result.downloads).toHaveLength(1);
  });

  it('calls another version stale, which is what a key missing the version lets in', () => {
    const result = inspectCache({
      names: ['electron-v39.2.4-darwin-arm64.zip', 'electron-v43.2.0-darwin-arm64.zip'],
      ...wanted,
    });
    expect(result.stale).toEqual([{ version: '39.2.4', platform: 'darwin', arch: 'arm64' }]);
    expect(result.wanted).toHaveLength(1);
  });

  it('does not match another platform or another arch at the same version', () => {
    const result = inspectCache({
      names: [
        'electron-v43.2.0-linux-x64.zip',
        'electron-v43.2.0-darwin-x64.zip',
        'electron-v43.2.0-linux-arm64.zip',
      ],
      ...wanted,
    });
    expect(result.downloads).toHaveLength(3);
    expect(result.stale).toEqual([]);
    expect(result.wanted).toEqual([]);
  });
});
