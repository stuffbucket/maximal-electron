/**
 * Types for `docs-claims.mjs`.
 *
 * The scripts in this directory run under plain Node, outside the TypeScript
 * program, which is why `eslint.config.mjs` treats them separately. This
 * declaration exists so the unit tests keep their types without dragging the
 * script into a build step.
 */

export declare function withoutFences(text: string): string;
export declare function codeSpans(text: string): string[];
export declare function npmScripts(text: string): string[];
export declare function npmScriptsOutOfScope(text: string): number;
export declare function repoPaths(text: string, roots: string[]): string[];
export declare function constants(text: string): string[];
export declare function links(text: string): string[];
