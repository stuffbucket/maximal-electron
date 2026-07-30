import * as Tooltip from '@radix-ui/react-tooltip';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
  usePanelRef,
} from 'react-resizable-panels';

import type { AppVersions, UpdateStatus, ViewId } from '../shared/ipc.js';

import { Canvas, Toolbar, type ViewMode } from './components/Canvas.js';
import { Inspector } from './components/Inspector.js';
import { LeftNav } from './components/LeftNav.js';
import { type DocumentTab } from './components/TabBar.js';
import { TerminalView } from './components/TerminalView.js';
import { TitleBar } from './components/TitleBar.js';
import { bridge, useBridgeEvent, usePreferences } from './lib/bridge.js';
import { VIEW_LABELS, itemsFor } from './lib/data.js';

/**
 * The application shell.
 *
 * A Figma-style three-panel layout, driven by `react-resizable-panels` v4: a
 * collapsible left navigation, a tabbed document area, and a collapsible right
 * inspector. The panel library owns width and collapse; this component owns
 * view state.
 *
 * `useDefaultLayout` persists panel sizes to `localStorage`, so a reload
 * restores the user's layout with no storage code here.
 */
export function App() {
  const [view, setView] = useState<ViewId>('library');
  const [mode, setMode] = useState<ViewMode>('grid');
  const [selectedId, setSelectedId] = useState<string>();
  const [versions, setVersions] = useState<AppVersions>();
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'idle' });
  const [prefs, setPrefs] = usePreferences();

  const [tabs, setTabs] = useState<DocumentTab[]>([
    { id: 'tab-1', title: 'Library', kind: 'library' },
  ]);
  const [activeTab, setActiveTab] = useState('tab-1');

  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  const leftPanel = usePanelRef();
  const rightPanel = usePanelRef();

  const layout = useDefaultLayout({
    id: 'stuffbucket-shell',
    panelIds: ['left', 'main', 'right'],
  });

  const items = useMemo(() => itemsFor(view), [view]);
  const selected = items.find((item) => item.id === selectedId);
  const current = tabs.find((tab) => tab.id === activeTab);

  /* ------------------------------------------------------------- effects */

  useEffect(() => {
    void bridge.invoke('app:versions').then(setVersions);
  }, []);

  // Keep the dock badge in step with the current view. This is the "dock icon
  // that coordinates" behaviour, driven by real application state.
  useEffect(() => {
    void bridge.invoke('dock:set-badge', { count: items.length });
  }, [items.length]);

  // The theme preference selects the token set.
  useEffect(() => {
    if (!prefs) return;
    const root = document.documentElement;
    if (prefs.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', prefs.theme);
  }, [prefs]);

  /* -------------------------------------------------------------- panels */

  const togglePanel = useCallback(
    (panel: 'left' | 'right') => {
      const handle = panel === 'left' ? leftPanel.current : rightPanel.current;
      if (!handle) return;
      if (handle.isCollapsed()) handle.expand();
      else handle.collapse();
    },
    [leftPanel, rightPanel],
  );

  /* ------------------------------------------------------- view switching */

  const goToView = useCallback(
    (next: ViewId) => {
      setView(next);
      setSelectedId(undefined);
      setTabs((prev) =>
        prev.map((tab) =>
          // Only a library tab tracks the current view. Renaming a terminal
          // tab here would relabel a running shell as "Trash".
          tab.id === activeTab && tab.kind === 'library'
            ? { ...tab, title: VIEW_LABELS[next] }
            : tab,
        ),
      );
    },
    [activeTab],
  );

  /* -------------------------------------------------------------- events */

  useBridgeEvent('menu:navigate', ({ view: next }) => goToView(next));
  useBridgeEvent('menu:toggle-panel', ({ panel }) => togglePanel(panel));
  useBridgeEvent('update:status', setUpdateStatus);

  /* ---------------------------------------------------------------- tabs */

  /**
   * The `+` button opens a terminal. Terminal tabs are the working surface;
   * the library tab is the file browser they were opened from.
   */
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

  const checkUpdates = useCallback(() => {
    setUpdateStatus({ state: 'checking' });
    void bridge.invoke('update:check').then(setUpdateStatus);
  }, []);

  /* -------------------------------------------------------------- render */

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
          onSelectTab={setActiveTab}
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
            <LeftNav view={view} collapsed={leftCollapsed} onSelect={goToView} />
          </Panel>

          <Separator className="resize-handle" />

          <Panel id="main" minSize="30" className="panel panel--canvas">
            {current?.kind === 'terminal' ? (
              // Keep every terminal mounted and hide the inactive ones. A
              // remount would kill the shell and lose scrollback.
              tabs
                .filter((tab) => tab.kind === 'terminal')
                .map((tab) => (
                  <div
                    key={tab.id}
                    className="terminal-host"
                    hidden={tab.id !== activeTab}
                  >
                    <TerminalView id={tab.id} />
                  </div>
                ))
            ) : (
              <>
                <Toolbar
                  view={view}
                  mode={mode}
                  onModeChange={setMode}
                  count={items.length}
                />
                <Canvas
                  items={items}
                  mode={mode}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              </>
            )}
            <footer className="statusbar">
              <span>{current?.kind === 'terminal' ? current.title : VIEW_LABELS[view]}</span>
              <span className="statusbar__grow" />
              <span>{selected ? selected.name : 'No selection'}</span>
            </footer>
          </Panel>

          <Separator className="resize-handle" />

          <Panel
            id="right"
            panelRef={rightPanel}
            defaultSize="22"
            minSize="16"
            maxSize="36"
            collapsible
            collapsedSize="0"
            onResize={() =>
              setRightCollapsed(rightPanel.current?.isCollapsed() ?? false)
            }
            className="panel"
          >
            <Inspector
              item={selected}
              versions={versions}
              prefs={prefs}
              onPrefChange={setPrefs}
              updateStatus={updateStatus}
              onCheckUpdates={checkUpdates}
              onCollapse={() => togglePanel('right')}
            />
          </Panel>
        </Group>
      </div>
    </Tooltip.Provider>
  );
}
