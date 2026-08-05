import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import type { ComponentType, ReactNode } from 'react';

/**
 * Things that sit above the page.
 *
 * Both are Radix, on the same rule the rest of this repository follows: hand
 * roll nothing whose accessibility is hard. A modal needs a focus trap, an
 * accessible name, `aria-modal`, and inert content behind it; a menu needs
 * roving focus and typeahead. The overlay's hand-rolled modal had none of the
 * first four.
 */

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className = 'dialog',
  overlayClassName = 'dialog__scrim',
  modal = true,
  onEscapeKeyDown,
  onPointerDownOutside,
  onOpenAutoFocus,
  testId,
}: {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The accessible name. Hidden visually when `hideTitle` is not wanted. */
  title: string;
  description?: string;
  children: ReactNode;
  /** Overridable so a document with its own card styles can keep them. */
  className?: string;
  overlayClassName?: string;
  modal?: boolean;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  onPointerDownOutside?: (event: Event) => void;
  onOpenAutoFocus?: (event: Event) => void;
  testId?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} modal={modal}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlayClassName} />
        <DialogPrimitive.Content
          className={className}
          data-testid={testId}
          onEscapeKeyDown={onEscapeKeyDown}
          onPointerDownOutside={onPointerDownOutside}
          onOpenAutoFocus={onOpenAutoFocus}
        >
          <VisuallyHidden asChild>
            <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
          </VisuallyHidden>
          {description && (
            <VisuallyHidden asChild>
              <DialogPrimitive.Description>{description}</DialogPrimitive.Description>
            </VisuallyHidden>
          )}
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export interface MenuItem {
  id: string;
  label: string;
  icon?: ComponentType<{ size?: number }>;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/** A dropdown menu. The trigger is the caller's; the popup is not. */
export function Menu({
  trigger,
  items,
  align = 'start',
  testId,
}: {
  trigger: ReactNode;
  items: MenuItem[];
  align?: 'start' | 'center' | 'end';
  testId?: string;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="menu" align={align} sideOffset={6} data-testid={testId}>
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <DropdownMenu.Item
                key={item.id}
                className={`menu__item${item.danger ? ' menu__item--danger' : ''}`}
                disabled={item.disabled}
                onSelect={item.onSelect}
                data-testid={`menu-${item.id}`}
              >
                {Icon && <Icon size={14} />}
                <span>{item.label}</span>
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
