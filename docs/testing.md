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

## The packaged application answers for itself

`npm run test:e2e` drives the unpackaged build, because
`EnableNodeCliInspectArguments: false` stops Playwright attaching to a packaged
one. That fuse stays as it is. Until now nothing launched the artifact a user
installs, and two defects shipped inside it: #86 and #88. `verify-package.mjs`
reads the archive listing, which finds a file that is absent and not one that
is present where the loader cannot reach it.

`npm run package && npm run smoke:packaged` closes the macOS half.
`scripts/smoke-packaged.mjs` launches
`Stuffbucket.app/Contents/MacOS/Stuffbucket` with `--self-check=terminal` and a
token. The application opens a shell through `TerminalHost`, the same class the
terminal uses, makes it print the token, writes one line, and exits with a
code. `src/main/native/self-check.ts` holds the argument protocol, and
`tests/self-check.test.ts` pairs it with the driver's copy of the strings.

Three properties are what stop it passing for nothing:

- **The token is random per run.** It reaches the driver only through a shell
  that ran `printf`, so a launch that opens no shell cannot produce one.
- **The command carries the token in two halves.** A pty echoes what is written
  to it, so a command containing the whole token would satisfy the assertion
  from that echo, with nothing having run.
- **Every run reproduces #88.** The driver moves `spawn-helper` out of
  `app.asar.unpacked` and launches again. That run has to fail, and it has to
  fail by reporting the shell rather than by dying before the check. Then the
  file goes back.

The check runs before `whenReady` and opens no window, so it needs no window
server and no signed binary. `package (macos-latest)` runs it.

What it leaves uncovered: no window, no renderer, and no IPC. It says nothing
about the Windows or linux packages, and nothing about a signed or notarised
bundle. Run it on the package Forge produces, which carries an ad-hoc signature
that `codesign --verify` already rejects because packager rewrites `Info.plist`
afterwards. Signing happens later, in stuffbucket/macos-runner, and moving a
file inside a bundle that has been signed properly would break its seal.

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

## Techniques rejected, with the reason

Each of these was investigated against this repository and turned down. They
are recorded because the argument is the expensive part, and because a
technique with no stated rejection gets proposed again every six months.

Each one would also run, print green, and check less than what is already
here. That is worse than not having it, because a green run reads as verified.

- **Do not diff `demo/stills` for equality**, in Playwright's
  `toHaveScreenshot` or anything else, and call it a regression gate. A pixel
  diff reads as "layout unchanged" on a still that is bistable for reasons
  unrelated to the change under review. That is the empty-scope failure wearing
  a different tool: a check that returns green because it quietly stopped
  checking the thing that matters. See "A still is not an oracle" above.
- **Do not put Storybook in CI**, through the test runner or its successor the
  Vitest addon. Both turn every story into a gating test, which reopens the
  choice `docs/storybook.md` already made and defended: a workshop tool does
  not gate a pull request, and a story broken by a refactor is allowed to rot
  until somebody opens it. The newer tool is the same decision by another name.
- **Do not adopt Playwright component testing** as a second mounting harness.
  The components worth protecting are the ones with `play` functions — the
  roving keyboard navigation on the tab strip and the title bar, and the
  generic dialog pattern. Porting each specific assertion into the end-to-end
  suite that already runs closes the same gap without a second framework that
  knows how to render them.
- **Do not add a coverage percentage gate on top of `npm run mutate`.** Line
  coverage answers "did this execute", which a 100 mutation score subsumes and
  exceeds. It is a second number to chase carrying less information than the
  first. It could mean something on the modules Stryker cannot reach, but that
  is a different scope, and even there it proves execution rather than
  correctness.
- **Do not turn on Stryker's incremental mode.** It works, and its own
  documentation is explicit that it can carry a stale "killed" result forward
  when a change falls into one of its blind spots: an environment change, a
  dependency bump, or a runner that reports coverage per file rather than per
  test location, which Vitest does. A mode that can report 100 against data it
  did not re-run is the same failure in a faster package. The minute this step
  costs is the honest price of a gate that means what it says.
- **Do not run `fast-check` over a domain the tests already enumerate.**
  `escapeAction` takes two booleans and its whole input domain is four values.
  Generating inputs for that is exhaustive testing done slower, with a
  dependency to show for it. The numeric core of `src/renderer/lib/contrast.ts`
  is the one place a continuous domain makes it pay.

### Infrastructure rejected for the same question

A run drives a real application on the developer's desktop, and the answer was
two guards in this repository rather than a machine. These were the
alternatives.

- **A separate macOS Space is not reachable.** `NSWindow` exposes a collection
  behaviour for a window the process already shows, and nothing in AppKit lets
  a process open a window on a Space it is not on. Every tool that does this
  reaches a private, undocumented API, and some of those commands need System
  Integrity Protection turned off. That is not a foundation for a test suite.
- **A container or a Linux virtual machine tests the wrong platform.** Every
  option available here runs a Linux guest only. The overlay's non-activating
  panel, the dock, and the packaging assertions are all macOS behaviour a Linux
  guest cannot exercise at all, so this trades "off the desktop" for "untested
  on the platform most of the native code targets".
- **A virtual display driver changes nothing that matters.** It adds a monitor
  inside the session the developer is already logged into. It is a fancier
  version of `quietBounds`, at the cost of a third-party dependency, and it
  leaves the dock and the activation alone because it is the same user.
- **Offscreen rendering was not tried, and is not free.** An offscreen window
  is always frameless, so the traffic lights the stills exist partly to show
  would never appear, and it needs a second window-construction path kept in
  step with the real one. Whether the debugger capture path can read an
  offscreen surface at all is unknown.

A second macOS user account, logged in through Fast User Switching, is the one
alternative that was not ruled out: it has its own fully composited session,
independent of the primary user. It was never tried here, and it stopped being
worth trying once `focusWindow` and `setDockVisible` learned to return early.
Treat it as a spike rather than a fix if the question comes back.
