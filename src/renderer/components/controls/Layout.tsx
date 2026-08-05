import { LayoutGrid, List, PanelRight, X } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';

import { IconButton } from './Button.js';

/** Grid and list are the two content modes a canvas offers. */
export type ViewMode = 'grid' | 'list';

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
  as: Heading = 'h1',
}: {
  title: string;
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  /** A document has one h1. A second toolbar on the page needs h2. */
  as?: 'h1' | 'h2' | 'h3';
}) {
  return (
    <div className="toolbar">
      <Heading className="toolbar__title">{title}</Heading>
      <span className="toolbar__grow" />
      <ViewModeSwitch mode={mode} onChange={onModeChange} />
    </div>
  );
}

/**
 * What a canvas shows when it has nothing to show.
 *
 * The icon is the caller's, because it should match what the view holds rather
 * than be generic.
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
 * The chrome of a side panel: a title, and the button that collapses it.
 *
 * Both inspectors in this repository had this header written out by hand,
 * identically, down to the spacer and the 15px icon.
 */
export function InspectorPanel({
  title,
  onCollapse,
  children,
  testId = 'inspector',
}: {
  title: string;
  onCollapse: () => void;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div className="inspector" data-testid={testId}>
      <header className="inspector__header">
        <h2 className="inspector__title">{title}</h2>
        <span className="titlebar__grow" />
        <IconButton label="Collapse panel" onClick={onCollapse}>
          <PanelRight size={15} />
        </IconButton>
      </header>

      <div className="inspector__body">{children}</div>
    </div>
  );
}

/**
 * A full-width notice.
 *
 * The usual occupant of `ShellLayout`'s `top` slot: something that addresses
 * the whole window rather than one panel. `status` colours it through the same
 * `data-status` custom property everything else uses.
 */
export function Banner({
  status,
  children,
  action,
  onDismiss,
  testId,
}: {
  status?: string;
  children: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
  testId?: string;
}) {
  return (
    <div className="banner" role="status" data-status={status} data-testid={testId}>
      <span>{children}</span>
      <span className="banner__grow" />
      {action}
      {onDismiss && (
        <IconButton label="Dismiss" onClick={onDismiss}>
          <X size={14} />
        </IconButton>
      )}
    </div>
  );
}
