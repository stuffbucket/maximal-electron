import type { ComponentPropsWithRef, ReactNode } from 'react';
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
/**
 * Anything not named here is forwarded to the `<button>`, including `ref`.
 *
 * That is not tidiness. Radix's `asChild` clones its child and hands it props
 * and a ref, so a button that accepts only its own props silently drops them:
 * `Menu` rendered a trigger that did nothing at all, and the story that would
 * have caught it was itself passing for the wrong reason. A primitive that
 * cannot be composed is not a primitive.
 */
export declare function Button({ children, variant, size, block, type, testId, className, ...rest }: {
    children: ReactNode;
    variant?: ButtonVariant;
    size?: ButtonSize;
    /** Fill the width of the container. */
    block?: boolean;
    testId?: string;
} & Omit<ComponentPropsWithRef<'button'>, 'type'> & {
    type?: 'button' | 'submit';
}): import("react").JSX.Element;
/**
 * An icon button with a tooltip.
 *
 * Radix `Tooltip.Root` needs a `Tooltip.Provider` above it. `ShellLayout`
 * supplies one; the overlay document does not, and forgetting it renders
 * nothing rather than throwing. Use `Button` there.
 */
export declare function IconButton({ label, children, active, danger, testId, ...rest }: {
    label: string;
    children: ReactNode;
    active?: boolean;
    danger?: boolean;
    testId?: string;
} & ComponentPropsWithRef<'button'>): import("react").JSX.Element;
