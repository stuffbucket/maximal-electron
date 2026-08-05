import { Component, FileText, Play, SquareTerminal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';

import type { AppVersions, UpdateStatus, ViewId } from '../shared/ipc.js';

import { Canvas } from './components/Canvas.js';
import { Card, EmptyState, Row, Toolbar, type ViewMode } from './components/Controls.js';
import { Inspector } from './components/Inspector.js';
import { LeftNav } from './components/LeftNav.js';
import { ShellLayout } from './components/ShellLayout.js';
import { TerminalTabs } from './components/TerminalTabs.js';
import type { Tab } from './components/TabBar.js';
import { bridge, useBridgeEvent, usePreferences } from './lib/bridge.js';
import { VIEW_LABELS, itemsFor, type Item } from './lib/data.js';
import { useShellTabs } from './lib/useShellTabs.js';
import { useThemePreference } from './lib/useThemePreference.js';

/**
 * The application shell.
 *
 * `ShellLayout` owns the three panels and their collapse. This component owns
 * everything the shell cannot know: what a tab is, what an item looks like, and
 * which navigation entry is current.
 */

/** A tab in this application. `kind` is ours, not the tab strip's. */
interface ShellTab extends Tab {
  kind: 'library' | 'terminal';
}

const KIND_ICONS: Record<Item['kind'], ComponentType<{ size?: number }>> = {
  file: FileText,
  component: Component,
  prototype: Play,
};

function icon(item: Item, size = 28) {
  const Icon = KIND_ICONS[item.kind];
  return <Icon size={size} />;
}

/** The `+` button opens a terminal, numbered from the terminals already open. */
function newTerminal(existing: ShellTab[]): ShellTab {
  const count = existing.filter((tab) => tab.kind === 'terminal').length + 1;
  return {
    id: `term-${String(count)}`,
    title: `Terminal ${String(count)}`,
    kind: 'terminal',
  };
}

export function App() {
  const [view, setView] = useState<ViewId>('library');
  const [mode, setMode] = useState<ViewMode>('grid');
  const [selectedId, setSelectedId] = useState<string>();
  const [versions, setVersions] = useState<AppVersions>();
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'idle' });
  const [prefs, setPrefs] = usePreferences();

  const { tabs, setTabs, activeTab, setActiveTab, openTab, closeTab } = useShellTabs(
    [{ id: 'tab-1', title: 'Library', kind: 'library' }] as ShellTab[],
    newTerminal,
  );

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
      tabsLabel="Open documents"
      newTabLabel="New terminal tab"
      tabIcon={(tab) => (tab.kind === 'terminal' ? SquareTerminal : undefined)}
      status={<span>{selected ? selected.name : 'No selection'}</span>}
      left={(collapsed) => (
        <LeftNav view={view} collapsed={collapsed} onSelect={goToView} />
      )}
      main={
        current?.kind === 'terminal' ? (
          <TerminalTabs
            ids={tabs.filter((tab) => tab.kind === 'terminal').map((tab) => tab.id)}
            activeId={activeTab}
          />
        ) : (
          <>
            <Toolbar title={VIEW_LABELS[view]} mode={mode} onModeChange={setMode} />
            <Canvas
              items={items}
              mode={mode}
              selectedId={selectedId}
              empty={<EmptyState icon={FileText} message="Nothing here yet." />}
              renderCard={(item, isSelected) => (
                <Card selected={isSelected} onSelect={() => setSelectedId(item.id)}>
                  <span className="card__thumb">{icon(item)}</span>
                  <span className="card__meta">
                    <span className="card__name">{item.name}</span>
                    <span className="card__sub">Edited {item.updated}</span>
                  </span>
                </Card>
              )}
              renderRow={(item, isSelected) => (
                <Row selected={isSelected} onSelect={() => setSelectedId(item.id)}>
                  {icon(item, 14)}
                  <span className="row__name">{item.name}</span>
                  <span className="row__sub">{item.author}</span>
                  <span className="row__sub">{item.updated}</span>
                  <span className="row__sub">{item.size}</span>
                </Row>
              )}
            />
          </>
        )
      }
      right={(collapse) => (
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
