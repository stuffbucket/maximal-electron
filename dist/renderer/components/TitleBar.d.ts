import type { ReactNode } from 'react';
import { type Tab, type TabStripProps } from './TabBar.js';
/**
 * A draggable title bar that hosts document tabs and caller-owned controls.
 *
 * The leading and actions slots deliberately know nothing about Electron IPC or
 * product features. Their wrappers opt every injected control out of the drag
 * region, including links and custom interactive elements.
 */
export declare function TitleBar<T extends Tab>({ leading, actions, tabIdBase, tabs, activeTab, onSelectTab, onCloseTab, onNewTab, tabsLabel, newTabLabel, tabIcon, }: {
    leading?: ReactNode;
    actions?: ReactNode;
} & TabStripProps<T>): import("react").JSX.Element;
