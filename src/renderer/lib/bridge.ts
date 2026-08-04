import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  IpcEvent,
  IpcEventPayload,
  Preferences,
  RendererApi,
} from '../../shared/ipc.js';

/**
 * Typed access to the preload bridge.
 *
 * Everything the renderer knows about the main process goes through here, so
 * there is exactly one place to stub in a test or a browser preview.
 */
export const bridge: RendererApi = window.stuffbucket;

/** Subscribe to a main-process event for the lifetime of a component. */
export function useBridgeEvent<E extends IpcEvent>(
  event: E,
  listener: (payload: IpcEventPayload<E>) => void,
): void {
  // Keep the latest listener without resubscribing on every render.
  const ref = useRef(listener);
  ref.current = listener;

  useEffect(() => {
    return bridge.on(event, (payload) => ref.current(payload));
  }, [event]);
}

/** Read preferences once, then track any change from any source. */
export function usePreferences(): [
  Preferences | undefined,
  (patch: Partial<Preferences>) => void,
] {
  const [prefs, setPrefs] = useState<Preferences>();

  useEffect(() => {
    let alive = true;
    void bridge.invoke('prefs:get').then((value) => {
      if (alive) setPrefs(value);
    });
    return () => {
      alive = false;
    };
  }, []);

  useBridgeEvent('prefs:changed', setPrefs);

  const update = useCallback((patch: Partial<Preferences>) => {
    void bridge.invoke('prefs:set', patch).then(setPrefs);
  }, []);

  return [prefs, update];
}
