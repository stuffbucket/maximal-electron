# Testing

`docs/architecture.md` lists the three layers and what each covers. This
document holds the rules an agent needs when writing or reading a test here.

## Tests run in a random order

Both suites shuffle. A suite that only passes in declaration order is hiding
shared state. These specs share one Electron application, which makes that easy
to do by accident. It has already happened here once.

- **No test may depend on another.** Set up what you need inside the test.
- `e2e/harness.ts` exports `resetShell`, called from `beforeEach`. Extend it
  when you add state that leaks between tests.
- Both suites print a seed. `VITEST_SEED` and `E2E_SEED` replay a failing order.
- `E2E_SHUFFLE=0` restores declaration order while debugging.

Known cost: the end-to-end tests all register from one call site, so the
reporter shows the same source line for each. Names stay unique, and `--grep`
still works.

## Mutation testing

`npm run mutate` reports what the tests actually catch, which coverage does not.
It is scoped to pure-logic modules, and **it breaks below 100**.

Stryker cannot mutate anything importing `electron`: that code needs a real
Electron runtime, not Node. Extend `mutate` in `stryker.conf.json` only with
modules that run under plain Node.

A surviving mutant is a real gap. It found one here: `src/renderer/lib/data.ts`
scored 0 with 77 untouched mutants, because it had no unit tests at all.

### Reaching 100 again after you add code

The threshold is 100, so a new module has to get there before it lands. Three
moves, in order of preference:

1. **Write the test.** Most survivors are real. If a mutant lives, ask what
   behaviour it changed and whether anything asserts that behaviour.
2. **Delete the unreachable branch.** `noUncheckedIndexedAccess` forces a
   fallback on every index read, and a fallback that can never run is dead code
   that reads as untested. `cycle` in `data.ts` and `firstLine` in `ffmpeg.ts`
   both exist to remove one. Prefer this to a suppression.
3. **Suppress, with the reason.** Only for a mutant that provably cannot change
   behaviour. Use `// Stryker disable next-line <Mutator>: why`, and state the
   evidence, not the conclusion. There are two in the repository. Read them
   before you write a third.

Never lower the threshold to make a change fit.

## User interface changes

Green unit tests are necessary but not sufficient for a layout change.

Assert **computed** layout in a real engine, and look at the screenshot. See
`.claude/skills/verify-ui/SKILL.md`. This rule comes from maximal's
`ui-layout-verification` skill, which exists because two real regressions
shipped past a green suite.

Use `capture` from `e2e/harness.ts` rather than `page.screenshot`. macOS stops
giving an occluded window frames. The plain call then hangs until its timeout.
That reproduced against the overlay under seed 587000642. `capture` reads the
renderer through the debugger, which does not care what is in front.

### A still is not an oracle

`demo/stills/*.png` are artifacts to look at. Do not diff them for equality and
read the result as proof a change was neutral.

They are bistable. Running `npm run stills` three times over identical code
produced state A once and state B twice, differing by 179,000 pixels — around
four percent of the frame — in the canvas region of `01-projects` and
`03-multi-agent-tabs`. A separate 5,024-pixel floor is the macOS traffic lights,
which are coloured or grey depending on whether the window was key.

This was learned the expensive way: a pixel difference was attributed to a CSS
change, bisected to a single rule, and that rule then turned out to match zero
elements in the fixture under a DOM probe. The instrument was the variable.

For a renderer change, the evidence is a computed-layout assertion in a real
engine, and for a stylesheet change, a text diff of the built CSS in
`.vite/renderer/*/assets/*.css`. Both are deterministic. The images are for a
human to look at afterwards.

## The suite stays off the screen

A run drives a real application on the developer's desktop. Left alone, the
overlay paints over their full-screen editor and takes the keyboard, once per
scenario. So a test run parks its windows off the side of the display.

- `isE2EQuiet` and `quietBounds` in `src/main/native/preferences.ts` decide
  this. Quiet is the default. `STUFFBUCKET_E2E_VISIBLE=1` shows a run.
- **Move windows, never hide them.** `setOpacity(0)` also makes a run invisible,
  and it stops the compositor producing content. Every reference screenshot came
  back blank white while the suite stayed green.
- Both windows set `backgroundThrottling: false`. An off-screen window reads as
  occluded to macOS, and Chromium then throttles the renderer to that same blank
  result.
- `capture` fails when an image falls under `MIN_BYTES_PER_PIXEL`, in
  `e2e/screenshot.ts`. That guard exists because the blank captures above looked
  exactly like success. It measures compressed bytes per pixel rather than a
  byte count, because an absolute floor is a pixel-density constant and failed
  real Windows screenshots.
- **A quiet run takes no focus and puts no icon in the dock.** `focusWindow` and
  `setDockVisible` both return early. Nothing under test asserts either, because
  Playwright dispatches input through the debugger rather than the window
  server.

### No specification needs a real frame

`e2e/*.spec.ts` never calls `capture`. Every assertion goes through a Playwright
locator, `getComputedStyle`, or `getBoundingClientRect`, none of which need the
window composited. Only `*.stills.ts` and the recorder need real pixels, and
both are outside `playwright.config.ts` and outside CI.

So the suite that runs constantly does not need to be seen. If it is visible on
your desktop, that is a leak worth fixing rather than a requirement.

### The overlay is the worst of it

Everything that makes the overlay good at being an overlay makes it hostile to
the machine running the suite. It sits above full screen applications, follows
the user across spaces, covers the whole display, and takes key input. A run
then flashes over whatever the user is doing and pulls focus out of their
editor, once per scenario.

None of that is needed to test it. Playwright dispatches input through the
debugger rather than the window server, and `capture` reads the renderer rather
than the screen. So `applyStacking` in `src/main/windows/overlay.ts` quiets it
under `STUFFBUCKET_E2E`: the window still shows, still reports visible, and
still lays out exactly as it does in production.

## Three directories say "demo"

They are not the same thing, and the names are a trap.

| Path | What it is |
| --- | --- |
| `demo/` | Output. Committed stills, mp4 files, and the `edits/*.json` that cut them. |
| `e2e/demo/` | The recorder. Generic capture, compose, and encode machinery. |
| `e2e/fixtures/demo-shell/` | The fixture itself: the fake agent fleet and the components that render it. Its own renderer entry point, excluded from the package. |

The fixture may import from `src/`. The product may not import from `e2e/` —
ESLint enforces that, because one import the wrong way puts the fixture back
into the bundle a user installs.

`e2e/demo/*.demo.ts` are timelines, not tests. Four configurations match four
suffixes: `.demo.ts` records, `.compose.ts` cuts, `.stills.ts` photographs,
`.spec.ts` gates. Do not merge them.

## The capture fixture is not always built

`npm run package` builds `demo_window` alongside the application, and
`forge.config.ts` then excludes it from the package. `verify-package.mjs`
asserts that exclusion, which is why the default builds it: a check that the
fixture is absent proves nothing if the fixture was never made.

`STUFFBUCKET_SKIP_FIXTURE=1` drops it. CI sets that on the end-to-end job only,
where no spec reaches the fixture and `verify:package` does not run. Leave it
unset anywhere `npm run stills` or `npm run record` follows.
