import {
  Bot,
  CheckCircle2,
  CircleAlert,
  Clock,
  FileText,
  FolderOpen,
  Loader,
  ShieldQuestion,
  Trash2,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { NavRail, type NavRailSection } from './NavRail.js';

/**
 * The navigation rail, with both of its call sites side by side.
 *
 * The application's rail and the capture fixture's rail differ only in their
 * data and their icons, which is the claim `NavRail` makes. Two stories is the
 * cheapest way to keep that claim honest: if the generic form ever stops
 * fitting one of them, it stops fitting here first.
 */

type AppView = 'library' | 'recents' | 'drafts' | 'shared' | 'trash';

const APP_SECTIONS: NavRailSection<AppView>[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    items: [
      { id: 'library', label: 'Library', count: 12 },
      { id: 'recents', label: 'Recents', count: 6 },
      { id: 'drafts', label: 'Drafts', count: 3 },
    ],
  },
  {
    id: 'team',
    label: 'Team',
    items: [
      { id: 'shared', label: 'Shared with me', count: 8 },
      { id: 'trash', label: 'Trash', count: 0 },
    ],
  },
];

const APP_ICONS = {
  library: FolderOpen,
  recents: Clock,
  drafts: FileText,
  shared: Users,
  trash: Trash2,
} as const;

type FleetStatus = 'running' | 'blocked' | 'done' | 'failed';

const FLEET_SECTIONS: NavRailSection<string, FleetStatus>[] = [
  {
    id: 'projects',
    label: 'Projects',
    items: [
      { id: 'project:maximal-core', label: 'maximal-core', count: 6 },
      { id: 'project:shell', label: 'shell', count: 4 },
    ],
  },
  {
    id: 'agents',
    label: 'Agents',
    items: [
      { id: 'all', label: 'All runs', count: 17 },
      { id: 'status:running', label: 'Running', count: 6, status: 'running' },
      { id: 'status:blocked', label: 'Needs approval', count: 3, status: 'blocked' },
      { id: 'status:done', label: 'Done', count: 7, status: 'done' },
      { id: 'status:failed', label: 'Failed', count: 1, status: 'failed' },
    ],
  },
];

const FLEET_ICONS = {
  running: Loader,
  blocked: ShieldQuestion,
  done: CheckCircle2,
  failed: CircleAlert,
} as const;

function Frame({ collapsed, children }: { collapsed: boolean; children: React.ReactNode }) {
  return (
    <div
      className="panel"
      style={{
        // The widths the shell actually gives it, from the tokens.
        width: collapsed ? 'var(--nav-collapsed)' : 'var(--nav-default)',
        height: 420,
        border: '1px solid var(--border-subtle)',
      }}
    >
      {children}
    </div>
  );
}

function AppRail({ collapsed }: { collapsed: boolean }) {
  const [view, setView] = useState<AppView>('library');
  return (
    <Frame collapsed={collapsed}>
      <NavRail
        sections={APP_SECTIONS}
        current={view}
        onSelect={setView}
        collapsed={collapsed}
        icon={(entry) => APP_ICONS[entry.id]}
      />
    </Frame>
  );
}

function FleetRail({ collapsed }: { collapsed: boolean }) {
  const [view, setView] = useState('all');
  return (
    <Frame collapsed={collapsed}>
      <NavRail
        sections={FLEET_SECTIONS}
        current={view}
        onSelect={setView}
        collapsed={collapsed}
        icon={(entry) =>
          entry.status ? FLEET_ICONS[entry.status] : entry.id === 'all' ? Bot : FolderOpen
        }
      />
    </Frame>
  );
}

const meta = {
  title: 'Layout/NavRail',
  component: AppRail,
  args: { collapsed: false },
  argTypes: { collapsed: { control: 'boolean' } },
} satisfies Meta<typeof AppRail>;

export default meta;

/** The application's own rail: two sections, no status. */
export const Application: StoryObj<typeof meta> = {};

/** The capture fixture's rail: status buckets, coloured icons, colons in ids. */
export const AgentFleet: StoryObj<typeof meta> = {
  render: (args) => <FleetRail collapsed={args.collapsed} />,
};

/** Collapsed to an icon rail. The panel width is the caller's; this is the state. */
export const Collapsed: StoryObj<typeof meta> = {
  args: { collapsed: true },
};
