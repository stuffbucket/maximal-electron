import { useCallback, useState, useMemo } from 'react';

import { Toolbar, type ViewMode } from '../../../src/renderer/components/Controls.js';
import { ShellLayout } from '../../../src/renderer/components/ShellLayout.js';
import { type DocumentTab } from '../../../src/renderer/components/TabBar.js';
import { TerminalTabs } from '../../../src/renderer/components/TerminalTabs.js';
import { usePreferences } from '../../../src/renderer/lib/bridge.js';
import {
  DEFAULT_VIEW,
  runsFor,
  viewLabel,
  type DemoViewId,
} from './views.js';
import { RUNS } from './runs.js';
import { useShellTabs } from '../../../src/renderer/lib/useShellTabs.js';
import { useThemePreference } from '../../../src/renderer/lib/useThemePreference.js';

import { AgentNav } from './AgentNav.js';
import { RunCanvas } from './RunCanvas.js';
import { RunInspector } from './RunInspector.js';

/**
 * The demo shell: the same three panels, orchestrating a fleet of agents.
 *
 * `src/renderer/main.tsx` mounts this instead of `App` when the window was
 * loaded with `?demo=1`. It is a separate tree on purpose. The production
 * `App` keeps its own data path untouched, and this one is free to be a
 * screenshot fixture.
 *
 * The chrome is shared, and shared by import rather than by copy: `ShellLayout`
 * is the same three-panel frame the application uses, and `TitleBar`,
 * `TerminalTabs`, `NavRail`, `Controls`, and every class name in `shell.css`
 * come from the real shell. That makes this the first consumer of those
 * primitives, which is the same relationship a dependent project will have.
 */

/** Concurrent agent sessions, as they would sit in the tab strip. */
const SESSION_TABS: DocumentTab[] = [
  { id: 'run-101', title: 'refactor auth', kind: 'run', state: 'running' },
  { id: 'run-102', title: 'flaky test triage', kind: 'run', state: 'blocked' },
  { id: 'run-103', title: 'bump deps', kind: 'run', state: 'running' },
];

/**
 * A deterministic, impersonal shell for the demo terminal.
 *
 * The login shell would drag the developer's prompt, plugins, and username into
 * a published screenshot.
 */
const DEMO_SHELL = navigator.userAgent.includes('Windows')
  ? undefined
  : '/bin/sh';

export function DemoApp() {
  const [view, setView] = useState<DemoViewId>(DEFAULT_VIEW);
  /*
   * A fleet opens as a queue, not as a wall of cards.
   *
   * The grid fits seven of seventeen runs, and an operator watching agents
   * wants to see all of them and what each is waiting on. The list does that
   * in one screen. The grid is still a click away, and the production shell
   * still opens on the grid, because documents are things you recognise by
   * sight and runs are things you read.
   */
  const [mode, setMode] = useState<ViewMode>('list');
  const [selectedId, setSelectedId] = useState<string>();
  const [prefs] = usePreferences();

  const { tabs, activeTab, setActiveTab, openTab, closeTab } =
    useShellTabs(SESSION_TABS);

  const runs = useMemo(() => runsFor(view), [view]);
  const selected = RUNS.find((run) => run.id === selectedId);
  const current = tabs.find((tab) => tab.id === activeTab);

  useThemePreference(prefs);

  /** Activating a session tab selects the run it is following. */
  const selectTab = useCallback(
    (id: string) => {
      setActiveTab(id);
      if (RUNS.some((run) => run.id === id)) setSelectedId(id);
    },
    [setActiveTab],
  );

  return (
    <ShellLayout
      layoutId="stuffbucket-demo"
      tabs={tabs}
      activeTab={activeTab}
      onSelectTab={selectTab}
      onCloseTab={closeTab}
      onNewTab={openTab}
      inspectorSize="24"
      status={<span>{selected ? selected.branch : 'No run selected'}</span>}
      nav={(collapsed) => (
        <AgentNav view={view} collapsed={collapsed} onSelect={setView} />
      )}
      main={
        current?.kind === 'terminal' ? (
          <TerminalTabs tabs={tabs} activeTab={activeTab} shell={DEMO_SHELL} />
        ) : (
          <>
            <Toolbar title={viewLabel(view)} mode={mode} onModeChange={setMode} />
            <RunCanvas
              runs={runs}
              mode={mode}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </>
        )
      }
      inspector={(collapse) => (
        <RunInspector
          run={selected}
          onCollapse={collapse}
          onSelect={setSelectedId}
        />
      )}
    />
  );
}
