# AGENTS.md

Instructions for coding agents working in this repository. Read this before
you change anything. `CLAUDE.md` points here.

The style of this file follows `openai/codex`: it states rules, not
background. If a rule looks arbitrary, the reason is in the linked document.

## Commands

| Task | Command |
| --- | --- |
| Run the app | `npm start` |
| Lint | `npm run lint`, `npm run lint:fix` |
| Types | `npm run typecheck` |
| Unit tests | `npm test` |
| Mutation tests | `npm run mutate` |
| End-to-end tests | `npm run package && npm run test:e2e` |
| Record a demo | `npm run package && npm run record` |
| Re-cut a demo | `npm run compose -- <name>` |
| Capture reference images | `npm run package && npm run stills` |
| Package | `npm run package` |
| Verify a package | `npm run verify:package` |
| Verify the docs | `npm run verify:docs` |
| Regenerate icons | `npm run icons` |

Run `npm run lint:fix` after you change code. Do not ask first.

Run `npm run typecheck` and `npm test` before you report a change as done.

## The IPC contract

`src/shared/ipc.ts` is the single source of truth for every channel and event.

- Declare a channel there first. Then handle it in `src/main/ipc.ts`.
- The handler map is `Record<IpcChannel, ...>`. A missing handler is a compile
  error. Keep it that way.
- Add the channel name to `IPC_CHANNELS`, and the event name to `IPC_EVENTS`.
  The exhaustiveness proof at the bottom of the file fails if you forget.
- **Never** expose `ipcRenderer` through `contextBridge`. The renderer gets
  `invoke` and `on`, both of which reject a name outside the contract.
- Main sends events through `sendEvent` in `src/main/ipc.ts`, not through raw
  `webContents.send`.

Use `.claude/skills/add-ipc-channel/SKILL.md` for the full walk-through.

## Security invariants

Do not relax any of these. Each one is load-bearing.

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` on every
  window.
- DevTools open only when `MAIN_WINDOW_VITE_DEV_SERVER_URL` has a value.
- `shell:open-external` validates the protocol against an allow-list. Do not
  widen it beyond `http`, `https`, and `mailto`.
- `setWindowOpenHandler` denies, and `will-navigate` blocks cross-origin
  navigation. Both send the URL to the real browser instead.

## Fuses

`forge.config.ts` fuses the packaged binary. Two rules:

1. A change to `FusesPlugin` invalidates an existing signature. Say so in the
   pull request, because the macOS build must be redone.
2. `scripts/verify-package.mjs` holds a copy of the expected values. Change
   both, in the same commit, or the check passes on a stale expectation.

`EnableNodeCliInspectArguments: false` is why the end-to-end tests drive the
unpackaged build. Playwright attaches through the Node inspector, which that
fuse disables. Do not "fix" the tests by turning the fuse back on.

## Terminals

- `@lydell/node-pty` is native and **must stay external** to the Vite bundle.
  It is listed in `vite.main.config.ts`.
- Because it is external, `forge.config.ts` supplies its own
  `packagerConfig.ignore`. Forge's Vite plugin would otherwise exclude all of
  `node_modules`, which silently ships a package with no terminal.
- Adding another external native module means editing three places: the Vite
  external list, the `ignore` filter, and `scripts/verify-package.mjs`.
- Never unmount a terminal to hide it. Use `hidden`. A remount kills the shell.

## The overlay agent

It runs the pi coding agent: `@earendil-works/pi-ai` for the provider, and
`@earendil-works/pi-agent-core` for the loop and tools. Both at `^0.83.0`.
They come from `badlogic/pi-mono`. `badlogic/pi` is a different project, a
vLLM deployment CLI, and is easy to vendor by mistake.

- **Never add an API key.** Discovery finds maximal or Ollama on localhost. A
  key in this repository is a defect.
- The tool bridge in `buildTools` exists because `AgentHarnessTool.execute`
  takes its context as a fifth argument, and plain `Agent` does not pass one.
  Do not "simplify" it away.
- Tools give the agent a shell. Keep that behind the `agentTools` preference.
- A run streams. `overlay:ask` returns once the run starts, and text arrives as
  `agent:delta` events. Do not make it block.

### The provider chain

`discoverProvider` ranks backends by quality, not convenience:

1. **maximal** on `localhost:4141`, when it is up. A proxy backed by a real
   subscription beats any local model.
2. **Ollama** on `localhost:11434`, when it has a model pulled. The model comes
   from `/api/tags`, so `discoverProvider` names only something installed.
3. **embedded**, always. `node-llama-cpp` runs Qwen3 0.6B in this process.

Rules:

- **Embedded is the floor, not the default.** It exists so the application
  works offline and with nothing installed.
- **Never name a model that might not exist.** The old code pinned
  `llama3.2`, which was both absent on most machines and the worst tested
  model for restraint.
- The weights are **not** in the installer. `src/main/native/llama.ts` fetches
  them once into `userData` on first use.
- `STUFFBUCKET_PROVIDER=embedded` pins a provider and
  `STUFFBUCKET_MODEL_PATH` points at existing weights. Without them the
  embedded path is unreachable on any machine running a proxy, which is every
  machine that develops this.

### Two engines, one gate

The embedded provider does not use pi's `Agent`. `node-llama-cpp` owns its own
loop and constrains sampling to the tool grammar, which is most of why a 0.6B
model can call tools at all. `src/main/native/embedded.ts` is that path.

What both paths share is not optional:

- **The same approval gate**, through the same `approve` callback and the same
  risk classification. Two ways to reach a shell, one way to permit it.
- **The same sink.** The overlay does not know which engine ran.

`src/main/native/grammar.ts` translates between the two schema dialects. pi
uses TypeBox, which writes a closed set of strings as
`anyOf: [{const: 'a'}]`; llama.cpp wants `enum: ['a']` and throws `Unknown
immutable type undefined` otherwise. That failure is quiet: the tool never
becomes callable and it looks like a model too small to follow instructions.
A schema it cannot express means the tool is **dropped and logged**, never
passed through unconstrained.

### Quitting with native work in flight

The embedded model runs on a worker thread. Tear the Node environment down
while any of that is outstanding, and the addon completes into an environment
that no longer exists. It calls `ThrowAsJavaScriptException` against it, and
the process aborts inside ggml's terminate handler.

- **Never start native work during `before-quit`.** An earlier version disposed
  of a model there without awaiting the result. Every embedded run aborted on
  exit.
- **Nothing frees the weights.** The process is ending and the operating
  system reclaims the memory, so there is no reason to ask.
- `before-quit` defers the quit through `shutdownAgent` when a run is in
  flight, then quits again. The guard flag is what stops that looping.
- Close an application under test with `closeApp` from `e2e/harness.ts`, not
  `app.close()`. A crash during teardown happens after the last assertion, so
  Playwright reports the run as passed. That hid this bug through four
  consecutive green runs. The only evidence was in the operating system's
  crash reports.

### The approval gate

`beforeToolCall` in `src/main/native/agent.ts` is the only thing between a
local model and the user's shell. Four rules:

1. **The gate denies on every edge.** Timeout, abort, a dismissed card, and a
   failed run all end as a refusal. Never add a path that falls through to
   allow.
2. **`src/main/native/approval.ts` stays free of `electron`.** It is in the
   `stryker.conf.json` mutate list, and it decides what to gate. That logic
   must be mutation tested.
3. **`riskOf` sends an unrecognised tool to `dangerous`.** A toolset may
   declare its own risk; anything else falls through `BUILT_IN_RISK` to
   `dangerous`, so adding a tool cannot widen what runs unattended.
4. **Remember applies to an allow only**, and only for the current run. A
   remembered deny would break the rest of a run with no way to see why.
   Nothing about a decision is persisted.

`preferences.ts` validates `agentApproval` against the three literals rather
than casting. A hand-edited file must not be able to land on `none`.

## Build layout

- Main and preload emit to `.vite/build/` as `main.js` and `preload.js`. Both
  entry files are named `index.ts`, so each Vite config sets `entryFileNames`.
  Without it the two bundles collide.
- The renderer sets `root` to `src/renderer`, so it must also set an absolute
  `outDir`. Forge's default `outDir` is relative to the root it supplies, and
  overriding root without outDir writes the build somewhere the package never
  sees.

## Module size

- Target under 300 lines for a module, excluding tests.
- Past roughly 400 lines, add a new module instead of growing the file.
- This applies most to `src/renderer/App.tsx` and `src/main/index.ts`, which
  both attract unrelated changes.

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
`03-multi-agent-tabs`. A separate 5,024-pixel floor is the macOS traffic
lights, which are coloured or grey depending on whether the window was key.

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
- **Move windows, never hide them.** `setOpacity(0)` also makes a run
  invisible, and it stops the compositor producing content. Every reference
  screenshot came back blank white while the suite stayed green.
- Both windows set `backgroundThrottling: false`. An off-screen window reads as
  occluded to macOS, and Chromium then throttles the renderer to that same
  blank result.
- `capture` fails when an image falls under `MIN_BYTES_PER_PIXEL`, in
  `e2e/screenshot.ts`. That guard exists because the blank captures above
  looked exactly like success. It measures compressed bytes per pixel rather
  than a byte count, because an absolute floor is a pixel-density constant and
  failed real Windows screenshots.

## Screen recordings

Recording is **capture then compose**, with a take on disk between them. See
`docs/recording.md`. Full rules live there. Five that bite an agent here:

- **Capture never waits out a hold.** Timing belongs to `demo/edits/*.json`,
  applied by `compose.ts`. Putting a sleep back into a timeline undoes the whole
  design. A capture costs 45 seconds. A re-cut costs 6.
- `SETTLE_SECONDS` is the one exception, and it has to be. Compose cannot
  recover a frame that capture never recorded.
- `e2e/demo/*.demo.ts` are timelines, not tests. Four configurations match four
  suffixes: `.demo.ts` records, `.compose.ts` cuts, `.stills.ts` photographs,
  `.spec.ts` gates. Do not merge them.
- **Only `launch.ts` and the timelines know about this application.** Everything
  else in `e2e/demo/` is generic, and a fork keeps it unchanged.
- **Never lower the pacing constants** to make an edit fit. `MIN_HOLD_SECONDS`
  is the difference between a video and a slideshow of things that already
  happened. `rules.demo.ts` proves them.
- **`src/main/native/ffmpeg.ts` is the only copy of the encoder search.** It
  imports no `electron`, so main and the recorder share it. It is in the
  `stryker.conf.json` mutate list. The application never downloads or installs
  `ffmpeg`. It detects, and it names the command that fixes a miss.

### Three directories say "demo"

They are not the same thing, and the names are a trap.

| Path | What it is |
| --- | --- |
| `demo/` | Output. Committed stills, mp4 files, and the `edits/*.json` that cut them. |
| `e2e/demo/` | The recorder. Generic capture, compose, and encode machinery. |
| `e2e/fixtures/demo-shell/` | The fixture itself: the fake agent fleet and the components that render it. Its own renderer entry point, excluded from the package. |

The fixture may import from `src/`. The product may not import from `e2e/` —
ESLint enforces that, because one import the wrong way puts the fixture back
into the bundle a user installs.

## Tests run in a random order

Both suites shuffle. A suite that only passes in declaration order is hiding
shared state. These specs share one Electron application, which makes that easy
to do by accident. It has already happened here once.

- **No test may depend on another.** Set up what you need inside the test.
- `e2e/harness.ts` exports `resetShell`, called from `beforeEach`. Extend it
  when you add state that leaks between tests.
- Both suites print a seed. `VITEST_SEED` and `E2E_SEED` replay a failing
  order.
- `E2E_SHUFFLE=0` restores declaration order while debugging.

Known cost: the end-to-end tests all register from one call site, so the
reporter shows the same source line for each. Names stay unique, and `--grep`
still works.

## Mutation testing

`npm run mutate` reports what the tests actually catch, which coverage does
not. It is scoped to pure-logic modules, and **it breaks below 100**.

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

## Documentation

Keep sentences short. Do not use contractions. Name the component that acts,
rather than writing a passive that leaves the actor out: `pty.ts` coalesces
output, rather than output is batched.

There is no automated check. Style here needs judgement, and the one tool that
was tried could not tell a rule from a description.

## Release

- Never add an asset to a published release. GitHub immutable releases reject
  it with HTTP 422. Everything attaches to the draft.
- This repository holds no Apple credential, and it must stay that way. macOS
  signing lives in the private `stuffbucket/macos-builder`.
- Windows ships unsigned. That is an organisation-wide decision, not an
  oversight.

See `docs/release.md` and `.claude/skills/cut-release/SKILL.md`.
