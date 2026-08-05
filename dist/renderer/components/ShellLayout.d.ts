import { type ReactNode } from 'react';
import { type Tab, type TabStripProps } from './TabBar.js';
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
export type ShellPanel = 'left' | 'right';
export type PanelToggleSubscription = (listener: (panel: ShellPanel) => void) => () => void;
export declare function ShellLayout<T extends Tab>({ layoutId, tabs, activeTab, onSelectTab, onCloseTab, onNewTab, tabsLabel, newTabLabel, tabIcon, titleBarLeading, titleBarActions, subscribeToPanelToggles, top, left, main, bottom, right, status, leftSize, rightSize, bottomSize, }: {
    /** Namespaces the persisted panel sizes. Two shells must not share one. */
    layoutId: string;
    /** Caller-owned content before the sidebar toggle. */
    titleBarLeading?: ReactNode;
    /** Caller-owned actions before the inspector toggle. */
    titleBarActions?: ReactNode;
    /** Optional host event adapter, such as an Electron menu subscription. */
    subscribeToPanelToggles?: PanelToggleSubscription;
    /**
     * Full width, under the title bar and over the panels. For anything that
     * addresses the whole window rather than one panel: an offline banner, an
     * update prompt, a failed-save notice.
     */
    top?: ReactNode;
    left: (collapsed: boolean) => ReactNode;
    main: ReactNode;
    /**
     * Under `main`, in the same column, behind a draggable divider. For a
     * secondary view of what `main` shows: logs, output, a console. Absent by
     * default, and when absent the centre column is a plain panel rather than a
     * group of one.
     */
    bottom?: ReactNode;
    right: (collapse: () => void) => ReactNode;
    status: ReactNode;
    leftSize?: PanelSize;
    rightSize?: PanelSize;
    bottomSize?: PanelSize;
} & Omit<TabStripProps<T>, 'tabIdBase'>): import("react").JSX.Element;
