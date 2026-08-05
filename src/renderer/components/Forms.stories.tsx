import { Copy, Trash2, TriangleAlert } from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useState, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  Banner,
  Button,
  Checkbox,
  Dialog,
  FormField,
  Menu,
  RadioGroup,
  Select,
  TextInput,
  Textarea,
} from './Controls.js';

/**
 * The form and overlay vocabulary.
 *
 * Six of these had no call site when they were written, which breaks the rule
 * in `controls/index.ts` on purpose: a shell meant to be depended on cannot
 * hand a consumer a text field they have to write themselves. This page is how
 * they get looked at instead.
 */

function Row({ label, children }: { label: string; children: ReactNode }) {
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
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
        {children}
      </div>
    </div>
  );
}

function Forms() {
  const [text, setText] = useState('');
  const [long, setLong] = useState('');
  const [choice, setChoice] = useState<'writes' | 'all' | 'none'>('writes');
  const [radio, setRadio] = useState<'a' | 'b' | 'c'>('a');
  const [checked, setChecked] = useState(true);

  const approval = [
    { value: 'writes' as const, label: 'Anything that changes files' },
    { value: 'all' as const, label: 'Every tool' },
    { value: 'none' as const, label: 'Never ask' },
  ];

  return (
    <div style={{ maxWidth: 460, display: 'grid', gap: 'var(--space-5)' }}>
      <Row label="Button — variant x size">
        <Button size="sm">Small</Button>
        <Button>Default</Button>
        <Button size="lg">Large</Button>
      </Row>
      <Row label="Button — variants, and disabled">
        <Button variant="primary">Primary</Button>
        <Button variant="danger">Danger</Button>
        <Button disabled>Disabled</Button>
        <Button variant="primary" disabled>
          Disabled
        </Button>
      </Row>

      <FormField label="Name" hint="Shown in the title bar.">
        {(field) => (
          <TextInput {...field} value={text} onChange={setText} placeholder="Untitled" />
        )}
      </FormField>

      <FormField label="Working directory" error="That path does not exist.">
        {(field) => (
          <TextInput {...field} value="/no/such/place" onChange={() => undefined} />
        )}
      </FormField>

      <FormField label="Prompt" hint="Enter sends. Shift and Enter makes a new line.">
        {(field) => (
          <Textarea {...field} value={long} onChange={setLong} placeholder="Ask anything…" />
        )}
      </FormField>

      <FormField label="Ask before running">
        {(field) => (
          <Select {...field} value={choice} onChange={setChoice} options={approval} />
        )}
      </FormField>

      <FormField label="Disabled">
        {(field) => (
          <Select {...field} value={choice} onChange={setChoice} options={approval} disabled />
        )}
      </FormField>

      <Row label="Checkbox">
        <Checkbox label="Follow the system theme" checked={checked} onChange={setChecked} />
        <Checkbox label="Disabled" checked={false} onChange={() => undefined} disabled />
      </Row>

      <FormField label="Toolset">
        {(field) => (
          <RadioGroup
            {...field}
            value={radio}
            onChange={setRadio}
            options={[
              { value: 'a', label: 'Application' },
              { value: 'b', label: 'Filesystem' },
              { value: 'c', label: 'Everything' },
            ]}
          />
        )}
      </FormField>
    </div>
  );
}

function Overlays() {
  const [open, setOpen] = useState(false);

  return (
    <Tooltip.Provider>
      <div style={{ display: 'grid', gap: 'var(--space-5)', maxWidth: 460 }}>
        <Row label="Dialog — focus trapped, Escape closes, title is the accessible name">
          <Button variant="primary" onClick={() => setOpen(true)}>
            Open dialog
          </Button>
          <Dialog
            open={open}
            onOpenChange={setOpen}
            title="Delete this project"
            testId="story-dialog"
          >
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
        </Row>

        <Row label="Menu — arrow keys, typeahead, Escape">
          <Menu
            trigger={<Button>Actions</Button>}
            testId="story-menu"
            items={[
              { id: 'copy', label: 'Duplicate', icon: Copy, onSelect: () => undefined },
              { id: 'off', label: 'Unavailable', onSelect: () => undefined, disabled: true },
              {
                id: 'delete',
                label: 'Delete',
                icon: Trash2,
                danger: true,
                onSelect: () => undefined,
              },
            ]}
          />
        </Row>

        <Row label="Banner — the usual occupant of ShellLayout's top slot">
          <div style={{ width: '100%', display: 'grid', gap: 'var(--space-2)' }}>
            <Banner>An update is available.</Banner>
            <Banner status="blocked" onDismiss={() => undefined}>
              <TriangleAlert size={14} /> No local model is running.
            </Banner>
            <Banner status="failed" action={<Button size="sm">Retry</Button>}>
              The last save failed.
            </Banner>
          </div>
        </Row>
      </div>
    </Tooltip.Provider>
  );
}

const meta = {
  title: 'Controls/Forms',
  component: Forms,
} satisfies Meta<typeof Forms>;

export default meta;

export const Forms_: StoryObj<typeof meta> = { name: 'Forms' };

export const OverlaysAndBanners: StoryObj<typeof meta> = {
  name: 'Dialog, Menu, Banner',
  render: () => <Overlays />,
};
