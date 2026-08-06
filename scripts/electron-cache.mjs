/**
 * What `@electron/get` left in the Electron download cache.
 *
 * `node_modules/electron/install.js` reads its `cacheRoot` from
 * `electron_config_cache` and, unset, falls back to `env-paths`: three
 * different directories on the three runner operating systems. CI pins the
 * root so one `actions/cache` entry covers all three, and this decides whether
 * that root holds the download the installed Electron needs.
 *
 * Kept pure, and separate from the script that reads the directory, so the
 * matching is mutation tested rather than trusted.
 */

/** The one name `@electron/get` writes: `electron-v<version>-<platform>-<arch>.zip`. */
const PREFIX = 'electron-v';
const SUFFIX = '.zip';

/** The three fields that name a download, or undefined when it is not one. */
export function parseDownload(name) {
  if (!name.startsWith(PREFIX)) return undefined;
  if (!name.endsWith(SUFFIX)) return undefined;

  // A prerelease version carries its own dashes, so platform and arch come off
  // the end and the remainder is the version.
  const parts = name.slice(PREFIX.length, -SUFFIX.length).split('-');
  if (parts.length < 3) return undefined;

  const arch = parts.pop();
  const platform = parts.pop();
  return { version: parts.join('-'), platform, arch };
}

/**
 * The downloads in a cache root, split by whether they are the one wanted.
 *
 * `stale` is what a cache key missing the Electron version would let
 * accumulate. `wanted` is empty when the pinned root was never written to,
 * which is what a misspelled `electron_config_cache` looks like from here.
 */
export function inspectCache({ names, version, platform, arch }) {
  const downloads = [];
  for (const name of names) {
    const download = parseDownload(name);
    if (download !== undefined) downloads.push(download);
  }

  return {
    downloads,
    stale: downloads.filter((download) => download.version !== version),
    wanted: downloads.filter(
      (download) =>
        download.version === version && download.platform === platform && download.arch === arch,
    ),
  };
}
