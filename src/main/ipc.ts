import { BrowserWindow, app, ipcMain, shell } from 'electron';

import {
  IPC_CHANNELS,
  type AppVersions,
  type IpcChannel,
  type IpcEvent,
  type IpcEventPayload,
  type IpcRequest,
  type IpcResponse,
} from '../shared/ipc.js';

import { setBadgeCount, showNotification } from './native/notifications.js';
import {
  abortAgent,
  discoverProvider,
  isAgentBusy,
  resolveApproval,
  runAgent,
} from './native/agent.js';
import { ensureModel } from './native/llama.js';
import { getPreferences, setPreferences } from './native/preferences.js';
import {
  defaultShell,
  killPty,
  listPtys,
  resizePty,
  spawnPty,
  writePty,
} from './native/pty.js';
import { checkForUpdates } from './native/updates.js';
import { hideOverlay, toggleOverlay } from './windows/overlay.js';
import { isSafeExternalUrl } from '../shared/urls.js';

/** A handler for one channel. Types come from the contract, so it cannot drift. */
type IpcHandler<C extends IpcChannel> = (
  request: IpcRequest<C>,
  window: BrowserWindow | undefined,
) => IpcResponse<C> | Promise<IpcResponse<C>>;

/**
 * Every channel needs an entry. `Record` over `IpcChannel` makes a missing
 * handler a compile error, which is the guarantee this module exists to give.
 */
type IpcHandlers = { [C in IpcChannel]: IpcHandler<C> };

export function collectVersions(): AppVersions {
  return {
    app: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    v8: process.versions.v8,
    platform: process.platform,
    arch: process.arch,
    packaged: app.isPackaged,
  };
}

/**
 * Only a safe scheme may leave the application. The guard lives in
 * `src/shared/urls.ts`, free of Electron imports, so it has direct unit tests.
 */
export { isSafeExternalUrl } from '../shared/urls.js';

const handlers: IpcHandlers = {
  'app:versions': () => collectVersions(),

  'prefs:get': () => getPreferences(),
  'prefs:set': (patch) => setPreferences(patch),

  'notify:show': (request) => showNotification(request),

  'dock:set-badge': (request) => setBadgeCount(request.count),

  'update:check': () => checkForUpdates(),

  'shell:open-external': (request) => {
    if (!isSafeExternalUrl(request.url)) {
      throw new Error(`Refused to open unsafe URL: ${request.url}`);
    }
    void shell.openExternal(request.url);
  },

  'pty:spawn': (request, window) => spawnPty(window, request),
  'pty:write': (request, window) => writePty(window, request.id, request.data),
  'pty:resize': (request, window) =>
    resizePty(window, request.id, request.cols, request.rows),
  'pty:kill': (request, window) => killPty(window, request.id),
  'pty:list': (_request, window) => listPtys(window),
  'pty:default-shell': () => defaultShell(),

  'overlay:toggle': () => toggleOverlay(),

  'overlay:hide': () => hideOverlay(),

  'overlay:provider': () => discoverProvider(),

  'overlay:abort': () => abortAgent(),

  'overlay:approve': (request) => resolveApproval(request),

  'overlay:ask': (request, window) => {
    if (isAgentBusy()) {
      return { started: false, reason: 'Already working on the previous request.' };
    }

    // Deliberately not awaited. The reply says only that the run started; the
    // answer streams back as `agent:*` events, so the renderer is not blocked
    // for the length of a model call.
    void runAgent(request.prompt, {
      onDelta: (text) => sendEvent(window, 'agent:delta', { text }),
      onTool: (name, phase, isError) =>
        sendEvent(window, 'agent:tool', { name, phase, isError }),
      onApproval: (approval) => sendEvent(window, 'agent:approval', approval),
      onEnd: (result) => sendEvent(window, 'agent:end', result),
    });

    return { started: true };
  },

  'model:ensure': (_request, window) =>
    ensureModel((progress) => sendEvent(window, 'model:progress', progress)),
};

/** Register every contract channel. Call once, before the first window loads. */
export function registerIpcHandlers(): void {
  for (const channel of IPC_CHANNELS) {
    const handler = handlers[channel] as IpcHandler<IpcChannel>;
    ipcMain.handle(channel, async (event, request: IpcRequest<IpcChannel>) => {
      const window = BrowserWindow.fromWebContents(event.sender) ?? undefined;
      return handler(request, window);
    });
  }
}

/**
 * Send a typed event to a window. Using this rather than raw `webContents.send`
 * keeps main-to-renderer messages inside the contract.
 */
export function sendEvent<E extends IpcEvent>(
  window: BrowserWindow | undefined,
  event: E,
  payload: IpcEventPayload<E>,
): void {
  if (!window || window.isDestroyed()) return;
  window.webContents.send(event, payload);
}
