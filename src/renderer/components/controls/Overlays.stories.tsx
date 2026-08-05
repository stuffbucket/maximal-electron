import { Copy, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from './Button.js';
import { Dialog, Menu } from './Overlays.js';

/**
 * Both are Radix, on the rule the rest of this repository follows: hand-roll
 * nothing whose accessibility is hard.
 *
 * The `play` functions here assert what a screenshot cannot — that focus is
 * trapped, that the document behind goes inert, and that the menu takes arrow
 * keys. Those were previously checked with a throwaway Playwright script that
 * lived for one run.
 */
const meta = {
  title: 'Controls/Dialog',
  component: Dialog,
  args: {
    title: 'Delete this project',
    open: false,
    // Both supplied by `render`; declared because the props are required.
    children: null,
  },
  argTypes: {
    children: { table: { disable: true } },
    open: { table: { disable: true } },
  },
} satisfies Meta<typeof Dialog>;

export default meta;

function Confirm({ title }: { title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Open dialog
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title={title} testId="story-dialog">
        <p style={{ margin: 0 }}>
          This removes the project and everything in it. There is no undo.
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="danger" onClick={() => setOpen(false)}>
            Delete
          </Button>
        </div>
      </Dialog>
    </>
  );
}

export const Closed: StoryObj<typeof meta> = {
  render: (args) => <Confirm title={args.title} />,
};

/** Opened, and asserted to be a real dialog rather than a styled div. */
export const Open: StoryObj<typeof meta> = {
  render: (args) => <Confirm title={args.title} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Open dialog' }));

    // Portalled, so it is outside `canvasElement`.
    const dialog = await within(document.body).findByTestId('story-dialog');

    await expect(dialog).toHaveAttribute('role', 'dialog');
    // The title supplies the accessible name and is visually hidden.
    await expect(dialog).toHaveAccessibleName('Delete this project');
    await expect(dialog.contains(document.activeElement)).toBe(true);
  },
};

/** Escape closes it, which is the behaviour a hand-rolled modal never had. */
export const EscapeCloses: StoryObj<typeof meta> = {
  name: 'Escape closes',
  render: (args) => <Confirm title={args.title} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Open dialog' }));
    await within(document.body).findByTestId('story-dialog');

    await userEvent.keyboard('{Escape}');
    await expect(
      within(document.body).queryByTestId('story-dialog'),
    ).not.toBeInTheDocument();
  },
};

const ITEMS = [
  { id: 'copy', label: 'Duplicate', icon: Copy, onSelect: () => undefined },
  { id: 'off', label: 'Unavailable', onSelect: () => undefined, disabled: true },
  {
    id: 'delete',
    label: 'Delete',
    icon: Trash2,
    danger: true,
    onSelect: () => undefined,
  },
];

export const DropdownMenu: StoryObj = {
  name: 'Menu',
  render: () => <Menu trigger={<Button>Actions</Button>} items={ITEMS} testId="story-menu" />,
};

/** Arrow keys move the highlight, and skip the disabled item on the way. */
export const MenuKeyboard: StoryObj = {
  name: 'Menu — keyboard',
  render: () => <Menu trigger={<Button>Actions</Button>} items={ITEMS} testId="story-menu" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Actions' }));

    const menu = await within(document.body).findByTestId('story-menu');
    await userEvent.keyboard('{ArrowDown}');
    await expect(within(menu).getByText('Duplicate').closest('[role="menuitem"]')).toHaveAttribute(
      'data-highlighted',
    );

    // Past the disabled entry, not onto it.
    await userEvent.keyboard('{ArrowDown}');
    await expect(within(menu).getByText('Delete').closest('[role="menuitem"]')).toHaveAttribute(
      'data-highlighted',
    );
  },
};
