import { useCallback, useEffect, useMemo, useState } from 'react';

import type { AppVersions, UpdateStatus, ViewId } from '../shared/ipc.js';

import { Canvas } from './components/Canvas.js';
import { Toolbar, type ViewMode } from './components/Controls.js';
import { Inspector } from './components/Inspector.js';
import { LeftNav } from './components/LeftNav.js';
import { ShellLayout } from './components/ShellLayout.js';
import { TerminalTabs } from './components/TerminalTabs.js';
import { bridge, useBridgeEvent, usePreferences } from './lib/bridge.js';
import { VIEW_LABELS, itemsFor } from './lib/data.js';
import { useShellTabs } from './lib/useShellTabs.js';
import { useThemePreference } from './lib/useThemePreference.js';

/**
 * The application shell.
 *
 * `ShellLayout` owns the three panels and their collapse behaviour. This
 * component owns view state: which navigation entry is current, what the canvas
 * shows, and what the inspector is inspecting.
 */
export function App() {
  const [view, setView] = useState<ViewId>('library');
  const [mode, setMode] = useState<ViewMode>('grid');
  const [selectedId, setSelectedId] = useState<string>();
  const [versions, setVersions] = useState<AppVersions>();
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'idle' });
  const [prefs, setPrefs] = usePreferences();

  const { tabs, setTabs, activeTab, setActiveTab, openTab, closeTab } =
    useShellTabs([{ id: 'tab-1', title: 'Library', kind: 'library' }]);

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

  useThemePreference(prefs);

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
    [activeTab, setTabs],
  );

  /* -------------------------------------------------------------- events */

  useBridgeEvent('menu:navigate', ({ view: next }) => goToView(next));
  useBridgeEvent('update:status', setUpdateStatus);

  const checkUpdates = useCallback(() => {
    setUpdateStatus({ state: 'checking' });
    void bridge.invoke('update:check').then(setUpdateStatus);
  }, []);

  /* -------------------------------------------------------------- render */

  return (
    <ShellLayout
      layoutId="stuffbucket-shell"
      tabs={tabs}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      onCloseTab={closeTab}
      onNewTab={openTab}
      status={<span>{selected ? selected.name : 'No selection'}</span>}
      nav={(collapsed) => (
        <LeftNav view={view} collapsed={collapsed} onSelect={goToView} />
      )}
      main={
        current?.kind === 'terminal' ? (
          <TerminalTabs tabs={tabs} activeTab={activeTab} />
        ) : (
          <>
            <Toolbar title={VIEW_LABELS[view]} mode={mode} onModeChange={setMode} />
            <Canvas
              items={items}
              mode={mode}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </>
        )
      }
      inspector={(collapse) => (
        <Inspector
          item={selected}
          versions={versions}
          prefs={prefs}
          onPrefChange={setPrefs}
          updateStatus={updateStatus}
          onCheckUpdates={checkUpdates}
          onCollapse={collapse}
        />
      )}
    />
  );
}
