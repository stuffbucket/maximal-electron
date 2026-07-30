import * as Collapsible from '@radix-ui/react-collapsible';
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  FolderGit2,
  Loader,
  ShieldQuestion,
} from 'lucide-react';
import { useState, type ComponentType } from 'react';

import {
  NAV_SECTIONS,
  type DemoNavEntry,
  type DemoViewId,
} from '../../lib/demo.js';
import type { RunStatus } from '../../lib/demo-runs.js';

/** One icon per status bucket, so the Agents section reads at a glance. */
const STATUS_ICONS: Record<RunStatus, ComponentType<{ size?: number }>> = {
  running: Loader,
  blocked: ShieldQuestion,
  done: CheckCircle2,
  failed: CircleAlert,
};

function entryIcon(entry: DemoNavEntry): ComponentType<{ size?: number }> {
  if (entry.status) return STATUS_ICONS[entry.status];
  return entry.id === 'all' ? Bot : FolderGit2;
}

/**
 * The demo left navigation: projects on top, agent status buckets below.
 *
 * It keeps the class names and the collapse behaviour of the production
 * `LeftNav`, so the panel rail, the section collapse, and the icon-only state
 * all look and behave the same. Only the content differs.
 */
export function AgentNav({
  view,
  onSelect,
  collapsed,
}: {
  view: DemoViewId;
  onSelect: (view: DemoViewId) => void;
  collapsed: boolean;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({
    projects: true,
    agents: true,
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
            {section.entries.map((entry) => {
              const Icon = entryIcon(entry);
              return (
                <button
                  key={entry.id}
                  type="button"
                  className="nav__item"
                  aria-current={entry.id === view}
                  data-status={entry.status}
                  onClick={() => onSelect(entry.id)}
                  title={collapsed ? entry.label : undefined}
                  data-testid={`nav-${entry.id.replace(':', '-')}`}
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
