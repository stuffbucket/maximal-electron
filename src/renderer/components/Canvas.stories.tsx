import { FileText, FolderOpen, Layers } from 'lucide-react';
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { Canvas } from './Canvas.js';
import { EmptyState, Toolbar } from './controls/Layout.js';
import { Card, Row } from './controls/Tile.js';

/**
 * The frame around a set of things: grid or list, a scroll container, and an
 * empty branch.
 *
 * What a tile looks like is the caller's, which is why `renderCard` and
 * `renderRow` are functions and not a shape. Both in-repo callers pass `Card`
 * and `Row` from `controls/Tile.js`, so these stories do too — the tiles are
 * `role="option"` and the canvas is the `role="listbox"` that makes that mean
 * anything, and neither is complete without the other.
 *
 * **`mode` is the caller's.** The canvas reads it and never sets it, so a
 * consumer owns the state and pairs it with `ViewModeSwitch`. `Switchable`
 * below is that pairing, which is the arrangement the application ships.
 *
 * **There is no keyboard story, and there cannot be one yet.** A listbox owes
 * its user one tab stop and arrow keys between options. `Canvas` implements
 * neither, and issue #171 records both that and the missing option contract: it
 * hardcodes `role="listbox"` while telling a consumer nothing about what the
 * items must be. Every tile here is a `<button>`, so the grid is operable by
 * tabbing through all of them — verbose, but reachable, and axe is satisfied
 * because the structure is valid. A `play` function asserting arrow keys would
 * be asserting a contract this component does not implement, so what is written
 * here instead is that it does not.
 */

interface Doc {
  id: string;
  name: string;
  sub: string;
  kind: 'file' | 'folder' | 'component';
}

const DOCS: Doc[] = [
  { id: 'a', name: 'Design system', sub: 'Edited today', kind: 'folder' },
  { id: 'b', name: 'Onboarding flow', sub: 'Edited 2 days ago', kind: 'component' },
  { id: 'c', name: 'release-notes.md', sub: 'Edited last week', kind: 'file' },
  { id: 'd', name: 'Marketing site', sub: 'Edited last week', kind: 'folder' },
  { id: 'e', name: 'Icon set', sub: 'Edited in March', kind: 'component' },
  { id: 'f', name: 'architecture.md', sub: 'Edited in March', kind: 'file' },
];

const GLYPHS = { file: FileText, folder: FolderOpen, component: Layers };

function glyph(doc: Doc, size: number) {
  const Icon = GLYPHS[doc.kind];
  return <Icon size={size} />;
}

function card(doc: Doc, selected: boolean, onSelect: (id: string) => void) {
  return (
    <Card selected={selected} onSelect={() => onSelect(doc.id)} testId={`doc-${doc.id}`}>
      <span className="card__thumb">{glyph(doc, 28)}</span>
      <span className="card__meta">
        <span className="card__name">{doc.name}</span>
        <span className="card__sub">{doc.sub}</span>
      </span>
    </Card>
  );
}

function row(doc: Doc, selected: boolean, onSelect: (id: string) => void) {
  return (
    <Row selected={selected} onSelect={() => onSelect(doc.id)} testId={`doc-${doc.id}`}>
      {glyph(doc, 14)}
      <span className="row__name">{doc.name}</span>
      <span className="row__sub">{doc.sub}</span>
    </Row>
  );
}

/** The canvas with selection wired up, which is the state every caller owns. */
function Docs({
  items = DOCS,
  mode,
  initial,
  ...rest
}: {
  items?: Doc[];
  mode: 'grid' | 'list';
  initial?: string;
  gridModifier?: string;
  label?: string;
}) {
  const [selectedId, setSelectedId] = useState(initial);
  return (
    <Canvas
      items={items}
      mode={mode}
      selectedId={selectedId}
      empty={<EmptyState icon={FileText} message="Nothing here yet." />}
      renderCard={(doc, selected) => card(doc, selected, setSelectedId)}
      renderRow={(doc, selected) => row(doc, selected, setSelectedId)}
      {...rest}
    />
  );
}

const meta = {
  title: 'Layout/Canvas',
  component: Canvas,
  args: {
    items: DOCS,
    mode: 'grid',
    selectedId: undefined,
    label: 'Items',
    empty: <EmptyState icon={FileText} message="Nothing here yet." />,
    renderCard: (doc: Doc, selected: boolean) => card(doc, selected, () => undefined),
    renderRow: (doc: Doc, selected: boolean) => row(doc, selected, () => undefined),
  },
  argTypes: {
    mode: { control: 'inline-radio', options: ['grid', 'list'] },
    items: { table: { disable: true } },
    empty: { table: { disable: true } },
    renderCard: { table: { disable: true } },
    renderRow: { table: { disable: true } },
  },
  decorators: [(Story) => <div style={{ height: 420, display: 'flex' }}>{Story()}</div>],
} satisfies Meta<typeof Canvas<Doc>>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Cards, at the column width the grid template picks for the space it has. */
export const Grid: Story = {
  render: () => <Docs mode="grid" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('option')).toHaveLength(DOCS.length);
    // The tiles are options; the canvas is what makes that legal. A grid with
    // no listbox around it is the `aria-required-parent` failure, and it is the
    // story's fault rather than the component's every time.
    await expect(canvas.getByRole('listbox', { name: 'Items' })).toBeVisible();
  },
};

/** The same items as rows. `mode` is the only thing that changed. */
export const List: Story = {
  render: () => <Docs mode="list" />,
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-testid="view-list"]')).not.toBeNull();
    await expect(within(canvasElement).getAllByRole('option')).toHaveLength(DOCS.length);
  },
};

/**
 * One tile selected.
 *
 * `aria-selected` rather than a class, and that is the reason `Tile` exists:
 * the attribute is not permitted on `role="button"`, so four hand-written
 * copies of this tile were carrying it and announcing nothing. The listbox is
 * what makes the option legal, and the option is what makes the attribute
 * legal.
 */
export const Selected: Story = {
  render: () => <Docs mode="grid" initial="b" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('option', { selected: true })).toHaveAccessibleName(
      /Onboarding flow/,
    );

    // Selection is the caller's state, and clicking is the only route to it a
    // consumer gets: see the docblock on issue #171 for the keys that are not.
    await userEvent.click(canvas.getByTestId('doc-e'));
    await expect(canvas.getByRole('option', { selected: true })).toHaveAccessibleName(
      /Icon set/,
    );
  },
};

/**
 * No items.
 *
 * The canvas drops its listbox entirely rather than rendering an empty one, so
 * `empty` is a slot rather than a message: whatever the caller passes is the
 * whole of what a user sees.
 */
export const Empty: Story = {
  render: () => <Docs items={[]} mode="grid" />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('listbox')).toBeNull();
    await expect(within(canvasElement).getByText('Nothing here yet.')).toBeVisible();
  },
};

const RUNS: Doc[] = [
  { id: 'r1', name: 'refactor the provider chain', sub: 'main · claude-opus-4', kind: 'component' },
  { id: 'r2', name: 'triage the flaky terminal test', sub: 'fix/pty · claude-opus-4', kind: 'component' },
  { id: 'r3', name: 'bump the Radix dependencies', sub: 'chore/deps · claude-haiku-4', kind: 'component' },
];

/**
 * `gridModifier`, which is how a view gets columns of its own.
 *
 * The class lands beside `grid` rather than replacing it, so a caller overrides
 * the template and keeps the gap. The capture fixture does exactly this with
 * `grid--runs`, because an agent run needs a wider card than a document
 * thumbnail; that rule is in `demo.css`, which Storybook does not load, so this
 * story declares its own and the two claims — the class arrives, and it wins —
 * are both visible here.
 */
export const WideColumns: Story = {
  render: () => (
    <>
      {/* `.grid.grid--wide` rather than `.grid--wide`: the shipped stylesheet
          scopes its rule as `.sb-shell .grid`, so a single class would lose to
          it whenever the toolbar is set to package mode. */}
      <style>
        {'.grid.grid--wide { grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)) }'}
      </style>
      <Docs items={RUNS} mode="grid" gridModifier="grid--wide" label="Agent runs" />
    </>
  ),
  play: async ({ canvasElement }) => {
    const grid = canvasElement.querySelector('[data-testid="view-grid"]');
    if (!grid) throw new Error('nothing to check: no grid rendered');
    await expect(grid.className).toBe('grid grid--wide');

    // The floor. A modifier that reached the markup and matched no rule would
    // satisfy the line above while changing nothing a user can see, so the
    // resolved tracks are read rather than the class list.
    const tracks = getComputedStyle(grid).gridTemplateColumns.split(' ').map(parseFloat);
    await expect(tracks.length).toBeGreaterThan(0);
    await expect(Math.min(...tracks)).toBeGreaterThanOrEqual(320);

    await expect(within(canvasElement).getByRole('listbox', { name: 'Agent runs' })).toBeVisible();
  },
};

function SwitchableCanvas() {
  const [mode, setMode] = useState<'grid' | 'list'>('grid');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <Toolbar title="Library" mode={mode} onModeChange={setMode} />
      <Docs mode={mode} initial="a" />
    </div>
  );
}

/**
 * The canvas under the switch that drives it.
 *
 * `mode` is a prop with no default and no internal state, so this pairing is
 * what a consumer has to assemble and it is worth seeing assembled. The two
 * views are not two components: the same items, the same selection and the same
 * listbox, drawn by the other renderer.
 */
export const Switchable: Story = {
  render: () => <SwitchableCanvas />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector('[data-testid="view-grid"]')).not.toBeNull();

    await userEvent.click(canvas.getByRole('button', { name: 'List view' }));
    await expect(canvasElement.querySelector('[data-testid="view-list"]')).not.toBeNull();
    // Selection is the canvas's input, not its state, so switching renderers
    // does not touch it.
    await expect(canvas.getByRole('option', { selected: true })).toHaveAccessibleName(
      /Design system/,
    );
  },
};
