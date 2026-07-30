import * as Tabs from '@radix-ui/react-tabs';
import { Plus, SquareTerminal, X } from 'lucide-react';

export interface DocumentTab {
  id: string;
  title: string;
  /** `library` shows the file grid. `terminal` hosts a shell. */
  kind: 'library' | 'terminal';
}

/**
 * Tabbed documents, built on Radix `Tabs` so keyboard navigation, roving focus,
 * and ARIA wiring come for free rather than being hand-rolled.
 *
 * This component renders the tab strip only. `App.tsx` renders the active
 * document, because the canvas is shared across tabs.
 */
export function TabBar({
  tabs,
  active,
  onSelect,
  onClose,
  onNew,
}: {
  tabs: DocumentTab[];
  active: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <Tabs.Root
      value={active}
      onValueChange={onSelect}
      className="tabs"
      activationMode="manual"
    >
      <Tabs.List className="tabbar" aria-label="Open documents">
        {tabs.map((tab) => (
          <Tabs.Trigger key={tab.id} value={tab.id} className="tab">
            {tab.kind === 'terminal' && <SquareTerminal size={13} />}
            <span className="tab__label">{tab.title}</span>
            {tabs.length > 1 && (
              <span
                role="button"
                tabIndex={-1}
                aria-label={`Close ${tab.title}`}
                className="tab__close"
                onPointerDown={(event) => {
                  // Stop the trigger from activating before the close lands.
                  event.stopPropagation();
                  event.preventDefault();
                  onClose(tab.id);
                }}
              >
                <X size={12} />
              </span>
            )}
          </Tabs.Trigger>
        ))}
        <button
          type="button"
          className="tab__new"
          onClick={onNew}
          aria-label="New terminal tab"
          data-testid="tab-new"
        >
          <Plus size={14} />
        </button>
      </Tabs.List>
    </Tabs.Root>
  );
}
