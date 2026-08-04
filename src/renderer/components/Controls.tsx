import * as Tooltip from '@radix-ui/react-tooltip';
import { LayoutGrid, List } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';

/**
 * Shell primitives.
 *
 * Everything here was written twice before it was written once. The production
 * canvas and the demo canvas grew the same toolbar, the same empty state and
 * the same field row independently, and two of those were byte-identical by
 * the time anyone noticed. A primitive earns its place here by having had two
 * call sites already, not by seeming useful later.
 */

/** Grid and list are the two content modes the canvas offers. */
export type ViewMode = 'grid' | 'list';

/** An icon button with a tooltip. Used across the title bar and toolbars. */
export function IconButton({
  label,
  onClick,
  children,
  active,
  danger,
  testId,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
  danger?: boolean;
  testId?: string;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          className={`icon-button${danger ? ' icon-button--danger' : ''}`}
          onClick={onClick}
          aria-label={label}
          data-active={active ? 'true' : undefined}
          data-testid={testId}
        >
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" sideOffset={6}>
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** A labelled switch that mirrors maximal's `Switch` component contract. */
export function Switch({
  label,
  checked,
  onChange,
  testId,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      className="switch"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      data-testid={testId}
    >
      <span>{label}</span>
      <span className="switch__track" data-on={checked}>
        <span className="switch__thumb" />
      </span>
    </button>
  );
}

/**
 * A labelled value in an inspector.
 *
 * Defined identically in `Inspector.tsx` and `demo/RunInspector.tsx`, down to
 * the whitespace.
 */
export function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <span className="field__value">{value}</span>
    </div>
  );
}

/** The grid and list switch. */
export function ViewModeSwitch({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  return (
    <div className="segmented" role="group" aria-label="View mode">
      <button
        type="button"
        aria-pressed={mode === 'grid'}
        aria-label="Grid view"
        onClick={() => onChange('grid')}
        data-testid="mode-grid"
      >
        <LayoutGrid size={14} />
      </button>
      <button
        type="button"
        aria-pressed={mode === 'list'}
        aria-label="List view"
        onClick={() => onChange('list')}
        data-testid="mode-list"
      >
        <List size={14} />
      </button>
    </div>
  );
}

/** A canvas heading, with the view-mode switch pushed to the right. */
export function Toolbar({
  title,
  mode,
  onModeChange,
}: {
  title: string;
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
}) {
  return (
    <div className="toolbar">
      <h1 className="toolbar__title">{title}</h1>
      <span className="toolbar__grow" />
      <ViewModeSwitch mode={mode} onChange={onModeChange} />
    </div>
  );
}

/**
 * What a canvas shows when it has nothing to show.
 *
 * The icon is the caller's, because it should match what the view holds
 * rather than be generic.
 */
export function EmptyState({
  icon: Icon,
  message,
}: {
  icon: ComponentType<{ size?: number }>;
  message: string;
}) {
  return (
    <div className="empty">
      <Icon size={24} />
      <p>{message}</p>
    </div>
  );
}

/**
 * A filled pill carrying a state.
 *
 * `status` selects the colour through `data-status` in the stylesheet, so a
 * caller passes the raw state and the label it wants read.
 */
export function StatusChip({ status, label }: { status: string; label: string }) {
  return (
    <span className="chip" data-status={status}>
      {label}
    </span>
  );
}

/**
 * A selectable tile.
 *
 * The canvas draws four of these: a card and a row in the production shell, a
 * card and a row in the demo. All four are a button carrying `aria-selected`,
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
