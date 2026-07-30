import * as Collapsible from '@radix-ui/react-collapsible';
import {
  ChevronDown,
  Clock,
  FileText,
  FolderOpen,
  Trash2,
  Users,
} from 'lucide-react';
import { useState, type ComponentType } from 'react';

import type { ViewId } from '../../shared/ipc.js';
import { NAV_SECTIONS } from '../lib/data.js';

const ICONS: Record<ViewId, ComponentType<{ size?: number }>> = {
  library: FolderOpen,
  recents: Clock,
  drafts: FileText,
  shared: Users,
  trash: Trash2,
};

/**
 * The collapsible left navigation.
 *
 * Two independent collapse behaviours, which is what Figma does:
 *
 * - The whole panel collapses to an icon rail. `collapsed` drives that, and the
 *   panel width is owned by `react-resizable-panels` in `App.tsx`.
 * - Each section collapses on its own, through Radix `Collapsible`.
 */
export function LeftNav({
  view,
  onSelect,
  collapsed,
}: {
  view: ViewId;
  onSelect: (view: ViewId) => void;
  collapsed: boolean;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({
    workspace: true,
    team: true,
  });

  return (
    <nav
      className={`nav${collapsed ? ' nav--collapsed' : ''}`}
      aria-label="Primary"
      data-testid="left-nav"
    >
      {NAV_SECTIONS.map((section) => (
        <Collapsible.Root
          key={section.id}
          className="nav__section"
          open={collapsed ? true : (open[section.id] ?? true)}
          onOpenChange={(next) =>
            setOpen((prev) => ({ ...prev, [section.id]: next }))
          }
        >
          {!collapsed && (
            <Collapsible.Trigger className="nav__heading">
              <ChevronDown className="nav__chevron" size={12} />
              <span>{section.label}</span>
            </Collapsible.Trigger>
          )}

          <Collapsible.Content>
            {section.items.map((entry) => {
              const Icon = ICONS[entry.id];
              const current = entry.id === view;
              return (
                <button
                  key={entry.id}
                  type="button"
                  className="nav__item"
                  aria-current={current}
                  onClick={() => onSelect(entry.id)}
                  title={collapsed ? entry.label : undefined}
                  data-testid={`nav-${entry.id}`}
                >
                  <Icon size={16} />
                  <span className="nav__label">{entry.label}</span>
                  {entry.count > 0 && (
                    <span className="nav__item-count">{entry.count}</span>
                  )}
                </button>
              );
            })}
          </Collapsible.Content>
        </Collapsible.Root>
      ))}
    </nav>
  );
}
