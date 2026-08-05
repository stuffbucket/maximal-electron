import { SquareTerminal } from 'lucide-react';
import { useState } from 'react';
import { expect } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { TabBar, getTabPanelId, getTabTriggerId, type Tab } from './TabBar.js';

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

function Strip({
  tabs,
  width,
  idBase = 'story',
  active: initial,
  label = 'Open documents',
}: {
  tabs: Tab[];
  width: number;
  /** Distinct per strip, so two strips on one page do not share element IDs. */
  idBase?: string;
  active?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(tabs);
  const [active, setActive] = useState(initial ?? tabs[0]?.id ?? '');

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
    <>
      <div
        className="titlebar"
        style={{ width, height: 'var(--size-titlebar)', overflow: 'hidden' }}
      >
        <span className="titlebar__spacer-mac" />
        <TabBar
          tabIdBase={idBase}
          tabs={open}
          active={active}
          onSelect={setActive}
          onClose={(id) => setOpen((prev) => prev.filter((tab) => tab.id !== id))}
          onNew={() => undefined}
          icon={(tab) => (tab.title.startsWith('Terminal') ? SquareTerminal : undefined)}
          label={label}
        />
        <span className="titlebar__grow" />
      </div>
      {/*
       * `TabBar` renders the strip only and points each tab at a panel the
       * caller owns. A story has no caller, so it stands in for one; without
       * these every `aria-controls` names an element that is not on the page.
       */}
      {open.map((tab) => (
        <div key={tab.id} hidden id={getTabPanelId(idBase, tab.id)} role="tabpanel" />
      ))}
    </>
  );
}

const meta = {
  title: 'Layout/TabBar',
  component: TabBar,
  args: {
    tabIdBase: 'story',
    tabs: SHORT,
    active: 'a',
    onSelect: () => undefined,
    onClose: () => undefined,
    onNew: () => undefined,
  },
  argTypes: {
    tabIdBase: { table: { disable: true } },
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

function Caption({ children }: { children: string }) {
  return (
    <p
      style={{
        margin: `var(--space-2) 0 0`,
        color: 'var(--text-muted)',
        font: 'var(--weight-base) var(--text-sm) / var(--leading-base) var(--font-body)',
      }}
    >
      {children}
    </p>
  );
}

/**
 * The four states, on one page, in whichever scheme the toolbar is set to.
 *
 * Rest and selected are both visible in any strip, because a strip always has
 * exactly one selected tab. Focus is put there by this story's `play`. Hover is
 * the one that cannot be frozen: no story can force a CSS pseudo-class without
 * a pseudo-states addon, so the third strip is one to point at.
 *
 * What to look for. Selected is a fill off the strip plus an accent along the
 * bottom edge, and the separators either side of it are gone. Hovered is the
 * same shape at a lower fill with no accent — near the selected tab, not equal
 * to it. Focused is hovered plus a ring, and the selection has not moved,
 * because arriving on a tab does not open it.
 */
export const States: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 'var(--space-5)', padding: 'var(--space-4)' }}>
      <div>
        <Strip
          tabs={SHORT}
          width={560}
          idBase="state-rest"
          active="b"
          label="Rest and selected"
        />
        <Caption>Rest and selected. Terminal 1 is the open document.</Caption>
      </div>
      <div>
        <Strip tabs={SHORT} width={560} idBase="state-hover" label="Hover" />
        <Caption>Hover. Point at Terminal 1, beside the selected Library.</Caption>
      </div>
      <div>
        <Strip tabs={SHORT} width={560} idBase="state-focus" label="Keyboard focus" />
        <Caption>Keyboard focus on Terminal 2. Library is still the open one.</Caption>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const tab = canvasElement.querySelector<HTMLElement>(
      `#${CSS.escape(getTabTriggerId('state-focus', 'c'))}`,
    );
    // Not `userEvent.tab()`: focus has to land on a tab that is not the first,
    // and the point is the state, not the route to it.
    tab?.focus();
    await expect(tab).toHaveFocus();
    // Radix activates on Enter, so focus and selection are different things.
    // A ring that also selected would make this state impossible to show.
    await expect(tab).toHaveAttribute('aria-selected', 'false');
  },
};
