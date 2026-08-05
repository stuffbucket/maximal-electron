import { type ComponentType } from 'react';
/**
 * The collapsible left navigation.
 *
 * Two independent collapse behaviours, which is what Figma does:
 *
 * - The whole panel collapses to an icon rail. `collapsed` drives that, and the
 *   panel width is owned by `react-resizable-panels` in `ShellLayout`.
 * - Each section collapses on its own, through Radix `Collapsible`.
 *
 * Generic over the view id so a caller keeps its own union, rather than being
 * handed a `string` back in `onSelect`.
 */
export interface NavRailEntry<Id extends string, Status extends string = string> {
    id: Id;
    label: string;
    count: number;
    /** Drives the status dot. Absent on an entry with no lifecycle. */
    status?: Status;
}
export interface NavRailSection<Id extends string, Status extends string = string> {
    id: string;
    label: string;
    items: NavRailEntry<Id, Status>[];
}
export declare function NavRail<Id extends string, Status extends string = string>({ sections, current, onSelect, collapsed, icon, label, testId, }: {
    sections: NavRailSection<Id, Status>[];
    current: Id;
    onSelect: (id: Id) => void;
    collapsed: boolean;
    icon: (entry: NavRailEntry<Id, Status>) => ComponentType<{
        size?: number;
    }>;
    /** Only one rail on a page may be the primary navigation. */
    label?: string;
    testId?: string;
}): import("react").JSX.Element;
