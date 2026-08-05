import { TerminalView } from './TerminalView.js';
import type { DocumentTab } from './TabBar.js';

/**
 * Every open terminal, with the inactive ones hidden.
 *
 * Hidden rather than unmounted, because a remount kills the shell and loses the
 * scrollback with it. That rule is easy to state and easy to lose in a refactor,
 * so it lives in one component instead of being repeated by every shell that
 * hosts a terminal.
 */
export function TerminalTabs({
  tabs,
  activeTab,
  shell,
}: {
  tabs: DocumentTab[];
  activeTab: string;
  /** Overrides the login shell. A capture fixture passes an impersonal one. */
  shell?: string;
}) {
  return (
    <>
      {tabs
        .filter((tab) => tab.kind === 'terminal')
        .map((tab) => (
          <div key={tab.id} className="terminal-host" hidden={tab.id !== activeTab}>
            <TerminalView id={tab.id} shell={shell} />
          </div>
        ))}
    </>
  );
}
