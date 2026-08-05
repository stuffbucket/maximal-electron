import * as Tooltip from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';

/**
 * Buttons.
 *
 * Before this there was no button. There were five hand-rolled ones: two
 * inspector actions wearing `className="row"` (the dense-list-row class), the
 * overlay's `.approval__button`, and the fixture's `.approval__allow` and
 * `.approval__deny` — the last two being different names for the same thing in
 * stylesheets that cannot see each other.
 */

export type ButtonVariant = 'default' | 'primary' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export function Button({
  children,
  onClick,
  variant = 'default',
  size = 'md',
  disabled,
  block,
  type = 'button',
  testId,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  /** Fill the width of the container. */
  block?: boolean;
  type?: 'button' | 'submit';
  testId?: string;
}) {
  const classes = ['btn', `btn--${variant}`, `btn--${size}`];
  if (block) classes.push('btn--block');

  return (
    <button
      type={type === 'submit' ? 'submit' : 'button'}
      className={classes.join(' ')}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

/**
 * An icon button with a tooltip.
 *
 * Radix `Tooltip.Root` needs a `Tooltip.Provider` above it. `ShellLayout`
 * supplies one; the overlay document does not, and forgetting it renders
 * nothing rather than throwing. Use `Button` there.
 */
export function IconButton({
  label,
  onClick,
  children,
  active,
  danger,
  disabled,
  testId,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
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
          disabled={disabled}
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
