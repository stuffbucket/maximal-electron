/**
 * Types for `css-selectors.mjs`.
 *
 * The scripts in this directory run under plain Node, outside the TypeScript
 * program, which is why `eslint.config.mjs` treats them separately.
 */

/** A selector, and whether a conditional at-rule encloses the rule it opens. */
export interface SelectorRule {
  selector: string;
  conditional: boolean;
}

/** Every selector in a stylesheet, with the conditions around each. */
export declare function selectorRules(css: string): SelectorRule[];
/** Every individual selector in a stylesheet, in source order. */
export declare function selectors(css: string): string[];
/** Every class a stylesheet writes a rule for. */
export declare function styledClassNames(css: string): string[];
/** Every class a stylesheet styles under `root` and under nothing else. */
export declare function baseStyledClassNames(css: string, root: string): string[];
/** Whether a selector is confined to a root class. */
export declare function isScoped(selector: string, root: string): boolean;
/** Every selector in a stylesheet that escapes the root class. */
export declare function unscopedSelectors(css: string, root: string): string[];
