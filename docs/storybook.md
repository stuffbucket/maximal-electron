# Storybook

`npm run storybook`. Stories sit beside their components as `*.stories.tsx`.

It is a developer tool: CI does not build it, for the same reason CI does not
capture stills. The cost is that a story broken by a refactor rots until
somebody opens it.

Two things it is good for that nothing else here was. A component in every state
at once, without driving the application into each one. And the light palette,
which previously only appeared by launching the shell and toggling a preference
— the toolbar switch sets `data-theme` exactly as `useThemePreference` does. It
earned itself immediately: `--elevation-dialog` was a single half-black shadow
for both schemes, which reads as depth in the dark palette and as a grey smudge
on a white page.

## Conventions

These are the ones in Storybook's own documentation.

- One story per state, not one page listing everything. `Primary`, `Disabled`,
  `Sizes` — not `All`.
- `component` on the meta points at the real component, and `args` drive it, so
  the Controls panel and the generated docs page have something to work with.
  Reach for `render` only when the output is not the component with args
  applied.
- `play` for behaviour a screenshot cannot show. The dialog's focus trap and the
  menu's arrow keys are asserted there rather than in a script that lives for
  one run.
- `tags: ['autodocs']` is global, so every component gets a docs page from its
  args and its docstring.
- `@storybook/addon-a11y` runs axe per story. It found the contrast failures in
  issue #28 within a minute of being installed.
- `npm run storybook:check` drives every story headlessly: render errors, `play`
  failures, and axe. Also a developer tool, also not in CI — but a `play`
  function nobody runs is the same problem as an end-to-end test that needs a
  model, so there is one command for it.
- Page-level axe rules are off for stories (`landmark-one-main`,
  `page-has-heading-one`, `region`). A story is a component, not a page, and a
  panel that is never green is a panel nobody reads.
- Render a component inside the context it requires. A `Card` outside a listbox
  reports `aria-required-parent`, which is the story's fault and not the
  product's.

## Two files that look like configuration and are not

`.storybook/preview-head.html` stubs `window.stuffbucket` as a classic script,
because `src/renderer/lib/bridge.ts` reads it at module scope. A stub inside
`preview.ts` would be a race against import hoisting.

`.storybook/preview.css` undoes the part of `shell.css` that assumes an
application window: the full-height, overflow-hidden rule on `html` and `body`
clips a long story at the fold.

## Stories stay out of the package

Nothing imports a story, so Vite never reaches one from an entry point.
`npm run verify:package` asserts that rather than assuming it.
