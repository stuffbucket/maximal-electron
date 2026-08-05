import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import * as Tooltip from '@radix-ui/react-tooltip';
/**
 * Anything not named here is forwarded to the `<button>`, including `ref`.
 *
 * That is not tidiness. Radix's `asChild` clones its child and hands it props
 * and a ref, so a button that accepts only its own props silently drops them:
 * `Menu` rendered a trigger that did nothing at all, and the story that would
 * have caught it was itself passing for the wrong reason. A primitive that
 * cannot be composed is not a primitive.
 */
export function Button({ children, variant = 'default', size = 'md', block, type = 'button', testId, className, ...rest }) {
    const classes = ['btn', `btn--${variant}`, `btn--${size}`];
    if (block)
        classes.push('btn--block');
    if (className)
        classes.push(className);
    return (_jsx("button", { ...rest, type: type === 'submit' ? 'submit' : 'button', className: classes.join(' '), "data-testid": testId, children: children }));
}
/**
 * An icon button with a tooltip.
 *
 * Radix `Tooltip.Root` needs a `Tooltip.Provider` above it. `ShellLayout`
 * supplies one; the overlay document does not, and forgetting it renders
 * nothing rather than throwing. Use `Button` there.
 */
export function IconButton({ label, children, active, danger, testId, ...rest }) {
    return (_jsxs(Tooltip.Root, { children: [_jsx(Tooltip.Trigger, { asChild: true, children: _jsx("button", { ...rest, type: "button", className: `icon-button${danger ? ' icon-button--danger' : ''}`, "aria-label": label, "data-active": active ? 'true' : undefined, "data-testid": testId, children: children }) }), _jsx(Tooltip.Portal, { children: _jsx(Tooltip.Content, { className: "tooltip", sideOffset: 6, children: label }) })] }));
}
