import { Component, FileText, Play } from 'lucide-react';
import type { ComponentType } from 'react';

import { type Item } from '../lib/data.js';

import { Card, EmptyState, Row, type ViewMode } from './Controls.js';

const KIND_ICONS: Record<Item['kind'], ComponentType<{ size?: number }>> = {
  file: FileText,
  component: Component,
  prototype: Play,
};

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
        <EmptyState icon={FileText} message="Nothing here yet." />
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
              <Row
                key={item.id}
                selected={selected}
                onSelect={() => onSelect(item.id)}
              >
                <Icon size={14} />
                <span className="row__name">{item.name}</span>
                <span className="row__sub">{item.author}</span>
                <span className="row__sub">{item.updated}</span>
                <span className="row__sub">{item.size}</span>
              </Row>
            );
          }

          return (
            <Card
              key={item.id}
              selected={selected}
              onSelect={() => onSelect(item.id)}
            >
              <span className="card__thumb">
                <Icon size={28} />
              </span>
              <span className="card__meta">
                <span className="card__name">{item.name}</span>
                <span className="card__sub">Edited {item.updated}</span>
              </span>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
