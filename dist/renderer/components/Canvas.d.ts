import { type ReactNode } from 'react';
export type CanvasViewMode = 'grid' | 'list';
/**
 * A grid of cards or a dense list, over anything with an id.
 *
 * This used to import `Item` from `lib/data.ts` — a module whose own docstring
 * says to replace it with a real data source — and hardcode an icon map of
 * `file | component | prototype`. A consumer could not use the canvas without
 * adopting the sample data's shape.
 *
 * The frame is the part worth sharing: the empty branch, the scroll container,
 * the grid-or-list switch. What a card looks like is the caller's.
 */
export declare function Canvas<T extends {
    id: string;
}>({ items, mode, selectedId, renderCard, renderRow, empty, gridModifier, label, testId, }: {
    items: T[];
    mode: CanvasViewMode;
    selectedId: string | undefined;
    renderCard: (item: T, selected: boolean) => ReactNode;
    renderRow: (item: T, selected: boolean) => ReactNode;
    empty: ReactNode;
    /** An extra class on the grid, for a view that needs different columns. */
    gridModifier?: string;
    /** Names the listbox for a screen reader. */
    label?: string;
    testId?: string;
}): import("react").JSX.Element;
