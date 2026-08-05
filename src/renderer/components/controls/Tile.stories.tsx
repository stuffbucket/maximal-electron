import { FileText, FolderOpen } from 'lucide-react';
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Card, Row } from './Tile.js';

/**
 * Both are one button underneath, carrying `aria-selected`. Four of these were
 * written by hand before they were written once, and two forgot `type`.
 */
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
    <Card {...args} onSelect={() => undefined}>
      <span className="card__thumb">
        <FolderOpen size={28} />
      </span>
      <span className="card__meta">
        <span className="card__name">Design system</span>
        <span className="card__sub">Edited today</span>
      </span>
    </Card>
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
      <div style={{ width: 420 }}>
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
