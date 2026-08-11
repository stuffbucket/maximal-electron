import { Copy, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { Button } from './controls/Button.js';
import { Banner } from './controls/Layout.js';
import { Dialog, Menu } from './controls/Overlays.js';
import { ShellLayout } from './ShellLayout.js';

/**
 * The three-panel shell, with the surfaces that portal.
 *
 * `Portalled` and `StandaloneDialog` are the browser half of
 * `tests/portal-container.test.ts`. Every rule the package ships is scoped
 * under `.sb-shell`, and a Radix portal defaults to `document.body`, outside
 * it. The source check cannot tell whether the container a portal names is a
 * shell root; these can, because they ask the DOM. One covers the composed
 * case, where `ShellLayout` publishes its own element, and one the standalone
 * case, where `Dialog` builds one.
 */
const meta = {
  title: 'Shell/ShellLayout',
  component: ShellLayout,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => <div style={{ height: 560 }}>{Story()}</div>,
  ],
} satisfies Meta<typeof ShellLayout>;

export default meta;

const ITEMS = [
  { id: 'copy', label: 'Duplicate', icon: Copy, onSelect: () => undefined },
  { id: 'delete', label: 'Delete', icon: Trash2, danger: true, onSelect: () => undefined },
];

function Shell() {
  const [open, setOpen] = useState(false);
  return (
    <ShellLayout
      layoutId="shell-story"
      tabs={[{ id: 'one', title: 'Workspace' }]}
      activeTab="one"
      onSelectTab={() => undefined}
      tabsLabel="Workspace tabs"
      left={(collapsed) => <nav className="nav">{collapsed ? null : 'Sections'}</nav>}
      main={
        <div className="canvas" style={{ display: 'flex', gap: 8, padding: 16 }}>
          <Button onClick={() => setOpen(true)}>Open dialog</Button>
          <Menu trigger={<Button>Actions</Button>} items={ITEMS} testId="shell-menu" />
          <Dialog open={open} onOpenChange={setOpen} title="Delete this project" testId="shell-dialog">
            <p style={{ margin: 0 }}>There is no undo.</p>
          </Dialog>
        </div>
      }
      right={<div className="inspector">Inspector</div>}
      status={<span>Ready</span>}
    />
  );
}

export const Default: StoryObj = {
  render: () => <Shell />,
  play: async ({ canvasElement }) => {
    /*
     * The other half of the layout claim, and the half the obvious fix breaks.
     *
     * `top` renders no element when it is undefined, so the shell has two
     * children here and three when a banner is supplied. A rule that reserves
     * a row for the slot — `titlebar auto 1fr`, which is what two tracks look
     * like once you have seen the bug — puts the panels in that `auto` row and
     * leaves `1fr` empty below them. Measured at 77px of panels under a 683px
     * phantom, so this story is not a duplicate of the one below.
     */
    const shell = measure(canvasElement);
    await expect(shell.top, 'no top slot was supplied').toBeNull();
    await expect(shell.panels.top, scope(shell)).toBeCloseTo(shell.titlebar.bottom + shell.gap, 0);
    await expect(shell.panels.height, scope(shell)).toBeCloseTo(
      shell.content.height - shell.titlebar.height - shell.gap,
      0,
    );
    await expect(shell.statusbar.height, scope(shell)).toBeGreaterThan(0);
    await expect(shell.statusbar.bottom, scope(shell)).toBeLessThanOrEqual(
      shell.content.bottom + 0.5,
    );
  },
};

function TallStatusShell() {
  return (
    <ShellLayout
      layoutId="shell-tall-status-story"
      tabs={[{ id: 'one', title: 'Workspace' }]}
      activeTab="one"
      onSelectTab={() => undefined}
      tabsLabel="Workspace tabs"
      left={(collapsed) => <nav className="nav">{collapsed ? null : 'Sections'}</nav>}
      main={<div className="canvas">Canvas</div>}
      right={<div className="inspector">Inspector</div>}
      status={
        // A fixed height rather than wrapped text, so the assertion below
        // does not depend on font metrics in whatever engine runs it. Issue
        // #176 measured 46px needed for two lines of real status text; 48px
        // here is the same shape without the font dependency.
        <span data-testid="tall-status" style={{ display: 'inline-block', height: 48 }}>
          Connected · disk 92% · sync paused
        </span>
      }
    />
  );
}

/**
 * Content taller than the compact register.
 *
 * Issue #176: `.statusbar` carried a fixed `height: 24px`, so a taller
 * child — a control, a chip, a wrapped second line — overflowed it in both
 * directions at once, over the panel above and off the window below, rather
 * than growing the bar. `min-height` replaces it; this is the computed-layout
 * proof that a taller child grows the bar instead of being clipped by it.
 */
export const TallStatus: StoryObj = {
  render: () => <TallStatusShell />,
  play: async ({ canvasElement }) => {
    const shell = measure(canvasElement);
    const content = canvasElement.querySelector('[data-testid="tall-status"]');
    if (!content) throw new Error('nothing to measure: the tall status content did not render');
    const contentRect = content.getBoundingClientRect();

    // The floor. A collapsed child would satisfy every comparison below by
    // measuring zero.
    await expect(contentRect.height, 'the status content has a height').toBeGreaterThan(24);

    // Grew, not clipped: the bar is at least as tall as the content it holds.
    await expect(
      shell.statusbar.height,
      `statusbar ${String(Math.round(shell.statusbar.height))}px vs content ` +
        `${String(Math.round(contentRect.height))}px`,
    ).toBeGreaterThanOrEqual(contentRect.height - 0.5);

    // The content sits inside the bar rather than past it, and the bar itself
    // still sits inside the shell.
    await expect(contentRect.bottom, scope(shell)).toBeLessThanOrEqual(
      shell.statusbar.bottom + 0.5,
    );
    await expect(shell.statusbar.bottom, scope(shell)).toBeLessThanOrEqual(
      shell.content.bottom + 0.5,
    );
  },
};

/* ------------------------------------------------------------ the top slot */

interface Box {
  top: number;
  bottom: number;
  height: number;
}

interface Measured {
  /** The shell root's content box, which is what its children are laid in. */
  content: Box;
  /** The space the root puts between two of its children. */
  gap: number;
  titlebar: Box;
  panels: Box;
  statusbar: Box;
  top: Box | null;
}

/**
 * The boxes the layout claim is about, and a floor under each.
 *
 * A `querySelector` that returns `null` is this repository's recurring defect
 * in its browser form: every comparison below it reads as satisfied because
 * there was nothing to compare. So a missing element throws here, naming
 * itself, rather than turning into a comparison against `undefined`.
 *
 * The root is measured as a content box rather than a border box, so the gap
 * is read rather than assumed. That protects against a shell root whose
 * layout gains a gap of its own, not against a name collision: `.app` used to
 * be shared with a settings-surface card in `controls.css`, until issue #184.
 */
function measure(canvasElement: HTMLElement): Measured {
  const box = (element: Element | null): Box | null => {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, height: rect.height };
  };

  const root = canvasElement.querySelector('.sb-shell.app');
  const found = {
    root,
    titlebar: box(canvasElement.querySelector('.titlebar')),
    panels: box(canvasElement.querySelector('.panels')),
    statusbar: box(canvasElement.querySelector('.statusbar')),
  };

  const absent = Object.entries(found)
    .filter(([, value]) => value === null)
    .map(([name]) => name);
  if (absent.length > 0) throw new Error(`nothing to measure: ${absent.join(', ')} not rendered`);

  const style = getComputedStyle(root as Element);
  const inset = (side: 'Top' | 'Bottom') =>
    parseFloat(style[`padding${side}`]) + parseFloat(style[`border${side}Width`]);
  const rect = (root as Element).getBoundingClientRect();
  const top = rect.top + inset('Top');
  const bottom = rect.bottom - inset('Bottom');

  return {
    content: { top, bottom, height: bottom - top },
    gap: parseFloat(style.rowGap) || 0,
    titlebar: found.titlebar as Box,
    panels: found.panels as Box,
    statusbar: found.statusbar as Box,
    top: box(canvasElement.querySelector('[data-testid="offline"]')),
  };
}

/** What was measured, printed beside whichever comparison failed. */
function scope(shell: Measured): string {
  const height = (name: string, value: Box | null) =>
    `${name} ${value ? `${String(Math.round(value.height))}px` : 'absent'}`;
  return [
    `4 boxes in a ${String(Math.round(shell.content.height))}px content box` +
      ` with a ${String(shell.gap)}px gap:`,
    height('titlebar', shell.titlebar),
    height('top', shell.top),
    height('panels', shell.panels),
    height('statusbar', shell.statusbar),
  ].join(', ');
}

function TopSlotShell() {
  const banner = (testId: string) => (
    <Banner status="blocked" testId={testId}>
      You are offline. Changes are saved locally.
    </Banner>
  );

  return (
    <ShellLayout
      layoutId="shell-top-story"
      tabs={[{ id: 'one', title: 'Workspace' }]}
      activeTab="one"
      onSelectTab={() => undefined}
      tabsLabel="Workspace tabs"
      top={banner('offline')}
      left={(collapsed) => <nav className="nav">{collapsed ? null : 'Sections'}</nav>}
      main={
        <div className="canvas">
          {/* The same node, in a container that sizes it to its content. It is
              the oracle for the banner in the slot: two numbers from one
              component, rather than a pixel count written down here. */}
          {banner('offline-reference')}
        </div>
      }
      right={<div className="inspector">Inspector</div>}
      status={<span>Ready</span>}
    />
  );
}

/**
 * A banner in the `top` slot takes its content height, and the panels the rest.
 *
 * The regression this exists for: the shell root declared two grid tracks and
 * `ShellLayout` renders three children when `top` is supplied, so the banner
 * landed in `1fr` and took 683px of an 800px window while the panels were
 * squashed into an `auto` track and the status bar went off screen. No error
 * and no warning — a documented prop that simply looked wrong.
 *
 * The oracle is the same `Banner` rendered twice: once in the slot and once in
 * the canvas, where nothing stretches it. Comparing the two asks whether the
 * slot sized the element to its content without writing a pixel count down,
 * which is what made the original rule look reasonable.
 *
 * What this covers and what it does not. Storybook loads `shell.css`, so this
 * measures the reference stylesheet rather than the one the package ships;
 * `tests/package-styles.test.ts` is what carries the claim across to
 * `structural.css`, and it compares property names rather than values.
 * `npm run storybook:check` is not in CI, so nothing runs this on a pull
 * request. See `docs/storybook.md`.
 */
export const TopSlot: StoryObj = {
  render: () => <TopSlotShell />,
  play: async ({ canvasElement }) => {
    const shell = measure(canvasElement);
    const reference = canvasElement.querySelector('[data-testid="offline-reference"]');
    if (!reference) throw new Error('nothing to compare: the reference banner is not rendered');
    const content = reference.getBoundingClientRect().height;

    // The floor. A banner that drew nothing would satisfy "content height"
    // and "the panels get the rest" at the same time, by measuring zero.
    await expect(content, 'the reference banner has a height').toBeGreaterThan(0);
    await expect(shell.top, scope(shell)).not.toBeNull();

    const top = shell.top as Box;

    // It sits under the title bar, and it is as tall as its own content.
    await expect(top.top, scope(shell)).toBeCloseTo(shell.titlebar.bottom + shell.gap, 0);
    await expect(
      top.height,
      `${scope(shell)}; the same banner outside the slot is ${String(Math.round(content))}px`,
    ).toBeCloseTo(content, 0);

    // The panels get the remainder, and nothing is pushed past the bottom.
    await expect(shell.panels.top, scope(shell)).toBeCloseTo(top.bottom + shell.gap, 0);
    await expect(shell.panels.height, scope(shell)).toBeCloseTo(
      shell.content.height - shell.titlebar.height - top.height - shell.gap * 2,
      0,
    );

    // The status bar is the thing a consumer loses first, so it is asserted
    // rather than inferred from the numbers above.
    await expect(shell.statusbar.height, scope(shell)).toBeGreaterThan(0);
    await expect(shell.statusbar.bottom, scope(shell)).toBeLessThanOrEqual(
      shell.content.bottom + 0.5,
    );
  },
};

/**
 * Every portalled surface lands inside the shell root.
 *
 * A portal on `document.body` is outside `.sb-shell`, so no rule in the
 * stylesheet the package ships can reach it: an unstyled modal over an
 * unstyled scrim. The application does not show it, because `shell.css` is
 * unscoped and matches a portalled element happily.
 */
export const Portalled: StoryObj = {
  render: () => <Shell />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    const root = canvasElement.querySelector('.sb-shell');
    await expect(root).not.toBeNull();

    await userEvent.click(canvas.getByRole('button', { name: 'Open dialog' }));
    const dialog = await body.findByTestId('shell-dialog');
    await expect(dialog.closest('.sb-shell')).toBe(root);
    await expect(document.querySelector('.dialog__scrim')?.closest('.sb-shell')).toBe(root);
    await userEvent.keyboard('{Escape}');

    await userEvent.click(canvas.getByRole('button', { name: 'Actions' }));
    const menu = await body.findByTestId('shell-menu');
    await expect(menu.closest('.sb-shell')).toBe(root);
    // Closed again, so the a11y check does not see a document behind an open
    // popup and report the trigger as focusable inside `aria-hidden`.
    await userEvent.keyboard('{Escape}');

    await userEvent.hover(canvas.getByRole('button', { name: 'Hide sidebar' }));
    const tooltip = await body.findByText('Hide sidebar', { selector: '.tooltip' });
    await expect(tooltip.closest('.sb-shell')).toBe(root);
    await userEvent.unhover(canvas.getByRole('button', { name: 'Hide sidebar' }));
  },
};

function Standalone() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ padding: 16 }}>
      <Button onClick={() => setOpen(true)}>Open dialog</Button>
      <Dialog open={open} onOpenChange={setOpen} title="Delete this project" testId="lone-dialog">
        <p style={{ margin: 0 }}>There is no undo.</p>
      </Dialog>
    </div>
  );
}

/**
 * The same surface with no `ShellLayout` above it.
 *
 * README shows composing the smaller exports directly, so this is a supported
 * arrangement and it has no provider. The Radix default of `document.body` is
 * outside every rule the package ships: the dialog computed `position: static`
 * at 1280px wide with no scrim, while Radix kept the focus trap and put
 * `aria-hidden` on the rest of the document. `Dialog` therefore builds a shell
 * root of its own rather than taking the default, and this is where that is
 * asserted against a real DOM.
 */
export const StandaloneDialog: StoryObj = {
  render: () => <Standalone />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector('.sb-shell')).toBeNull();

    await userEvent.click(canvas.getByRole('button', { name: 'Open dialog' }));
    const dialog = await within(document.body).findByTestId('lone-dialog');

    const root = dialog.closest('.sb-shell');
    await expect(root).not.toBeNull();
    await expect(root?.parentElement).toBe(document.body);
    await expect(document.querySelector('.dialog__scrim')?.closest('.sb-shell')).toBe(root);

    // One root per document, however many standalone surfaces open.
    await expect(document.querySelectorAll('[data-sb-shell-portal-root]')).toHaveLength(1);
    await userEvent.keyboard('{Escape}');
  },
};
