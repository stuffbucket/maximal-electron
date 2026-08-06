# The `--shell-*` contract

`stuffbucket-electron/renderer/styles.css` ships no palette. Every colour,
space, radius, and height in it comes from a custom property the host defines,
and this document is the list of them.

The list is derived, not written. `scripts/shell-variables.mjs` parses
`var(--shell-…)` out of the stylesheets `packageStylesheets` names, and
`tests/shell-variables.test.ts` compares the result against the tables below in
both directions. A variable added to a rule and left out of a table fails, and
so does a row nothing reads.

## Why this exists

A hand-maintained list drifts. `stuffbucket/maximal` maintains 57 lines of
`client/src/renderer/styles/shell-adapter.css` by reading our source. Measured
against `release/0.0.4`, it sets 49 names, of which 27 are ones nothing here
reads, and it leaves 7 of ours unset: `--shell-danger`,
`--shell-danger-contrast`, `--shell-nav-heading-height`, `--shell-status`,
`--shell-terminal-background`, `--shell-terminal-cursor`, and
`--shell-terminal-foreground`. Six of the seven arrived after their pin. Every
one of the eleven `required` variables is set, so the drift renders a plausible
shell rather than a broken one, which is why nothing on either side said so.
Issue #93.

## The three kinds

| Kind | Read as | Unset renders |
| --- | --- | --- |
| `required` | `var(--shell-x)` in at least one rule | nothing: a transparent surface or an inherited colour |
| `fallback` | only ever `var(--shell-x, …)` | the fallback in the table |
| `runtime` | resolved by JavaScript, in no rule | the emulator's own default |

The kind is a property of the CSS, not a judgement. A `fallback` variable that
gains a rule with no fallback becomes `required`, and the check fails until the
table says so.

## Required

Define all eleven. `ShellLayout` applies the `.sb-shell` root class; define them
on that container or an ancestor. README.md carries the same table with the
description of what each one draws.

| Variable |
| --- |
| `--shell-accent` |
| `--shell-accent-muted` |
| `--shell-active` |
| `--shell-background` |
| `--shell-border` |
| `--shell-canvas` |
| `--shell-hover` |
| `--shell-raised` |
| `--shell-text` |
| `--shell-text-muted` |
| `--shell-text-subtle` |

## Fallback

Each of these has a value in the CSS. Set one when the design system differs
from it. Three fall back to another `--shell-*` rather than to a literal, which
is where legibility survives an unset value but meaning does not:
`--shell-danger` resolving to `--shell-hover` draws a destructive control that
looks exactly like an ordinary hovered one.

| Variable | Fallback | Drawn by |
| --- | --- | --- |
| `--shell-border-strong` | `--shell-border` | tooltip outline |
| `--shell-control-height` | `28px` | icon button box |
| `--shell-danger` | `--shell-hover` | destructive icon button, hovered |
| `--shell-danger-contrast` | `--shell-text` | destructive icon button glyph |
| `--shell-focus` | `--shell-accent` | focus ring on every control |
| `--shell-font` | `400 14px/1.5 system-ui, sans-serif` | the shell's whole type |
| `--shell-nav-heading-height` | `24px` | the space a collapsed `NavRail` keeps for a section heading |
| `--shell-radius` | `6px` | buttons, tabs, nav items |
| `--shell-radius-small` | `4px` | tab close affordance, tooltip |
| `--shell-space-1` | `4px` | nav section gaps |
| `--shell-space-2` | `8px` | control gaps, terminal padding |
| `--shell-space-3` | `12px` | title bar and status bar padding, grid gaps |
| `--shell-space-4` | `16px` | canvas padding, nav section spacing |
| `--shell-status` | `--shell-text-subtle` | the status dot |
| `--shell-terminal-background` | `--shell-canvas` | the terminal's own surface |
| `--shell-titlebar-height` | `40px` | the title bar row of the application grid |

## Runtime

`ghostty-web` draws to a canvas, inherits nothing from CSS, and takes literal
colours at construction. `readTerminalTheme` resolves these through
`SHELL_TERMINAL_PROPERTIES`, so no rule mentions them and grep over the CSS
alone would miss them. A property that does not resolve is left out rather than
passed through empty, because the emulator parses an unrecognised colour to
black.

| Variable | Drawn by |
| --- | --- |
| `--shell-terminal-cursor` | terminal cursor |
| `--shell-terminal-foreground` | terminal text |

`--shell-terminal-background` is read both ways and is listed above, under its
CSS kind.

## Assert against it from a consuming application

`stuffbucket-electron/verify/shell-variables` is pure and imports no
`electron`, so it runs under plain `node`. Point it at the stylesheet the
package ships and at whatever your application defines. Nothing is
hand-transcribed on either side, so the two cannot drift.

```js
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import {
  failedShellVariableChecks,
  shellVariableContract,
} from 'stuffbucket-electron/verify/shell-variables';

const require = createRequire(import.meta.url);
const css = readFileSync(require.resolve('stuffbucket-electron/renderer/styles.css'), 'utf8');

const contract = shellVariableContract({
  stylesheets: [{ name: 'styles.css', css }],
  runtimeProperties: [
    '--shell-terminal-background',
    '--shell-terminal-foreground',
    '--shell-terminal-cursor',
  ],
});

const adapter = readFileSync('src/renderer/styles/shell-adapter.css', 'utf8');
const defined = new Set(
  [...adapter.matchAll(/^\s*(--shell-[a-z0-9-]+)\s*:/gm)].map((match) => match[1]),
);

const missing = contract.required.filter((name) => !defined.has(name));
if (missing.length > 0) throw new Error(`unset: ${missing.join(', ')}`);
```

`shellVariableChecks` is the stricter form, and returns a `{ name, ok }` list in
the shape `stuffbucket-electron/verify` uses. `failedShellVariableChecks` names
the ones that did not hold.

Both start with floors: an empty stylesheet list, an empty derived contract, or
a contract with no required variable fails. A parser that stops matching would
otherwise report a complete contract over nothing.

## Why there is no defaults layer

A `:root { --shell-text: … }` block would make an unset variable degrade
legibly. It was rejected, for three reasons.

**It would hide the drift this contract exists to surface.** An unpublished
variable that resolves to a default renders a plausible shell, which is the
failure mode of the last two years of this seam: never an error, only a slightly
wrong picture. Defaults and a drift check pull in opposite directions, and the
check is the thing a consumer cannot write for themselves.

**The variables where a default would help already have one.** All sixteen
`fallback` entries above carry their value in the rule that reads them, next to
the property it sets, where it is visible to anyone reading that rule. A
separate layer would restate them, and the two would drift. The eleven
`required` variables are the ones with no default — and they are a palette. A
default palette is what `structural.css` deliberately does not ship;
`tests/package-styles.test.ts` asserts the file declares no token of its own for
exactly that reason.

**A default palette has to pass contrast, and this repository cannot yet check
that it does.** `CONTRAST_PAIRS` in `src/renderer/lib/contrast.ts` covers the
shell's own tokens, not the `--shell-*` namespace, and it skips any pair whose
colours it cannot parse — so a defaulted `--shell-text` on a defaulted
`--shell-background` would be checked by nothing that runs today. Issue #65 is
the known hole: a pair written as `rgb(r g b / a)` composites against a surface
`checkPalette` cannot see, so the tints are outside the contract entirely.
Shipping a palette before that closes would be shipping colours nothing has
measured.

The consumer keeps the choice and the check keeps the list honest. That is a
better trade than a palette nobody chose.

## Adding a variable

1. Write the rule.
2. Add the row to the table above, and to README.md if it is `required`.
3. `npm test`. The check names any variable that is read and not published, or
   published and not read.

Neither step is optional and neither is a comment. The table is compared to the
CSS on every run.
