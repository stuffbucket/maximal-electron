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
import type { Tab, TabStripProps } from './TabBar.js';

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
 * The slots are named for where they are, not for what the application happens
 * to put in them. `left` and `right` are render props rather than nodes because
 * both need state this component owns: the left one needs to know it is
 * collapsed, the right one needs a way to collapse itself.
 */

/** A side panel's geometry. Sizes are strings in v4, not numbers. */
export interface PanelSize {
  default: string;
  min: string;
  max: string;
  collapsed: string;
}

const LEFT: PanelSize = { default: '18', min: '12', max: '30', collapsed: '4' };
const RIGHT: PanelSize = { default: '22', min: '16', max: '36', collapsed: '0' };

export function ShellLayout<T extends Tab>({
  layoutId,
  tabs,
  activeTab,
  onSelectTab,
  onCloseTab,
  onNewTab,
  tabsLabel,
  newTabLabel,
  tabIcon,
  left,
  main,
  right,
  status,
  leftSize = LEFT,
  rightSize = RIGHT,
}: {
  /** Namespaces the persisted panel sizes. Two shells must not share one. */
  layoutId: string;
  left: (collapsed: boolean) => ReactNode;
  main: ReactNode;
  right: (collapse: () => void) => ReactNode;
  status: ReactNode;
  leftSize?: PanelSize;
  rightSize?: PanelSize;
} & TabStripProps<T>) {
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
          tabsLabel={tabsLabel}
          newTabLabel={newTabLabel}
          tabIcon={tabIcon}
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
            defaultSize={leftSize.default}
            minSize={leftSize.min}
            maxSize={leftSize.max}
            collapsible
            collapsedSize={leftSize.collapsed}
            onResize={() =>
              setLeftCollapsed(leftPanel.current?.isCollapsed() ?? false)
            }
            className="panel"
          >
            {left(leftCollapsed)}
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
            defaultSize={rightSize.default}
            minSize={rightSize.min}
            maxSize={rightSize.max}
            collapsible
            collapsedSize={rightSize.collapsed}
            onResize={() =>
              setRightCollapsed(rightPanel.current?.isCollapsed() ?? false)
            }
            className="panel"
          >
            {right(() => togglePanel('right'))}
          </Panel>
        </Group>
      </div>
    </Tooltip.Provider>
  );
}
