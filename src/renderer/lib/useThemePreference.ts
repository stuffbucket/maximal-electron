import { useEffect } from 'react';

import type { Preferences } from '../../shared/ipc.js';

/**
 * Applies the theme preference to the document.
 *
 * `system` removes the attribute rather than setting a third value, so the
 * stylesheet's own `prefers-color-scheme` query decides. Any shell that reads
 * preferences needs this, and there is exactly one correct way to write it.
 */
export function useThemePreference(prefs: Preferences | undefined): void {
  useEffect(() => {
    if (!prefs) return;
    const root = document.documentElement;
    if (prefs.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', prefs.theme);
  }, [prefs]);
}
