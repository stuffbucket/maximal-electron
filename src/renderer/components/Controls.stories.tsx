import { FolderOpen, PanelLeft, Trash2 } from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useState, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  Card,
  EmptyState,
  Field,
  IconButton,
  InspectorPanel,
  Row,
  StatusChip,
  Switch,
  Toolbar,
  ViewModeSwitch,
  type ViewMode,
} from './Controls.js';

/**
 * Every control in `Controls.tsx`, in the states it actually takes.
 *
 * `IconButton` wraps its child in a Radix `Tooltip.Root`, which needs a
 * `Tooltip.Provider` above it. In the application that comes from
 * `ShellLayout`; here it has to be supplied, and forgetting it is a blank
 * render rather than an error. That is worth knowing before putting an
 * `IconButton` in the overlay, which has no `ShellLayout` either.
 */

function Row2({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-2)', marginBottom: 'var(--space-5)' }}>
      <code
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
        }}
      >
        {label}
      </code>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        {children}
      </div>
    </div>
  );
}

function Gallery() {
  const [on, setOn] = useState(true);
  const [mode, setMode] = useState<ViewMode>('grid');
  const [picked, setPicked] = useState('a');

  return (
    <Tooltip.Provider delayDuration={200}>
      <div style={{ maxWidth: 760 }}>
        <Row2 label="IconButton — default, active, danger">
          <IconButton label="Toggle panel" onClick={() => undefined}>
            <PanelLeft size={15} />
          </IconButton>
          <IconButton label="Active" onClick={() => undefined} active>
            <PanelLeft size={15} />
          </IconButton>
          <IconButton label="Delete" onClick={() => undefined} danger>
            <Trash2 size={15} />
          </IconButton>
        </Row2>

        <Row2 label="Switch">
          <Switch label="Dock badge" checked={on} onChange={setOn} />
          <Switch label="Off" checked={false} onChange={() => undefined} />
        </Row2>

        <Row2 label="ViewModeSwitch">
          <ViewModeSwitch mode={mode} onChange={setMode} />
        </Row2>

        <Row2 label="StatusChip — one per status colour">
          <StatusChip status="running" label="Running" />
          <StatusChip status="blocked" label="Needs approval" />
          <StatusChip status="done" label="Done" />
          <StatusChip status="failed" label="Failed" />
          <StatusChip status="none" label="No status" />
        </Row2>

        <Row2 label="Field — a read-only label and value, not a form field">
          <div style={{ width: 320 }}>
            <Field label="Kind" value="component" />
            <Field label="Edited" value="4 minutes ago" />
          </div>
        </Row2>

        <Row2 label="Card — a tile in a grid">
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <Card selected={picked === 'a'} onSelect={() => setPicked('a')}>
              <span className="card__thumb">
                <FolderOpen size={28} />
              </span>
              <span className="card__meta">
                <span className="card__name">Design system</span>
                <span className="card__sub">Edited today</span>
              </span>
            </Card>
            <Card selected={picked === 'b'} onSelect={() => setPicked('b')}>
              <span className="card__thumb">
                <FolderOpen size={28} />
              </span>
              <span className="card__meta">
                <span className="card__name">Checkout flow</span>
                <span className="card__sub">Edited yesterday</span>
              </span>
            </Card>
          </div>
        </Row2>

        <Row2 label="Row — a tile in a dense list">
          <div style={{ width: 420 }}>
            <Row selected={picked === 'c'} onSelect={() => setPicked('c')}>
              <FolderOpen size={14} />
              <span className="row__name">Marketing site</span>
              <span className="row__sub">2 days ago</span>
            </Row>
            <Row selected={picked === 'd'} onSelect={() => setPicked('d')}>
              <FolderOpen size={14} />
              <span className="row__name">Icon set</span>
              <span className="row__sub">Last week</span>
            </Row>
          </div>
        </Row2>

        <Row2 label="Toolbar">
          <div style={{ width: 520, border: '1px solid var(--border-subtle)' }}>
            <Toolbar title="Library" mode={mode} onModeChange={setMode} />
          </div>
        </Row2>

        <Row2 label="EmptyState">
          <div
            style={{
              width: 420,
              height: 160,
              border: '1px solid var(--border-subtle)',
              display: 'grid',
            }}
          >
            <EmptyState icon={FolderOpen} message="Nothing here yet." />
          </div>
        </Row2>

        <Row2 label="InspectorPanel">
          <div
            style={{
              width: 320,
              height: 220,
              border: '1px solid var(--border-subtle)',
              display: 'flex',
            }}
          >
            <InspectorPanel title="Properties" onCollapse={() => undefined}>
              <Field label="Name" value="Design system" />
              <Field label="Author" value="brian" />
            </InspectorPanel>
          </div>
        </Row2>
      </div>
    </Tooltip.Provider>
  );
}

const meta = {
  title: 'Controls/All',
  component: Gallery,
} satisfies Meta<typeof Gallery>;

export default meta;

export const All: StoryObj<typeof meta> = {};
