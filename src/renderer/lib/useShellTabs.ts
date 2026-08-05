import { useCallback, useState } from 'react';

import type { DocumentTab } from '../components/TabBar.js';

/**
 * The document tab strip's state.
 *
 * Opening and closing a tab are the same two operations in every shell built on
 * `ShellLayout`, and both have a rule that is not obvious from the call site:
 * opening numbers the new terminal from the count of existing ones, and closing
 * the last tab is refused rather than leaving an empty document area.
 *
 * `setTabs` and `setActiveTab` stay exposed because what a tab *means* is the
 * caller's: the application renames the active library tab when the view
 * changes, and the capture fixture selects a run when its tab is activated.
 */
export function useShellTabs(initial: DocumentTab[]) {
  const [tabs, setTabs] = useState<DocumentTab[]>(initial);
  const [activeTab, setActiveTab] = useState(initial[0]?.id ?? '');

  /** Opens a terminal. Terminal tabs are the working surface. */
  const openTab = useCallback(() => {
    setTabs((prev) => {
      const count = prev.filter((tab) => tab.kind === 'terminal').length + 1;
      const id = `term-${String(count)}`;
      setActiveTab(id);
      return [...prev, { id, title: `Terminal ${String(count)}`, kind: 'terminal' }];
    });
  }, []);

  const closeTab = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const next = prev.filter((tab) => tab.id !== id);
        if (next.length === 0) return prev;
        const last = next[next.length - 1];
        if (id === activeTab && last) setActiveTab(last.id);
        return next;
      });
    },
    [activeTab],
  );

  return { tabs, setTabs, activeTab, setActiveTab, openTab, closeTab };
}
