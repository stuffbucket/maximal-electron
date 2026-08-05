import { describe, expect, it } from 'vitest';

import {
  APP_ICON,
  TRAY_ICON,
  TRAY_TEMPLATE_ICON,
  iconDirectory,
} from '../src/main/native/icons.js';

const source = {
  packaged: false,
  resourcesPath: '/Applications/Stuffbucket.app/Contents/Resources',
  sourceDir: '/checkout/build/icons',
};

describe('iconDirectory', () => {
  it('reads a checkout from the source directory', () => {
    expect(iconDirectory(source)).toBe('/checkout/build/icons');
  });

  it('reads a packaged application from beside the asar', () => {
    expect(iconDirectory({ ...source, packaged: true })).toBe(
      '/Applications/Stuffbucket.app/Contents/Resources',
    );
  });

  it('prefers the override in a checkout', () => {
    expect(iconDirectory({ ...source, override: '/brand/icons' })).toBe(
      '/brand/icons',
    );
  });

  it('prefers the override in a packaged application', () => {
    expect(
      iconDirectory({ ...source, packaged: true, override: '/brand/icons' }),
    ).toBe('/brand/icons');
  });

  it('ignores an override set to an empty string', () => {
    // An unset environment variable reads as undefined, but a shell that
    // exports it empty must not send the lookup to the process working
    // directory.
    expect(iconDirectory({ ...source, override: '' })).toBe('/checkout/build/icons');
  });
});

describe('icon names', () => {
  it('names the files the generator writes', () => {
    expect([APP_ICON, TRAY_ICON, TRAY_TEMPLATE_ICON]).toEqual([
      'icon.png',
      'tray.png',
      'trayTemplate.png',
    ]);
  });
});
