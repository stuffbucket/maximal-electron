import { type ComponentType } from 'react';
/**
 * One tab. What it tabs is the caller's business.
 *
 * This carried a `kind` of `library | terminal | run` and a `state` union
 * copied by hand from the capture fixture's `RunStatus`. Neither belonged to a
 * tab strip: `kind` only ever selected an icon, and `run` was a concept from a
 * fixture that the product had no idea about.
 */
export interface Tab {
    id: string;
    title: string;
    /** Optional status dot. The stylesheet colours the ones it knows. */
    status?: string;
}
/**
 * Everything needed to drive a tab strip.
 *
 * Declared once because three components in a row forward it: `ShellLayout`
 * takes it, hands it to `TitleBar`, which hands it to `TabBar`.
 */
export interface TabStripProps<T extends Tab> {
    /** Stable namespace shared by the triggers and the consumer's tabpanels. */
    tabIdBase: string;
    tabs: T[];
    activeTab: string;
    onSelectTab: (id: string) => void;
    onCloseTab?: (id: string) => void;
    onNewTab?: () => void;
    /** Only one tab strip on a page can be the primary one. */
    tabsLabel?: string;
    newTabLabel?: string;
    /** Optional leading icon per tab. */
    tabIcon?: (tab: T) => ComponentType<{
        size?: number;
    }> | undefined;
}
/** The ID applied to a tab trigger for a consumer-rendered panel. */
export declare function getTabTriggerId(tabIdBase: string, tabId: string): string;
/** The ID applied to the panel controlled by a tab trigger. */
export declare function getTabPanelId(tabIdBase: string, tabId: string): string;
export declare function TabBar<T extends Tab>({ tabIdBase, tabs, active, onSelect, onClose, onNew, icon, label, newLabel, }: {
    tabIdBase: string;
    tabs: T[];
    active: string;
    onSelect: (id: string) => void;
    onClose?: (id: string) => void;
    onNew?: () => void;
    /** Optional leading icon per tab. */
    icon?: (tab: T) => ComponentType<{
        size?: number;
    }> | undefined;
    label?: string;
    newLabel?: string;
}): import("react").JSX.Element;
