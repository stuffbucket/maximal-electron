import { FileText, FolderOpen } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Card, Row } from './Tile.js';

/**
 * Both are `role="option"` underneath.
 *
 * An option is only meaningful inside a listbox, which `Canvas` supplies in the
 * application, so these stories supply one too. A story that renders a
 * component outside the context it requires reports problems the product does
 * not have, and hides the ones it does.
 */

function Listbox({ children }: { children: ReactNode }) {
  return (
    <div role="listbox" aria-label="Items">
      {children}
    </div>
  );
}

const meta = {
  title: 'Controls/Tile',
  component: Card,
  args: {
    selected: false,
    status: undefined,
    // Supplied by `render`; declared because the props are required.
    children: null,
    onSelect: () => undefined,
  },
  argTypes: {
    status: {
      control: 'inline-radio',
      options: [undefined, 'running', 'blocked', 'done', 'failed'],
    },
    children: { table: { disable: true } },
    modifier: { table: { disable: true } },
  },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CardTile: Story = {
  name: 'Card',
  render: (args) => (
    <Listbox>
      <Card {...args} onSelect={() => undefined}>
      <span className="card__thumb">
        <FolderOpen size={28} />
      </span>
      <span className="card__meta">
        <span className="card__name">Design system</span>
        <span className="card__sub">Edited today</span>
        </span>
      </Card>
    </Listbox>
  ),
};

export const Selected: Story = {
  ...CardTile,
  args: { ...meta.args, selected: true },
};

export const RowTile: StoryObj = {
  name: 'Row',
  render: function RowRender() {
    const [picked, setPicked] = useState('a');
    return (
      <div style={{ width: 420 }} role="listbox" aria-label="Items">
        <Row selected={picked === 'a'} onSelect={() => setPicked('a')}>
          <FileText size={14} />
          <span className="row__name">Marketing site</span>
          <span className="row__sub">2 days ago</span>
        </Row>
        <Row selected={picked === 'b'} onSelect={() => setPicked('b')}>
          <FileText size={14} />
          <span className="row__name">Icon set</span>
          <span className="row__sub">Last week</span>
        </Row>
      </div>
    );
  },
};
