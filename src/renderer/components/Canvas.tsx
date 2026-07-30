import { Component, FileText, LayoutGrid, List, Play } from 'lucide-react';
import type { ComponentType } from 'react';

import type { ViewId } from '../../shared/ipc.js';
import { VIEW_LABELS, type Item } from '../lib/data.js';

export type ViewMode = 'grid' | 'list';

const KIND_ICONS: Record<Item['kind'], ComponentType<{ size?: number }>> = {
  file: FileText,
  component: Component,
  prototype: Play,
};

/** The view-mode switch. Grid and list are the two Figma-style content modes. */
export function Toolbar({
  view,
  mode,
  onModeChange,
  count,
}: {
  view: ViewId;
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  count: number;
}) {
  return (
    <div className="toolbar">
      <h1 className="toolbar__title">{VIEW_LABELS[view]}</h1>
      <span className="card__sub">
        {count} item{count === 1 ? '' : 's'}
      </span>
      <span className="toolbar__grow" />
      <div className="segmented" role="group" aria-label="View mode">
        <button
          type="button"
          aria-pressed={mode === 'grid'}
          aria-label="Grid view"
          onClick={() => onModeChange('grid')}
          data-testid="mode-grid"
        >
          <LayoutGrid size={14} />
        </button>
        <button
          type="button"
          aria-pressed={mode === 'list'}
          aria-label="List view"
          onClick={() => onModeChange('list')}
          data-testid="mode-list"
        >
          <List size={14} />
        </button>
      </div>
    </div>
  );
}

/** Grid of cards, or a dense list. Selection drives the right inspector. */
export function Canvas({
  items,
  mode,
  selectedId,
  onSelect,
}: {
  items: Item[];
  mode: ViewMode;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="canvas">
        <div className="empty">
          <FileText size={24} />
          <p>Nothing here yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="canvas" data-testid="canvas">
      <div className={mode === 'grid' ? 'grid' : 'list'} data-testid={`view-${mode}`}>
        {items.map((item) => {
          const Icon = KIND_ICONS[item.kind];
          const selected = item.id === selectedId;

          if (mode === 'list') {
            return (
              <button
                key={item.id}
                type="button"
                className="row"
                aria-selected={selected}
                onClick={() => onSelect(item.id)}
              >
                <Icon size={14} />
                <span className="row__name">{item.name}</span>
                <span className="row__sub">{item.author}</span>
                <span className="row__sub">{item.updated}</span>
                <span className="row__sub">{item.size}</span>
              </button>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              className="card"
              aria-selected={selected}
              onClick={() => onSelect(item.id)}
            >
              <span className="card__thumb">
                <Icon size={28} />
              </span>
              <span className="card__meta">
                <span className="card__name">{item.name}</span>
                <span className="card__sub">Edited {item.updated}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
