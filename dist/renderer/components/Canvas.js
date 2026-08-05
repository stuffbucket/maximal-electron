import { jsx as _jsx } from "react/jsx-runtime";
import { Fragment } from 'react';
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
export function Canvas({ items, mode, selectedId, renderCard, renderRow, empty, gridModifier, label = 'Items', testId = 'canvas', }) {
    if (items.length === 0) {
        return _jsx("div", { className: "canvas", children: empty });
    }
    const grid = mode === 'grid' ? `grid${gridModifier ? ` ${gridModifier}` : ''}` : 'list';
    return (_jsx("div", { className: "canvas", "data-testid": testId, children: _jsx("div", { className: grid, role: "listbox", "aria-label": label, "data-testid": `view-${mode}`, children: items.map((item) => {
                const selected = item.id === selectedId;
                const render = mode === 'list' ? renderRow : renderCard;
                return _jsx(Fragment, { children: render(item, selected) }, item.id);
            }) }) }));
}
