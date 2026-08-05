import type { ITheme } from 'ghostty-web';

import type { TerminalTransport } from '../lib/terminal-transport.js';
import { TerminalView } from './TerminalView.js';

/**
 * Every open terminal, with the inactive ones hidden.
 *
 * Hidden rather than unmounted, because a remount kills the shell and loses the
 * scrollback with it. That rule is easy to state and easy to lose in a refactor,
 * so it lives in one component instead of being repeated by every shell that
 * hosts a terminal.
 */
export function TerminalTabs({
  ids,
  activeId,
  shell,
  transport,
  theme,
}: {
  /** Which sessions are open. Which tabs those are is the caller's taxonomy. */
  ids: string[];
  activeId: string;
  /** Overrides the login shell. A capture fixture passes an impersonal one. */
  shell?: string;
  transport: TerminalTransport;
  theme?: ITheme;
}) {
  return (
    <>
      {ids.map((id) => (
        <div key={id} className="terminal-host" hidden={id !== activeId}>
          <TerminalView id={id} shell={shell} transport={transport} theme={theme} />
        </div>
      ))}
    </>
  );
}
