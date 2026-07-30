import { PanelLeft, PanelRight, Sparkles } from 'lucide-react';

import { bridge } from '../lib/bridge.js';
import { TabBar, type DocumentTab } from './TabBar.js';
import { IconButton } from './Controls.js';

/**
 * The title bar, which also hosts the document tabs.
 *
 * Tabs live here rather than in a row of their own because that is where Figma
 * puts them: the window chrome strip is the tab strip. It also buys a row of
 * vertical space back for the canvas.
 *
 * macOS keeps its native traffic lights, so the bar reserves a gap for them.
 * Windows and Linux use `titleBarOverlay`, which draws the system controls on
 * top, so the bar keeps its right edge clear instead.
 */
export function TitleBar({
  leftCollapsed,
  rightCollapsed,
  onToggleLeft,
  onToggleRight,
  tabs,
  activeTab,
  onSelectTab,
  onCloseTab,
  onNewTab,
}: {
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  tabs: DocumentTab[];
  activeTab: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTab: () => void;
}) {
  const isMac = navigator.userAgent.includes('Mac');

  return (
    <header className="titlebar" data-testid="titlebar">
      {isMac && <span className="titlebar__spacer-mac" />}

      <IconButton
        label={leftCollapsed ? 'Show sidebar' : 'Hide sidebar'}
        onClick={onToggleLeft}
        active={!leftCollapsed}
        testId="toggle-left"
      >
        <PanelLeft size={15} />
      </IconButton>

      <TabBar
        tabs={tabs}
        active={activeTab}
        onSelect={onSelectTab}
        onClose={onCloseTab}
        onNew={onNewTab}
      />

      {/* Empty space stays draggable, so the window still moves by its bar. */}
      <span className="titlebar__grow" />

      {/* The overlay also has a global accelerator. This button exists so the
          feature is discoverable, and so a test can summon it the same way a
          user does. */}
      <IconButton
        label="Ask (summon overlay)"
        onClick={() => void bridge.invoke('overlay:toggle')}
        testId="toggle-overlay"
      >
        <Sparkles size={15} />
      </IconButton>

      <IconButton
        label={rightCollapsed ? 'Show panel' : 'Hide panel'}
        onClick={onToggleRight}
        active={!rightCollapsed}
        testId="toggle-right"
      >
        <PanelRight size={15} />
      </IconButton>

      {/* Windows and Linux reserve room for the titleBarOverlay controls. */}
      {!isMac && <span className="titlebar__spacer-win" />}
    </header>
  );
}
