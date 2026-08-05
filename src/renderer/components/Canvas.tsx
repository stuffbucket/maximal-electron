import { Fragment, type ReactNode } from 'react';

import { type ViewMode } from './Controls.js';

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
export function Canvas<T extends { id: string }>({
  items,
  mode,
  selectedId,
  renderCard,
  renderRow,
  empty,
  gridModifier,
  testId = 'canvas',
}: {
  items: T[];
  mode: ViewMode;
  selectedId: string | undefined;
  renderCard: (item: T, selected: boolean) => ReactNode;
  renderRow: (item: T, selected: boolean) => ReactNode;
  empty: ReactNode;
  /** An extra class on the grid, for a view that needs different columns. */
  gridModifier?: string;
  testId?: string;
}) {
  if (items.length === 0) {
    return <div className="canvas">{empty}</div>;
  }

  const grid = mode === 'grid' ? `grid${gridModifier ? ` ${gridModifier}` : ''}` : 'list';

  return (
    <div className="canvas" data-testid={testId}>
      <div className={grid} data-testid={`view-${mode}`}>
        {items.map((item) => {
          const selected = item.id === selectedId;
          const render = mode === 'list' ? renderRow : renderCard;
          return <Fragment key={item.id}>{render(item, selected)}</Fragment>;
        })}
      </div>
    </div>
  );
}
