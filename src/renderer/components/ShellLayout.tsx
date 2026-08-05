import * as Tooltip from '@radix-ui/react-tooltip';
import { useCallback, useState, type ReactNode } from 'react';
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
  usePanelRef,
} from 'react-resizable-panels';

import { useBridgeEvent } from '../lib/bridge.js';

import { TitleBar } from './TitleBar.js';
import type { DocumentTab } from './TabBar.js';

/**
 * The three-panel shell.
 *
 * A collapsible left rail, a tabbed document area, and a collapsible right
 * inspector, driven by `react-resizable-panels` v4. This component owns the
 * frame: the panel geometry, which panel is collapsed, and the menu event that
 * toggles one. It owns no content.
 *
 * It exists because the frame was written twice — once for the application and
 * once for the capture fixture — and the second copy was made for the only
 * reason a copy ever gets made here: there was nothing to import. A consumer of
 * this repository wanting the same layout would have made a third.
 *
 * `nav` and `inspector` are render props rather than nodes, because both need
 * state this component owns and should not have to receive twice.
 */
export function ShellLayout({
  layoutId,
  tabs,
  activeTab,
  onSelectTab,
  onCloseTab,
  onNewTab,
  nav,
  main,
  inspector,
  status,
  inspectorSize = '22',
}: {
  /** Namespaces the persisted panel sizes. Two shells must not share one. */
  layoutId: string;
  tabs: DocumentTab[];
  activeTab: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTab: () => void;
  nav: (collapsed: boolean) => ReactNode;
  main: ReactNode;
  inspector: (collapse: () => void) => ReactNode;
  status: ReactNode;
  /** Panel sizes are strings in v4, not numbers. */
  inspectorSize?: string;
}) {
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  const leftPanel = usePanelRef();
  const rightPanel = usePanelRef();

  // Persists panel sizes to `localStorage`, so a reload restores the layout
  // with no storage code here.
  const layout = useDefaultLayout({
    id: layoutId,
    panelIds: ['left', 'main', 'right'],
  });

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
          onSelectTab={onSelectTab}
          onCloseTab={onCloseTab}
          onNewTab={onNewTab}
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
            {nav(leftCollapsed)}
          </Panel>

          <Separator className="resize-handle" />

          <Panel id="main" minSize="30" className="panel panel--canvas">
            {main}
            <footer className="statusbar">
              {status}
              <span className="statusbar__grow" />
            </footer>
          </Panel>

          <Separator className="resize-handle" />

          <Panel
            id="right"
            panelRef={rightPanel}
            defaultSize={inspectorSize}
            minSize="16"
            maxSize="36"
            collapsible
            collapsedSize="0"
            onResize={() =>
              setRightCollapsed(rightPanel.current?.isCollapsed() ?? false)
            }
            className="panel"
          >
            {inspector(() => togglePanel('right'))}
          </Panel>
        </Group>
      </div>
    </Tooltip.Provider>
  );
}
