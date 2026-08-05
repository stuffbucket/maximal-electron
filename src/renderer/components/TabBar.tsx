import * as Tabs from '@radix-ui/react-tabs';
import { Plus, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';

/**
 * One tab. What it tabs is the caller's business.
 *
 * This carried a `kind` of `library | terminal | run` and a `state` union
 * copied by hand from the capture fixture's `RunStatus`. Neither belonged to a
 * tab strip: `kind` only ever selected an icon, and `run` was a concept from a
 * fixture that the product had no idea about.
 */
export interface Tab {
  id: string;
  title: string;
  /** Optional status dot. The stylesheet colours the ones it knows. */
  status?: string;
}

/**
 * Everything needed to drive a tab strip.
 *
 * Declared once because three components in a row forward it: `ShellLayout`
 * takes it, hands it to `TitleBar`, which hands it to `TabBar`.
 */
export interface TabStripProps<T extends Tab> {
  tabs: T[];
  activeTab: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTab: () => void;
  /** Only one tab strip on a page can be the primary one. */
  tabsLabel?: string;
  newTabLabel?: string;
  /** Optional leading icon per tab. */
  tabIcon?: (tab: T) => ComponentType<{ size?: number }> | undefined;
}

/**
 * A tab strip, built on Radix `Tabs` so keyboard navigation, roving focus, and
 * ARIA wiring come for free rather than being hand-rolled.
 *
 * This renders the strip only. The caller renders the active document, because
 * what a tab points at is not something a strip can know.
 */
/**
 * Whether a label is wider than the room it has.
 *
 * The fade has to be measured, not assumed. A mask applied unconditionally
 * fades any text that happens to end near the right edge, so `Terminal 1`
 * rendered as `Terminal` in a tab with room to spare — the mask cannot tell
 * "reaches the edge" from "overflows it".
 *
 * Re-measured on resize, because a tab shrinks as the strip fills.
 */
function useTruncated(): [
  (element: HTMLElement | null) => void,
  boolean,
] {
  const [truncated, setTruncated] = useState(false);
  const node = useRef<HTMLElement | null>(null);

  const measure = useCallback(() => {
    const element = node.current;
    if (element) setTruncated(element.scrollWidth > element.clientWidth);
  }, []);

  const ref = useCallback(
    (element: HTMLElement | null) => {
      node.current = element;
      measure();
    },
    [measure],
  );

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const element = node.current;
    if (!element) return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure]);

  return [ref, truncated];
}

/** One tab's label, faded only when it does not fit. */
function TabLabel({ title }: { title: string }) {
  const [ref, truncated] = useTruncated();
  return (
    <span className="tab__label" ref={ref} data-truncated={truncated || undefined}>
      {title}
    </span>
  );
}

export function TabBar<T extends Tab>({
  tabs,
  active,
  onSelect,
  onClose,
  onNew,
  icon,
  label = 'Open documents',
  newLabel = 'New tab',
}: {
  tabs: T[];
  active: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  /** Optional leading icon per tab. */
  icon?: (tab: T) => ComponentType<{ size?: number }> | undefined;
  label?: string;
  newLabel?: string;
}) {
  return (
    <Tabs.Root
      value={active}
      onValueChange={onSelect}
      className="tabs"
      activationMode="manual"
    >
      <Tabs.List className="tabbar" aria-label={label}>
        {tabs.map((tab) => {
          const Icon = icon?.(tab);
          return (
            <Tabs.Trigger key={tab.id} value={tab.id} className="tab">
              {Icon && <Icon size={13} />}
              {tab.status && <span className="dot" data-status={tab.status} />}
              <TabLabel title={tab.title} />
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
          );
        })}
        <button
          type="button"
          className="tab__new"
          onClick={onNew}
          aria-label={newLabel}
          data-testid="tab-new"
        >
          <Plus size={14} />
        </button>
      </Tabs.List>
    </Tabs.Root>
  );
}
