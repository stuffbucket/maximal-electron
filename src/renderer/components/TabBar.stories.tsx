import { SquareTerminal } from 'lucide-react';
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { TabBar, type Tab } from './TabBar.js';

/**
 * The tab strip, at the widths where its rules actually show.
 *
 * A tab strip is mostly invisible until it is under pressure: one tab, many
 * tabs, a title too long for the space, a strip wider than the window. Those
 * are the states, so those are the stories.
 */

const SHORT: Tab[] = [
  { id: 'a', title: 'Library' },
  { id: 'b', title: 'Terminal 1' },
  { id: 'c', title: 'Terminal 2' },
];

const LONG: Tab[] = [
  { id: 'a', title: 'Library' },
  { id: 'b', title: 'refactor the provider discovery chain' },
  { id: 'c', title: 'components/controls/Overlays.stories.tsx' },
  { id: 'd', title: 'Terminal 1' },
];

const RUNS: Tab[] = [
  { id: 'a', title: 'refactor auth', status: 'running' },
  { id: 'b', title: 'flaky test triage', status: 'blocked' },
  { id: 'c', title: 'bump deps', status: 'done' },
  { id: 'd', title: 'migrate tokens', status: 'failed' },
];

function Strip({ tabs, width }: { tabs: Tab[]; width: number }) {
  const [open, setOpen] = useState(tabs);
  const [active, setActive] = useState(tabs[0]?.id ?? '');

  return (
    /*
     * The strip lives in the title bar, so it is shown on that surface, at a
     * real width, with the siblings it actually has.
     *
     * Not decoration: `.tabs` is `flex: 0 1 auto` and does not grow, so the
     * `titlebar__grow` spacer is what takes the slack. Without it the strip
     * sized to 400 of 640 and every tab truncated — a story that made the
     * component look broken when the component was fine.
     */
    <div
      className="titlebar"
      style={{ width, height: 'var(--size-titlebar)', overflow: 'hidden' }}
    >
      <span className="titlebar__spacer-mac" />
      <TabBar
        tabs={open}
        active={active}
        onSelect={setActive}
        onClose={(id) => setOpen((prev) => prev.filter((tab) => tab.id !== id))}
        onNew={() => undefined}
        icon={(tab) => (tab.title.startsWith('Terminal') ? SquareTerminal : undefined)}
      />
      <span className="titlebar__grow" />
    </div>
  );
}

const meta = {
  title: 'Layout/TabBar',
  component: TabBar,
  args: {
    tabs: SHORT,
    active: 'a',
    onSelect: () => undefined,
    onClose: () => undefined,
    onNew: () => undefined,
  },
  argTypes: {
    tabs: { table: { disable: true } },
    icon: { table: { disable: true } },
  },
  render: (args) => <Strip tabs={args.tabs} width={640} />,
} satisfies Meta<typeof TabBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Room for everything. The separators are the only thing dividing them. */
export const Default: Story = {};

/** One tab has no close button: closing the last one is refused. */
export const Single: Story = {
  render: () => <Strip tabs={[{ id: 'a', title: 'Library' }]} width={640} />,
};

/**
 * Titles longer than a tab is allowed to be.
 *
 * Truncation fades rather than clipping to an ellipsis. An ellipsis says "this
 * is cut" and costs three characters to say it; a fade shows the same thing
 * with the characters it would have spent.
 */
export const Truncated: Story = {
  render: () => <Strip tabs={LONG} width={640} />,
};

/** Narrower than the strip wants. Tabs reach their minimum and then scroll. */
export const Crowded: Story = {
  render: () => <Strip tabs={LONG} width={380} />,
};

/** A status dot per tab, for a strip tracking things with a lifecycle. */
export const WithStatus: Story = {
  render: () => <Strip tabs={RUNS} width={640} />,
};

/** Every tab carrying an icon, which is the widest the chrome ever gets. */
export const WithIcons: Story = {
  render: () => (
    <Strip
      tabs={RUNS.map((tab) => ({ ...tab, title: `Terminal ${tab.title}` }))}
      width={640}
    />
  ),
};
