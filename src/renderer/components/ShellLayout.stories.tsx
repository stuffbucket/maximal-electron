import { Copy, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { Button } from './controls/Button.js';
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

export const Default: StoryObj = { render: () => <Shell /> };

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
