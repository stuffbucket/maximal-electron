export { Canvas, type CanvasViewMode } from './components/Canvas.js';
export {
  NavRail,
  type NavRailEntry,
  type NavRailSection,
} from './components/NavRail.js';
export {
  ShellLayout,
  type PanelSize,
  type PanelToggleSubscription,
  type ShellPanel,
} from './components/ShellLayout.js';
export {
  getTabPanelId,
  getTabTriggerId,
  TabBar,
  type Tab,
  type TabStripProps,
} from './components/TabBar.js';
export {
  TerminalTabs,
  type TerminalTabsProps,
} from './components/TerminalTabs.js';
export {
  TerminalView,
  type TerminalHost,
  type TerminalViewProps,
} from './components/TerminalView.js';
export { TitleBar } from './components/TitleBar.js';
export { detachedSessions } from './lib/terminal-sessions.js';
export {
  readTerminalTheme,
  SHELL_TERMINAL_PROPERTIES,
  type DetachableTerminalTransport,
  type TerminalDescriptor,
  type TerminalDisposition,
  type TerminalEvent,
  type TerminalSession,
  type TerminalTransport,
} from './lib/terminal-transport.js';
export { IconButton } from './components/controls/Button.js';
