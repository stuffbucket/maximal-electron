import * as Tooltip from '@radix-ui/react-tooltip';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  getTabPanelId,
  getTabTriggerId,
  TabBar,
} from '../src/renderer/components/TabBar.js';
import { TitleBar } from '../src/renderer/components/TitleBar.js';

const tabs = [{ id: 'one', title: 'First document' }];

describe('packaged renderer components', () => {
  it('renders injected titlebar regions with their accessible labels', () => {
    const markup = renderToStaticMarkup(
      <Tooltip.Provider>
        <TitleBar
          tabIdBase="test-documents"
          leading={<button aria-label="Open workspace switcher">W</button>}
          actions={<button aria-label="Open command palette">C</button>}
          tabs={tabs}
          activeTab="one"
          onSelectTab={vi.fn()}
        />
      </Tooltip.Provider>,
    );

    expect(markup).toContain('class="titlebar__leading"');
    expect(markup).toContain('aria-label="Open workspace switcher"');
    expect(markup).toContain('class="titlebar__actions"');
    expect(markup).toContain('aria-label="Open command palette"');
    expect(markup).not.toContain('summon overlay');
  });

  it('omits close and new-tab controls when their callbacks are absent', () => {
    const markup = renderToStaticMarkup(
      <TabBar
        tabIdBase="test-documents"
        tabs={tabs}
        active="one"
        onSelect={vi.fn()}
        label="Workspace tabs"
      />,
    );

    expect(markup).toContain('aria-label="Workspace tabs"');
    expect(markup).not.toContain('Close First document');
    expect(markup).not.toContain('data-testid="tab-new"');
  });

  it('renders close and new-tab controls when their callbacks are supplied', () => {
    const markup = renderToStaticMarkup(
      <TabBar
        tabIdBase="test-documents"
        tabs={[
          ...tabs,
          { id: 'two', title: 'Second document' },
        ]}
        active="one"
        onSelect={vi.fn()}
        onClose={vi.fn()}
        onNew={vi.fn()}
        newLabel="Create workspace tab"
      />,
    );

    expect(markup).toContain('aria-label="Close First document"');
    expect(markup).toContain('aria-label="Create workspace tab"');
    expect(markup).toContain(`id="${getTabTriggerId('test-documents', 'one')}"`);
    expect(markup).toContain(
      `aria-controls="${getTabPanelId('test-documents', 'one')}"`,
    );
    expect(markup).not.toContain('role="tabpanel"');
    expect(markup).not.toMatch(/role="tab"[^>]*>.*role="button"/s);
  });

  it('names a panel only for the tab whose panel the caller renders', () => {
    const markup = renderToStaticMarkup(
      <TabBar
        tabIdBase="test-documents"
        tabs={[...tabs, { id: 'two', title: 'Second document' }]}
        active="one"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(markup).toContain(
      `aria-controls="${getTabPanelId('test-documents', 'one')}"`,
    );
    expect(markup).not.toContain(getTabPanelId('test-documents', 'two'));
  });

  it('announces the shortcut that closes a tab, and only when one can close', () => {
    const closable = renderToStaticMarkup(
      <TabBar
        tabIdBase="test-documents"
        tabs={[...tabs, { id: 'two', title: 'Second document' }]}
        active="one"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const last = renderToStaticMarkup(
      <TabBar
        tabIdBase="test-documents"
        tabs={tabs}
        active="one"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(closable).toContain('aria-keyshortcuts="Delete"');
    expect(last).not.toContain('aria-keyshortcuts');
  });

  it('keeps the create and close controls out of the tablist', () => {
    const markup = renderToStaticMarkup(
      <TabBar
        tabIdBase="test-documents"
        tabs={[...tabs, { id: 'two', title: 'Second document' }]}
        active="one"
        onSelect={vi.fn()}
        onClose={vi.fn()}
        onNew={vi.fn()}
      />,
    );

    // A tablist may own nothing but tabs. Only the triggers are elements, and
    // none of them is a `div`, so the first closing `div` ends the list.
    const listEnds = markup.indexOf('</div>', markup.indexOf('role="tablist"'));

    expect(listEnds).toBeGreaterThan(0);
    expect(markup.indexOf('data-testid="tab-new"')).toBeGreaterThan(listEnds);
    expect(markup.indexOf('aria-label="Close First document"')).toBeGreaterThan(
      listEnds,
    );
  });
});
