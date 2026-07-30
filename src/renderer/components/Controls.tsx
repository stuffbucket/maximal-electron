import * as Tooltip from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';

/** An icon button with a tooltip. Used across the title bar and toolbars. */
export function IconButton({
  label,
  onClick,
  children,
  active,
  danger,
  testId,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
  danger?: boolean;
  testId?: string;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          className={`icon-button${danger ? ' icon-button--danger' : ''}`}
          onClick={onClick}
          aria-label={label}
          data-active={active ? 'true' : undefined}
          data-testid={testId}
        >
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" sideOffset={6}>
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** A labelled switch that mirrors maximal's `Switch` component contract. */
export function Switch({
  label,
  checked,
  onChange,
  testId,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      className="switch"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      data-testid={testId}
    >
      <span>{label}</span>
      <span className="switch__track" data-on={checked}>
        <span className="switch__thumb" />
      </span>
    </button>
  );
}
