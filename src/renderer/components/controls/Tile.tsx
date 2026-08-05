import type { ReactNode } from 'react';

/**
 * A selectable tile.
 *
 * A canvas draws four of these: a card and a row in the application, a card and
 * a row in the capture fixture. All four are a button carrying `aria-selected`,
 * and all four had that written out by hand. A tile that forgets `type` submits
 * a form, and one that forgets `aria-selected` tells a screen reader nothing,
 * so the semantics belong in one place.
 *
 * `modifier` adds the view's own class beside the base one. `status` sets
 * `data-status`, which the stylesheet colours from.
 */
function Selectable({
  base,
  modifier,
  selected,
  onSelect,
  status,
  testId,
  children,
}: {
  base: 'card' | 'row';
  modifier?: string;
  selected: boolean;
  onSelect: () => void;
  status?: string;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={modifier ? `${base} ${modifier}` : base}
      aria-selected={selected}
      onClick={onSelect}
      data-status={status}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

export type TileProps = Omit<Parameters<typeof Selectable>[0], 'base'>;

/** A tile in a grid. */
export function Card(props: TileProps) {
  return <Selectable base="card" {...props} />;
}

/** A tile in a dense list. */
export function Row(props: TileProps) {
  return <Selectable base="row" {...props} />;
}
