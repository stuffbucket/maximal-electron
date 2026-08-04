import type { UpdateStatus } from '../../shared/ipc.js';

/**
 * Update checking.
 *
 * This build ships no update channel, and that is a deliberate, documented
 * position rather than an oversight:
 *
 * - Windows installs from a WiX MSI, which carries no update feed.
 * - macOS installs from a dmg produced by `stuffbucket/macos-runner`. That
 *   builder can emit an updater artifact, but it is a Tauri `.app.tar.gz` with
 *   an Ed25519 signature. Squirrel.Mac reads a `.zip`, so Electron cannot
 *   consume it without a custom updater.
 *
 * See `docs/release.md` for the exact builder change that would unblock this.
 * The IPC channel and the menu item exist now so a fork only has to replace
 * the body of `checkForUpdates`.
 */

const REASON =
  'This build installs from an MSI or a dmg. Neither carries an update feed. ' +
  'See docs/release.md.';

let last: UpdateStatus = { state: 'idle' };

export async function checkForUpdates(): Promise<UpdateStatus> {
  last = { state: 'checking' };

  // A fork replaces this body. The shape of the return value is already the
  // one the renderer and the menu understand.
  last = { state: 'unsupported', reason: REASON };

  // Keep the signature async so a real implementation needs no call-site
  // changes.
  await Promise.resolve();
  return last;
}
