/**
 * Types for `package-contract.mjs`.
 *
 * The scripts in this directory run under plain Node, outside the TypeScript
 * program, which is why `eslint.config.mjs` treats them separately.
 */

/**
 * Fuse names, with the value the packaged binary must carry. Deliberately not
 * narrowed to the six names present: a seventh belongs in the module, not in
 * two places again.
 */
export declare const PACKAGE_FUSES: Readonly<Record<string, boolean>>;

export declare const RUNTIME_ICONS: readonly string[];
