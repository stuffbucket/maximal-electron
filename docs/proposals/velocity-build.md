# Velocity: the build, the dev loop, and startup

This repository's CI is already fast in absolute terms: a pull request goes
green in two and a half to three minutes, concurrency groups already cancel a
superseded run, and the platform matrix already exists for the right reason
(the `ci.yml` comment states it directly: most breakage between `npm start`
and a shipped build shows up only at package time). The three recommendations
below are not about a slow pipeline. They are about waste that is easy to
prove and easy to remove, found by reading actual job logs rather than
guessing where the time goes.

Every number below came from `gh run view --json jobs` and `gh run view --log`
against real runs on this repository (`31036301526` and `31032369531`, both
public and inspectable), not from a local reproduction or an estimate. Where a
claim rests on documentation rather than a run this repository produced, that
is said explicitly.

## Ranked

| Change | Saves | Cost | Confidence |
| --- | --- | --- | --- |
| Skip the `demo_window` renderer target when CI runs `npm run package` | Roughly half the Vite renderer-build phase — about 15-16s of a 23-52s `npm run package` step — on every job that packages: `package` and `e2e`, on both macOS and Windows. Four of the five CI jobs pay this cost. | Low | High |
| Cache Electron's own artifact download (`electron_config_cache`) across runs | A full, currently uncached download of the Electron zip on every one of the five jobs, every run | Low | High on the mechanism, medium on the seconds it recovers |
| Call `module.enableCompileCache()` first in the main-process entry | Re-parse and re-compile cost of the ~812KB eager main-process bundle on every cold launch of the packaged app | Low | Medium — the API and the bundle size are verified; no before/after launch timing was taken |
| Leave `tsc --noEmit` alone: no project references, no `--incremental`, no `tsgo` | Nothing to save | — | High — measured at 8s, not a bottleneck |
| Leave `npm run mutate` as a plain, non-incremental full run | Nothing to save safely | — | High — incremental mode's documented blind spots are a bad trade against a break-at-100 gate |

## Skip `demo_window` in CI

`forge.config.ts` declares two renderer targets: `main_window`, the product,
and `demo_window`, the capture fixture that `e2e/demo/` drives for recording
and stills. Both build on every call to `npm run package`, unconditionally.

That is deliberate waste, and it is provable rather than suspected:

- `playwright.config.ts` sets no `testMatch`, so `test:e2e` uses Playwright's
  default, which only picks up `*.spec.ts`. `e2e/demo/*.demo.ts`,
  `*.compose.ts`, and `*.stills.ts` do not match it — grepping the four files
  the `e2e` CI job actually runs (`concierge.spec.ts`, `download.spec.ts`,
  `embedded.spec.ts`, `shell.spec.ts`) finds no reference to `demo_window` or
  `demo-shell` anywhere in them.
- The `package` CI job never runs `test:e2e` at all. It only runs
  `verify:package`, which asserts `demo_window` is **absent** from the
  packaged asar.
- `AGENTS.md` already states that recording and stills are developer tools,
  not CI: "CI does not build Storybook, for the same reason CI does not
  capture stills." The same reasoning applies to `demo_window` — it exists
  for `npm run record`, `npm run compose`, and `npm run stills`, none of which
  any workflow in `.github/workflows/` invokes.

So `demo_window` is built by every `package` and every `e2e` CI job, and used
by neither. Measured cost, from run `31036301526`'s macOS `package` job log:
the Vite build phase runs from `18:47:12.407` ("Building renderer
targets...") to `18:47:29.270` ("Building main and preload targets..." marked
done) — about 16.9s. Within that, `main_window` and `demo_window` both report
"Built" at the same timestamp, `18:47:28.33`, meaning Forge's Vite plugin
built them as two concurrent Vite processes and the wall time is gated by
whichever finished last. That does not make the second one free: it is a
second full Vite build of a second full entry point (its own HTML,
its own React tree of fake-agent components), competing for the same CPU and
memory as the first. Removing it should recover a large share of that ~17s
window, on every one of the four CI jobs that call `npm run package`
(`package` and `e2e`, macOS and Windows) — call it 30-60s of total CI compute
per run, not per job, since it is duplicated four times per run.

**Implementation note, not made here because it touches `forge.config.ts`:**
gate the `demo_window` entry in the `renderer` array behind a check on
`process.env.CI`, so a developer's local `npm run package` (needed before
`npm run record` or `npm run stills`, per the command table in `AGENTS.md`)
still builds it, and CI does not. `scripts/verify-package.mjs`'s check that
`demo_window` is absent from the packaged asar needs no change: it already
passes trivially if the target was never built.

## Cache Electron's own artifact download

`node_modules/electron/install.js` downloads a platform-specific Electron
zip through `@electron/get`, and reads its cache directory from
`process.env.electron_config_cache` — confirmed by reading that file
directly in this checkout, not from documentation. Left unset, `@electron/get`
falls back to `env-paths`'s default, which on this machine resolves to
`~/Library/Caches/electron`; the Linux and Windows equivalents are
`~/.cache/electron` and a `Cache` folder under `%LOCALAPPDATA%\electron`.

None of that is what `actions/setup-node`'s `cache: npm` caches. That option
caches npm's own tarball cache (`~/.npm` or its Windows equivalent) so the
*registry* packages do not re-download. Electron's own binary does not come
from the registry — `@electron/get` fetches it directly from GitHub — so it
is a second, separate cache surface, and grepping every workflow in
`.github/workflows/` for `actions/cache` finds no hits at all. Every job that
runs `npm ci` — five per CI run, more per release run — starts with this
cache cold and re-downloads the full artifact.

The `npm ci` step itself is measured at 18-19s on the `static` job
(ubuntu-latest) versus 33-46s on `package`/`e2e` (macOS, Windows), for the
identical lockfile. That gap is consistent with an uncached, platform-specific
binary download dominating the difference, though this was not isolated as a
controlled before/after: the two platforms also differ in raw disk and
network throughput, and `npm ci` is doing other work (1,090 packages,
native-module prebuilds) besides. The mechanism — a real cache surface,
currently entirely unused — is verified. The precise number of seconds it
would recover is an estimate, not a measurement.

**Implementation sketch:** set `electron_config_cache` to a fixed,
OS-independent path (for example `${{ runner.temp }}/electron-cache`) before
`npm ci` runs in every job, then add one `actions/cache` step per job keyed on
`runner.os` and `hashFiles('package-lock.json')` (the lockfile pins Electron's
exact version, so a version bump invalidates the key correctly). A single
fixed path sidesteps having to special-case three different default
directories per OS.

## `module.enableCompileCache()` for the main process

Node's `node:module.enableCompileCache()` persists V8's compiled bytecode to
disk and reuses it on the next launch, for CommonJS, ESM, and TypeScript
alike. It has been non-experimental since Node 25.4.0, and has existed since
22.8.0. Electron 43 bundles Node **v24.17.0**, well past that line, so it is
available in this application's main process without changing the pinned
Electron version.

The main-process bundle in `.vite/build/` (from a local build produced during
this investigation, not shipped) is code-split into 31 chunks totalling
2.6MB, most of it `pi-ai`'s per-provider modules (`anthropic-messages`,
`mistral-conversations`, `google-shared`, and so on), each behind its own
dynamic import and therefore loaded lazily — that lazy-loading already exists
and needs no change. What loads eagerly on every launch is `main.js` itself
(157 bytes, a thin entry that requires the rest) plus the one chunk it
requires directly at 812KB. Enabling the compile cache would let V8 skip
re-compiling that 812KB chunk's bytecode on the second and subsequent cold
launches, at the cost of one first-run write and a cache directory under
`app.getPath('userData')` that Node does not evict on its own.

This is presented at medium confidence deliberately. The API's behavior and
the bundle's size are both verified directly — the first from Node's own
documentation, the second by inspecting the actual build output. What was
*not* done is launching the packaged application under a timer or profiler to
measure an actual before/after difference in wall-clock time to the first
window. No GUI benchmarking was attempted in this investigation. The
recommendation is to add the call and confirm the win with a simple
`app.whenReady()` timestamp logged across a cold cache and a warm one, rather
than to trust the documentation's qualitative "significant speedup" as a
number for this application specifically.

One implementation subtlety worth stating up front: the call has to execute
before the module graph it should cover is first evaluated. Since
`src/main/index.ts` already imports `native/agent.ts` (and therefore the
whole `pi-ai` chain) near the top of the file, the compile-cache call needs to
be the first statement in that file, ahead of every other import — not
tucked into `app.whenReady()`, by which point the eager chunk has already
been required and compiled.

## Left alone, on purpose

**`tsc --noEmit` is not a bottleneck here.** Measured at 8s in the `static`
job, against lint's 6-7s and the unit suite's 3s. Project references,
`--incremental`, and `tsgo` (TypeScript's Go-based compiler, generally
available as of TypeScript 7.0 in mid-2026) all exist to cut a type-check that
takes minutes, not one that takes eight seconds. `tsgo` in particular ships
today without a programmatic compiler API, and `typescript-eslint` —
already a devDependency here — is one of the tools its own release notes name
as needing to stay on TypeScript 6 until a later release restores that API.
Adopting it now would mean running two TypeScript installs side by side for a
compiler that is not this repository's slow step.

**Do not turn on Stryker's incremental mode.** It is real and it works: it
persists a report between runs and reuses prior mutant results for anything
neither the mutated files nor their tests touched. But its own documentation
is explicit that it can carry forward a stale "killed" result when a change
falls into one of its blind spots — an environment change, a dependency
bump, a test runner that (like Vitest, which this repository uses) reports
coverage per file rather than per test location, so every test in a changed
file is treated as changed even when only one assertion moved. `AGENTS.md`
calls the mutate gate load-bearing and says plainly: never lower the
threshold to make a change fit. A mode that can report `break: 100` against
data it did not actually re-run this time is the same failure in a faster
package. The 57-63s this step costs in the `static` job is the honest price
of a gate that means what it says.

**`npm ci` already avoids the two traps that would make it worse.** No
workflow runs `npx playwright install`; Playwright's Electron driver launches
the application's own installed Electron binary rather than downloading a
browser, so that common Playwright CI cost does not apply here. And
`actions/setup-node`'s `cache: npm` is the right tool over caching
`node_modules` directly — the platform-specific native binaries in
`@lydell/node-pty-*` and `@node-llama-cpp/*` are exactly the kind of thing a
stale `node_modules` cache silently corrupts across a runner image update,
while re-running `npm ci` against a warm npm tarball cache is both correct
and nearly as fast.

**Native-module rebuilding is not costing anything measurable.** Forge's
"Preparing native dependencies" step — the point where a mismatched native
addon would be rebuilt against Electron's ABI — took 2.9s and 2.6s in the two
runs inspected. Both `@lydell/node-pty` and `node-llama-cpp` already ship
prebuilt, platform-scoped packages (confirmed by reading their
`optionalDependencies`, not assumed), so there is nothing to compile here in
the ordinary case, and no reason to add `@electron/rebuild` as an explicit
dependency to manage that step by hand.

## What not to do

**Do not pass `--omit=optional` to `npm ci`.** This looks like an obvious win
given `node-llama-cpp` and `@lydell/node-pty` each list a dozen-plus
platform-specific packages, but those platform packages *are* the optional
dependencies, and each one carries the actual working native binary for one
platform. `npm` already resolves only the one matching the current OS and
architecture — confirmed here by listing `node_modules` on this machine and
finding exactly `@node-llama-cpp/mac-arm64-metal` and no other platform
variant present. Omitting optional dependencies would strip the very package
that makes the terminal and the embedded model work on whichever machine runs
the install, and the failure would look like a runtime bug rather than an
install-time one.

**Do not build a V8 startup snapshot for the main process.** This is a real
technique — large Electron apps use `electron/snapshot`-style custom
snapshots to skip parsing their bootstrap code entirely — but a snapshot can
only capture pure JavaScript reachable from a dedicated snapshot entry point
at build time. It cannot include a native addon. This application already
externalizes its two native modules from the Vite bundle specifically because
their file layout is load-bearing (`AGENTS.md`, the build layout section, and
`vite.main.config.ts`'s own comments say so directly), which means a snapshot
here would cover only part of the main process and still need to lazily
`require` `@lydell/node-pty` and dynamically `import` `node-llama-cpp` around
it at runtime — most of the complexity of a snapshot, for a partial win, on a
main bundle that is 812KB eager to begin with. The size and the architecture
both argue against it; this was not attempted, but the reason not to attempt
it does not depend on trying it first.

**Do not adopt a monorepo build tool.** Turborepo, Nx, and similar tools earn
their keep by caching and parallelizing a task graph across many packages.
This repository has one `package.json` and one buildable unit. There is no
second package for a task graph to schedule against, so the entire case for
these tools — skip work in packages nothing downstream of them changed —
does not apply. What would be added is a second configuration layer and,
for the hosted variants, a remote cache dependency, for a repository where
`N=1`.

## What could not be verified here

- The exact number of seconds the Electron download costs versus general
  network and disk variance between GitHub's macOS, Windows, and Linux
  runners. The `npm ci` timing gap across platforms is real and measured; the
  attribution of that gap specifically to the uncached download, rather than
  to other platform differences, is inference rather than an isolated
  measurement.
- Actual cold-launch wall-clock time for the packaged application, with or
  without a V8 compile cache. No profiler or timer was attached to a real
  launch during this investigation.
- Whether Forge's Vite plugin `concurrent` option (available since Forge
  7.9.0; this repository is on 7.11.2 and does not set it) would help or hurt
  if tuned down on a constrained runner. The theory that Windows's slower
  `npm run package` step (42-61s, versus macOS's 23-32s) comes from CPU
  contention across four simultaneous Vite build processes does not survive
  the fact that the public `windows-latest` runner has *more* CPUs than
  `macos-latest` (4 versus 3), not fewer — so if contention were the cause,
  Windows should be faster on this axis, not slower. The more likely
  explanation is Windows's well-documented filesystem and antivirus-scanning
  overhead for many-small-file operations, which packaging's "Copying files"
  step is full of — but that is general knowledge about Windows CI runners,
  not something isolated against this repository's own runs.
- Whether merging the `package` and `e2e` jobs — building once, then sharing
  the artifact via upload/download instead of running `npm run package`
  twice per OS — would net a real win. The redundant build is real (both
  jobs run it independently, on both operating systems), but
  `actions/upload-artifact` and `download-artifact` have their own cost
  against an output this size, which was not measured, so recommending the
  merge without that number would be a guess dressed as a finding.
- `npm run verify:exports`, `npm run build:host`, and `npm run build:renderer`
  — the scripts that build and would catch a break in the package's published
  `dist/host` and `dist/renderer` entry points — are never invoked by any
  workflow in `.github/workflows/` (confirmed by grep, not merely unnoticed).
  That is a coverage gap adjacent to this investigation rather than a speed
  question, and is named here because "raise its quality" was part of the
  brief this document answers.
