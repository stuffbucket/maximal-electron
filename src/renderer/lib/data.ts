import type { ViewId } from '../../shared/ipc.js';

/**
 * Sample content.
 *
 * A reference template needs enough data to make layout problems visible, and
 * no more. Replace this module with a real data source; nothing else in the
 * renderer reads from it directly.
 */

export interface Item {
  id: string;
  name: string;
  kind: 'file' | 'component' | 'prototype';
  updated: string;
  size: string;
  author: string;
}

export interface NavSection {
  id: string;
  label: string;
  items: NavEntry[];
}

export interface NavEntry {
  id: ViewId;
  label: string;
  count: number;
}

export const NAV_SECTIONS: NavSection[] = [
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

const NAMES = [
  'Design system',
  'Marketing site',
  'Mobile onboarding',
  'Dashboard v2',
  'Icon set',
  'Brand guidelines',
  'Checkout flow',
  'Email templates',
  'Data viz kit',
  'Release notes',
  'Pricing page',
  'Component audit',
];

const KINDS: Item['kind'][] = ['file', 'component', 'prototype'];
const AUTHORS = ['Avery', 'Jordan', 'Sam', 'Riley'];

/**
 * Deterministic sample rows. No randomness, so a screenshot test can baseline
 * this output.
 */
export function itemsFor(view: ViewId): Item[] {
  const counts: Record<ViewId, number> = {
    library: 12,
    recents: 6,
    drafts: 3,
    shared: 8,
    trash: 0,
  };

  return Array.from({ length: counts[view] }, (_unused, index) => ({
    id: `${view}-${index}`,
    name: NAMES[index % NAMES.length] ?? `Item ${index}`,
    kind: KINDS[index % KINDS.length] ?? 'file',
    updated: `${index + 1} day${index === 0 ? '' : 's'} ago`,
    size: `${((index + 3) * 1.4).toFixed(1)} MB`,
    author: AUTHORS[index % AUTHORS.length] ?? 'Avery',
  }));
}

export const VIEW_LABELS: Record<ViewId, string> = {
  library: 'Library',
  recents: 'Recents',
  drafts: 'Drafts',
  shared: 'Shared with me',
  trash: 'Trash',
};
