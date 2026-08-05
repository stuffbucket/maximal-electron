import { bridge } from './bridge.js';
import { currentTerminalTheme } from './theme.js';
import type { TerminalEvent, TerminalTransport } from './terminal-transport.js';

/**
 * This application's terminal transport, over its own IPC contract.
 *
 * The component takes a transport as a value so a consumer can supply their
 * own. This is the shell's, and it is the reference implementation: one object
 * satisfying the interface, with the channel names in one place.
 *
 * `pty:data` and `pty:exit` are per window, not per session, so every view
 * receives every event and each filters by id.
 */
export const bridgeTerminalTransport: TerminalTransport = {
  async spawn({ id, shell, cols, rows }) {
    await bridge.invoke('pty:spawn', { id, cols, rows, shell });
  },

  async write(id, data) {
    await bridge.invoke('pty:write', { id, data });
  },

  async resize(id, cols, rows) {
    await bridge.invoke('pty:resize', { id, cols, rows });
  },

  async terminate(id) {
    await bridge.invoke('pty:kill', { id });
  },

  subscribe(id, listener) {
    const onData = bridge.on('pty:data', (payload) => {
      if (payload.id === id) listener({ type: 'data', data: payload.data });
    });

    const onExit = bridge.on('pty:exit', (payload) => {
      if (payload.id === id) {
        listener({ type: 'exit', exitCode: payload.exitCode } satisfies TerminalEvent);
      }
    });

    return () => {
      onData();
      onExit();
    };
  },
};

/** The emulator theme for this application's current scheme. */
export { currentTerminalTheme };
