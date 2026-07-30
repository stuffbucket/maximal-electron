import * as Tooltip from '@radix-ui/react-tooltip';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
  usePanelRef,
} from 'react-resizable-panels';

import { type ViewMode } from '../Canvas.js';
import { type DocumentTab } from '../TabBar.js';
import { TerminalView } from '../TerminalView.js';
import { TitleBar } from '../TitleBar.js';
import { useBridgeEvent, usePreferences } from '../../lib/bridge.js';
import {
  DEFAULT_VIEW,
  fleetSummary,
  runsFor,
  viewLabel,
  type DemoViewId,
} from '../../lib/demo.js';
import { RUNS } from '../../lib/demo-runs.js';

import { AgentNav } from './AgentNav.js';
import { RunCanvas, RunToolbar } from './RunCanvas.js';
import { RunInspector } from './RunInspector.js';

/**
 * The demo shell: the same three panels, orchestrating a fleet of agents.
 *
 * `src/renderer/main.tsx` mounts this instead of `App` when the window was
 * loaded with `?demo=1`. It is a separate tree on purpose. The production
 * `App` keeps its own data path untouched, and this one is free to be a
 * screenshot fixture.
 *
 * The chrome is shared: `TitleBar`, `TabBar`, `TerminalView`, `Controls`, and
 * every class name in `shell.css` come from the real shell.
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
  const [mode, setMode] = useState<ViewMode>('grid');
  const [selectedId, setSelectedId] = useState<string>();
  const [prefs] = usePreferences();

  const [tabs, setTabs] = useState<DocumentTab[]>(SESSION_TABS);
  const [activeTab, setActiveTab] = useState(SESSION_TABS[0]?.id ?? 'run-101');

  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  const leftPanel = usePanelRef();
  const rightPanel = usePanelRef();

  const layout = useDefaultLayout({
    id: 'stuffbucket-demo',
    panelIds: ['left', 'main', 'right'],
  });

  const runs = useMemo(() => runsFor(view), [view]);
  const selected = RUNS.find((run) => run.id === selectedId);
  const current = tabs.find((tab) => tab.id === activeTab);

  useEffect(() => {
    if (!prefs) return;
    const root = document.documentElement;
    if (prefs.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', prefs.theme);
  }, [prefs]);

  const togglePanel = useCallback(
    (panel: 'left' | 'right') => {
      const handle = panel === 'left' ? leftPanel.current : rightPanel.current;
      if (!handle) return;
      if (handle.isCollapsed()) handle.expand();
      else handle.collapse();
    },
    [leftPanel, rightPanel],
  );

  useBridgeEvent('menu:toggle-panel', ({ panel }) => togglePanel(panel));

  /** Activating a session tab selects the run it is following. */
  const selectTab = useCallback(
    (id: string) => {
      setActiveTab(id);
      if (RUNS.some((run) => run.id === id)) setSelectedId(id);
    },
    [],
  );

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

  return (
    <Tooltip.Provider delayDuration={400}>
      <div className="app">
        <TitleBar
          leftCollapsed={leftCollapsed}
          rightCollapsed={rightCollapsed}
          onToggleLeft={() => togglePanel('left')}
          onToggleRight={() => togglePanel('right')}
          tabs={tabs}
          activeTab={activeTab}
          onSelectTab={selectTab}
          onCloseTab={closeTab}
          onNewTab={openTab}
        />

        <Group
          orientation="horizontal"
          className="panels"
          defaultLayout={layout.defaultLayout}
          onLayoutChanged={layout.onLayoutChanged}
        >
          <Panel
            id="left"
            panelRef={leftPanel}
            defaultSize="18"
            minSize="12"
            maxSize="30"
            collapsible
            collapsedSize="4"
            onResize={() =>
              setLeftCollapsed(leftPanel.current?.isCollapsed() ?? false)
            }
            className="panel"
          >
            <AgentNav view={view} collapsed={leftCollapsed} onSelect={setView} />
          </Panel>

          <Separator className="resize-handle" />

          <Panel id="main" minSize="30" className="panel panel--canvas">
            {current?.kind === 'terminal' ? (
              // Same rule as the production shell: hide an inactive terminal
              // rather than unmounting it, or the shell dies with the tab.
              tabs
                .filter((tab) => tab.kind === 'terminal')
                .map((tab) => (
                  <div
                    key={tab.id}
                    className="terminal-host"
                    hidden={tab.id !== activeTab}
                  >
                    <TerminalView id={tab.id} shell={DEMO_SHELL} />
                  </div>
                ))
            ) : (
              <>
                <RunToolbar
                  title={viewLabel(view)}
                  mode={mode}
                  onModeChange={setMode}
                  count={runs.length}
                />
                <RunCanvas
                  runs={runs}
                  mode={mode}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              </>
            )}
            <footer className="statusbar">
              <span>{current?.kind === 'terminal' ? current.title : fleetSummary()}</span>
              <span className="statusbar__grow" />
              <span>{selected ? selected.branch : 'No run selected'}</span>
            </footer>
          </Panel>

          <Separator className="resize-handle" />

          <Panel
            id="right"
            panelRef={rightPanel}
            defaultSize="24"
            minSize="16"
            maxSize="36"
            collapsible
            collapsedSize="0"
            onResize={() =>
              setRightCollapsed(rightPanel.current?.isCollapsed() ?? false)
            }
            className="panel"
          >
            <RunInspector run={selected} onCollapse={() => togglePanel('right')} />
          </Panel>
        </Group>
      </div>
    </Tooltip.Provider>
  );
}
