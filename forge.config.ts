import { existsSync } from 'node:fs';
import path from 'node:path';

import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerZIP } from '@electron-forge/maker-zip';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { VitePlugin } from '@electron-forge/plugin-vite';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

/**
 * Where the application icons come from.
 *
 * `STUFFBUCKET_ICON_DIR` points at a directory of a consumer's own icons, so a
 * fork brands its build without editing this file. `src/main/native/icons.ts`
 * reads the same variable at run time, so one value covers both the bundle icon
 * and the dock icon of an unpackaged run.
 *
 * The directory must carry the names below. A missing bundle icon is silent —
 * packager logs a warning and ships the Electron default — so it is checked
 * here instead.
 */
const ICON_DIR = path.resolve(process.env['STUFFBUCKET_ICON_DIR'] ?? 'build/icons');

/**
 * Icons the main process loads at run time, rather than the bundle carrying
 * them. Copied beside `app.asar`, which is where `src/main/native/icons.ts`
 * looks. `scripts/verify-package.mjs` asserts they arrived.
 *
 * `trayTemplate@2x.png` is never named in code: `nativeImage` finds a `@2x`
 * variant beside the file it was given. It still has to ship.
 */
const RUNTIME_ICONS = [
  'icon.png',
  'tray.png',
  'trayTemplate.png',
  'trayTemplate@2x.png',
];

const BUNDLE_ICON: string =
  { darwin: 'icon.icns', win32: 'icon.ico' }[process.platform as string] ??
  'icon.png';

for (const file of [BUNDLE_ICON, ...RUNTIME_ICONS]) {
  if (!existsSync(path.join(ICON_DIR, file))) {
    throw new Error(
      `Icon directory ${ICON_DIR} has no ${file}. ` +
        'Run `npm run icons`, or point STUFFBUCKET_ICON_DIR at a complete set.',
    );
  }
}

const config: ForgeConfig = {
  packagerConfig: {
    /**
     * Native code cannot be loaded from inside an asar, so it is unpacked
     * beside it. `OnlyLoadAppFromAsar` still applies to app code.
     *
     * `*.node` alone is not enough. `node-llama-cpp` ships its llama.cpp
     * backends as `.dylib` and `.so` files next to the addon, and those are
     * `dlopen`ed at run time. Left inside the archive they fail to load, and
     * the failure looks like a model that will not start rather than a
     * packaging fault. Both native scopes are unpacked whole, because their
     * own documentation says the directory layout is load-bearing.
     */
    asar: {
      unpack: '{**/*.node,**/node_modules/@node-llama-cpp/**,**/node_modules/node-llama-cpp/**}',
    },

    /**
     * Which files reach the package.
     *
     * Forge's Vite plugin normally sets this to "keep only `/.vite`", because
     * it assumes every dependency is bundled. That assumption breaks for a
     * native module: `@lydell/node-pty` stays external (see
     * `vite.main.config.ts`), so it has to be copied in as real files.
     *
     * The plugin defers to an `ignore` set here, so this replaces its default
     * rather than fighting it. Keep it narrow: a wrong prefix silently ships
     * the whole `node_modules` tree.
     *
     * The prebuilt binaries live in platform-specific packages
     * (`@lydell/node-pty-darwin-arm64`, `@node-llama-cpp/mac-arm64-metal`),
     * which is why whole scopes are kept rather than single directories.
     */
    ignore: (file: string) => {
      if (!file) return false;
      if (file === '/package.json') return false;

      // The capture fixture is built beside the product's renderer so the
      // recording tools can drive it, and dropped here so a user never
      // installs it. `scripts/verify-package.mjs` asserts it is absent.
      if (file.startsWith('/.vite/renderer/demo_window')) return true;

      const keep = [
        '/.vite',
        '/node_modules/@lydell',
        '/node_modules/node-llama-cpp',
        '/node_modules/@node-llama-cpp',
      ];
      return !keep.some(
        (prefix) =>
          // Inside a kept path, or a directory on the way to one. Packager
          // will not descend into a directory it has been told to ignore.
          file.startsWith(prefix) || prefix.startsWith(`${file}/`),
      );
    },
    name: 'Stuffbucket',
    executableName: process.platform === 'linux' ? 'stuffbucket' : 'Stuffbucket',
    appBundleId: 'co.stuffbucket.electron',
    appCategoryType: 'public.app-category.developer-tools',
    icon: path.join(ICON_DIR, 'icon'),
    // Icons the main process loads itself. They land beside `app.asar`, in
    // `Contents/Resources` (macOS) or `resources` (Windows and Linux). Copied
    // as files rather than as their directory, so a consumer's directory can
    // be called anything.
    extraResource: RUNTIME_ICONS.map((file) => path.join(ICON_DIR, file)),
    // No osxSign and no osxNotarize. stuffbucket/macos-runner owns the entire
    // sign, package, notarize, and staple tail. See docs/signing.md.
  },
  rebuildConfig: {},
  makers: [
    // Scope every maker to its platform. An unscoped maker fails on the wrong
    // host: deb needs dpkg, rpm needs rpmbuild.
    new MakerZIP({}, ['darwin', 'linux']),
    // Configured but not released yet. Linux is deferred; see docs/release.md.
    new MakerDeb({}, ['linux']),
    new MakerRpm({}, ['linux']),
    // No Windows maker. build/windows/app.wxs plus `wix build` produce the MSI,
    // which matches the last known good installer in stuffbucket/maximal.
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/index.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload/index.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        { name: 'main_window', config: 'vite.renderer.config.ts' },
        // The capture fixture. Built alongside, excluded from the package by
        // the `ignore` predicate above. `STUFFBUCKET_SKIP_FIXTURE` drops it
        // where nothing drives it; see docs/testing.md.
        ...(process.env.STUFFBUCKET_SKIP_FIXTURE
          ? []
          : [{ name: 'demo_window', config: 'vite.demo.config.ts' }]),
      ],
    }),
    // Fuses harden the packaged binary. Changing any value here invalidates an
    // existing signature, so a change must go through a fresh signed build.
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
