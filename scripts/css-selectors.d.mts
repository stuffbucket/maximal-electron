/**
 * Types for `css-selectors.mjs`.
 *
 * The scripts in this directory run under plain Node, outside the TypeScript
 * program, which is why `eslint.config.mjs` treats them separately.
 */

/** Every individual selector in a stylesheet, in source order. */
export declare function selectors(css: string): string[];
/** Whether a selector is confined to a root class. */
export declare function isScoped(selector: string, root: string): boolean;
/** Every selector in a stylesheet that escapes the root class. */
export declare function unscopedSelectors(css: string, root: string): string[];
