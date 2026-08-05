# A field guide to other Electron repositories

This repository already implements a hardened process model, a typed IPC
contract, a native-module packaging path, and a federated signing pattern that
holds no credential locally. Most of what a team reaches for when told to
"look at how other Electron apps do it" is either already here, or already
rejected here for a stated reason. This document exists to find the smaller
set of things that are not already here, name the exact file that shows the
pattern, and say which open issue the pattern serves. A recommendation tied to
no issue is marked as such, and is ranked lower for it.

Every repository below was checked for whether it is real, maintained, and the
thing it appears to be, not assumed from its reputation. Star counts and push
dates are as of this writing. Nothing here proposes moving the Electron
version off `43.2.0`, loosening `contextIsolation` or `sandbox: true`,
weakening a fuse, adding a credential to this repository, or putting
Storybook or screenshot capture into CI. Those five are settled.

## Ranked

| Repository / pattern | What to take | Serves | Effort | Confidence |
| --- | --- | --- | --- | --- |
| `stuffbucket/repoman` (in-house) | Adopt the reusable triage workflow this repo's own siblings already consume | No numbered issue; serves the v0.0.2 "consumable" spirit directly | Low | High |
| `Eugeny/tabby` | Session-lifecycle shape for the terminal kit: reattach by id, two-phase teardown, credit-based backpressure | #37 | Medium | High |
| `stuffbucket/maximal-client` (in-house) | The source-scanning contract-test technique, applied to a maximal-agnostic import guard | #16 | Low-Medium | High |
| this repo's own `docs/zed-theme-proposal` branch | Resume and land it rather than re-research theme ingestion | #42 | Low | High |
| `stuffbucket/maximal-client`'s GitHub-pin precedent, vs. the in-house npm-trusted-publishing skill | Decide the export's consumption mechanism before #31 lands | #31, #22 | Medium | Medium |
| `electron/update-electron-app` | Confirms `docs/release.md`'s already-chosen unblock path 1 is a live, maintained package | Extension point named in `docs/release.md`, no issue | Medium | Medium |
| Electron's built-in `crashReporter`, then `getsentry/sentry-electron` if more is needed | A local-first crash capture step before adding a third-party SDK | No issue | Low, then Medium | Medium |
| `microsoft/vscode` | `UtilityProcess` as the isolation boundary for the embedded llama.cpp engine | No issue | Medium-High | Medium |

## Advanced features

### Terminal sessions: `Eugeny/tabby`

73,751 stars, pushed within the last day, actively developed. Real and
current.

`tabby-electron/src/pty.ts` is the file to read. Tabby is a terminal emulator
built on Electron, node-pty, and a plugin architecture; the file in question
is the main-process side of its session management, and it is the closest
public analogue to what issue #37 asks for: a `TerminalDescriptor` /
`TerminalTransport` pair whose sessions survive a renderer reload and whose
output does not outrun a slow consumer.

Four things in that file are worth taking, because they answer questions
issue #37 raises and this repository's own `src/main/native/pty.ts` does not
yet have to answer, since today a terminal never outlives the renderer that
opened it:

- Sessions are identified by an opaque id, not by tab identity. A renderer
  reload can ask "does a session with this id still exist" and reattach,
  instead of the process dying with its owning window.
- Detaching listeners and killing the process are two different operations.
  Unmounting a terminal host unsubscribes; only an explicit close kills the
  shell. This is exactly what issue #37 already specifies ("renderer
  unmount/detach does not kill the process ... close runs explicit
  termination"), so Tabby is confirmation of the shape, not a new idea.
- Output flow control is a credit signal the consumer sends back, not a fixed
  batching interval alone. `docs/roadmap.md` already names the gap this
  closes: "no flow control. A process that floods output will still outrun
  the batcher."
- True-PID resolution walks a single-child process chain to unwrap a shell
  launcher wrapper, which matters for a per-tab working directory, another
  named gap in `docs/roadmap.md`.

What not to take: Tabby ships this as one plugin among several
(`tabby-core`, `tabby-terminal`, `tabby-ssh`, `tabby-serial`, `tabby-telnet`),
each an installable, Angular-injectable package. That is a plugin system for
a terminal-emulator product. Issue #37 asks for one bounded export — a
terminal kit with product strings removed — not an installable plugin
framework. Building one because Tabby has one would be solving a problem
nobody has asked this repository to solve.

Confidence: high on the four points above, read directly from the file.
Medium on how much of the surrounding session-id generation, ownership
tracking, and stale-session reaping lives in `pty.ts` itself versus a
different file in the same package; that was not fully traced.

### Contract testing across a language boundary: `stuffbucket/maximal-client`

This is an in-house precedent, not an external repository, and it is the
strongest single citation in this document for issue #16, because it is
already built, already running, and solves a structurally identical problem.

`tests/shell-sidecar-env-contract.test.ts` in `maximal-client` checks that a
Rust `lib.rs` setting an environment variable and a TypeScript file reading
`process.env` of the same name agree, by reading both source trees as text
and asserting the literal name appears on both sides. No compiler spans that
boundary — Rust and TypeScript do not share a type system — so the test exists
specifically to catch a one-sided rename that would otherwise fail silently at
run time, far from the line that broke.

Issue #16 asks for a CI guard that keeps this shell maximal-agnostic: an AST
import check plus a "neutrality string scan." The technique is the same
family — read source as data, assert a property about it, run it in CI
rather than at run time — applied to a different boundary (forbidden imports
and forbidden literal strings, instead of an env-var name shared across a
process boundary). The org already trusts this technique enough to depend on
it; #16 does not need a new idea, it needs this one pointed at a different
pair of facts.

Confidence: high. The file was read in full.

### Theming: this repository's own unmerged branch, and Zed as its source

Before reaching outside this repository: `docs/zed-theme-proposal` is an
existing branch with a fully drafted `docs/proposals/zed-themes.md`, not yet
on `main`. It independently verified Zed's theme JSON schema against
`zed.dev/schema/themes/v0.2.0.json` and the bundled `One` theme, found that
Zed's colours are 8-digit `#rrggbbaa` hex where this repository's
`parseHex` in `src/renderer/lib/contrast.ts` only accepts `#rgb` or
`#rrggbb`, and found that zed-themes.com has no public listing API, only a
working per-theme download route. Re-deriving this research would duplicate
work already done to a higher standard than a fresh pass in this document
could reach. The recommendation for issue #42 is to resume that branch, not
to restart the investigation.

`zed-industries/zed` itself: 88,076 stars, pushed within the hour, and the
schema URL above resolves live. Real, active, and current.

Confidence: high that the branch's findings are accurate — its schema claims
were re-checked against the same live URL during this research and matched.

### Crash reporting: start with Electron's own `crashReporter`, not a dependency

`getsentry/sentry-electron` (260 stars, pushed today) is the official Sentry
SDK for Electron, and it is real and actively maintained. Its
`src/main/integrations/electron-minidump.ts` wires Electron's native
minidump capture into Sentry's event pipeline. No open issue in this
repository asks for crash reporting, and this repository sends nothing to
any third party today.

The lighter step, and the one worth taking first precisely because this
repository's stated position is "no credential of any kind," is Electron's
own `crashReporter` module: it can write local minidumps with no
`submitURL` configured at all, which means no endpoint, no DSN, and nothing
that resembles a credential. That gets a developer a crash artifact to
inspect without adding a dependency or a network destination. Reaching for
`sentry-electron` — which does need a DSN, a quasi-public but still
externally-issued identifier — is a reasonable second step if local
minidumps prove insufficient, not a starting point.

Confidence: medium. `sentry-electron`'s source tree was listed and its
minidump-integration file located, but not read in depth; Electron's
`crashReporter` behaviour with no `submitURL` is documented Electron
behaviour, not something exercised inside this repository during this
research.

### Process isolation: `microsoft/vscode`, narrowly

188,380 stars, pushed within the hour. The reference implementation for
running Electron at production scale under a hardened process model.

This repository's own sandboxing is already ahead of what most of VS Code's
public sandboxing writeup describes: `contextIsolation` and `sandbox: true`
are on for every window today, where VS Code's migration to that state was a
multi-year effort against a much older codebase. There is little to import
on the contextBridge or preload side; this repository's single preload file
with a channel allowlist, checked against `src/shared/ipc.ts`'s runtime
lists, already does what VS Code's `vscode-file://` protocol and
MessagePort handoff exist to achieve by more complicated means, for a
simpler process topology.

The one idea worth carrying over is `UtilityProcess`, an API VS Code's team
contributed to Electron to move heavy children — the extension host,
terminals, file watching — out of the main process, so that a crash in one
does not take the application with it. `src/main/native/embedded.ts` in this
repository runs the llama.cpp engine in the main process today. A
native-code abort inside that engine — llama.cpp's own code calls
`std::terminate` on some out-of-memory paths, not a catchable exception —
would currently take the whole application down with it. Running the
embedded engine in a `UtilityProcess` would contain that failure to a
child the main process can restart or report on, without touching
`contextIsolation`, `sandbox`, or any fuse.

No open issue asks for this. It is named here as a stability improvement
worth its own issue, not as work that serves an existing milestone.

Confidence: medium. The `UtilityProcess` API and its origin are documented
Electron and VS Code history; the specific claim about llama.cpp's abort
behaviour on OOM is general knowledge about the library, not something
reproduced against `node-llama-cpp` in this repository during this research.

### Auto-update: `electron/update-electron-app` confirms the documented path, does not add a new one

822 stars, pushed three days ago, maintained by the Electron org itself.
`docs/release.md` already lays out why there is no auto-update today and
names two ways to unblock it, ranked by effort. The lower-effort one is
"add a zip artifact to `stuffbucket/macos-builder`, then `update-electron-app`
works against GitHub Releases, provided this repository is public." This
research adds one fact to that: the package is a live, current, org-maintained
dependency, not an abandoned or unmaintained one, so choosing it does not
trade a documented gap for an undocumented risk.

There is a second live option in the same family, not previously named in
`docs/release.md`: `electron/windows-sign`, 65 stars, pushed two days ago,
the Electron org's own tool for the Windows Authenticode signing that
`docs/signing.md` defers organisation-wide. It does not change today's
decision — that deferral is organisation-wide, not this repository's to
reverse — but it is worth knowing a maintained tool exists for when that
changes.

Confidence: medium. Both packages were checked for star count, push date,
and archive status, not read in depth.

## What not to take, and why it looked tempting

### Signal Desktop's multi-file preload split

`signalapp/Signal-Desktop`: 16,459 stars, pushed four days ago, real and
active. Its `preload.wrapper.ts` at the repository root loads a large number
of individually named files in `ts/` — `background.preload.ts`,
`groups.preload.ts`, `SignalProtocolStore.preload.ts`, and others, plus a
`ts/context` directory — each exposing its own slice of the bridge. It is a
genuine, working pattern for splitting a huge contextBridge surface into
maintainable pieces.

This repository has one preload file, `src/preload/index.ts`, exposing
`invoke` and `on` against a single typed contract. That is proportionate to
one shell with one IPC surface, not the accumulated history of a messaging
application with years of bridge growth. Splitting the preload the way
Signal does would introduce structure this repository's contract already
prevents from becoming a problem: `src/shared/ipc.ts`'s exhaustiveness
assertion means there is no drift for multiple files to manage independently.
Adopting Signal's shape here would be solving a scale problem this repository
does not have.

### electron-builder's documented signing pattern

`electron-userland/electron-builder`: 14,635 stars, pushed yesterday, the
most common alternative to Electron Forge. Its own GitHub Actions
documentation shows the standard pattern for macOS code signing: the
certificate as a base64 secret, `CSC_LINK` and `CSC_KEY_PASSWORD` as repo
secrets read by the build job. This is the industry-default shape, and it is
exactly the shape `docs/signing.md` explains why this repository does not
use — "this repository holds no Apple credential, and it must stay that
way." The federated pattern already in place, where `stuffbucket/macos-builder`
holds every Apple secret and this repository supplies only an unsigned
`.app` and a config file, is the more defensible answer to the same problem,
already built, already documented, and already working. This is the clearest
"popular but wrong for us" finding in this document: the default the rest of
the ecosystem reaches for is the one thing this repository's own
documentation explains why it deliberately avoided.

electron-builder's own GitHub Actions integration is also documentation-and-
copy-paste only — there is no `workflow_call` reusable workflow to consume —
which rules it out as a model for the "reusable GitHub workflow" goal as
well as for signing.

### Migrating off Forge's Vite plugin

Community boilerplates built around `electron-vite` are common
recommendations for a fresh Electron project. This repository already solved
the hard part that tooling exists to solve — externalizing a native module
from the Vite bundle and shipping it as real files — inside
`forge.config.ts`'s `ignore` predicate and `vite.main.config.ts`'s external
list, with `scripts/verify-package.mjs` asserting the result. Switching build
tools would reopen a solved problem for a solved problem's sake. No issue
asks for this, and nothing in the two goals this document was scoped against
depends on it.

### Tabby and Obsidian as plugin-system models

Tabby's plugin architecture (above) and `obsidianmd/obsidian-api` (2,302
stars, pushed three weeks ago) were both checked as possible models for a
plugin or extension system, since that is named as one of the advanced-
feature areas to survey. Obsidian's public repository is types only —
`obsidian.d.ts`, `canvas.d.ts`, `publish.d.ts` — because Obsidian's
application code is closed source. It documents a typed surface a plugin
author codes against; it says nothing about how the host implements
isolation, permissions, or lifecycle, because that code is not public. No
open issue in this repository asks for a plugin system, so both are recorded
here as reference material for a future design, not as something to act on
now.

### `element-hq/element-desktop`: archived, cite the successor with care

Confirmed archived on 2026-03-25, 1,485 stars at archival. Its
functionality was folded into `element-hq/element-web` (13,347 stars, pushed
within the hour, active), under an `apps/desktop` subdirectory. This
document did not fetch that subdirectory's contents directly, so nothing
about Element's current Electron architecture is cited here. This is
recorded as a repository that looked like a candidate and was correctly
ruled out for currency, per the standard this document was asked to hold
every repository to.

## Scaling across repositories

### Reusable GitHub workflows: `stuffbucket/repoman`

This is an in-house, private repository, so star count is not a signal of
its health — repository access being private is the reason it has none
publicly. It is real and active: its `.github/workflows/` directory holds
`triage-reusable.yml`, and both `stuffbucket/maximal` and
`stuffbucket/maximal-client` already consume it, via a thin caller stub
(`triage.yml`) that does nothing but declare `permissions: issues: write`
and call `stuffbucket/repoman/.github/workflows/triage-reusable.yml@v1`.
`maximal`'s copy of that stub explains its own reasoning in comments worth
reading directly: it passes no `secrets:` block, specifically because
`secrets: inherit` would hand every one of `maximal`'s secrets — Apple
signing keys, notarization credentials, an app's private key — to a
workflow pinned to a floating tag in another repository, far more than
triage needs.

`.github/workflows/` in this repository today holds `ci.yml`, `release.yml`,
and `windows-msi-dev.yml`. There is no `triage.yml`. This repository is the
one sibling not yet consuming the pattern its own organisation already
proved out twice. Adopting it is a small, mechanical change — copy the
caller stub, scope its `permissions` the same way, pin the same tag — and it
is the cleanest example available anywhere in this research of "a reusable
GitHub Actions workflow consumed by sibling repositories," the exact pattern
named in this document's brief. No open issue in this repository asks for
it; the recommendation is to open one, since `docs/release.md` states
plainly that an issue without a milestone has not been triaged, and this gap
currently has neither.

Confidence: high. Both the caller stub and the reusable workflow's file
listing were read directly.

### Federated code signing: `stuffbucket/macos-builder`, already the answer

Also in-house and private. `docs/signing.md` and `docs/release.md` already
document this fully: the public repository holds no Apple credential, a
private sibling holds the runner and every secret, and a narrowly scoped
fine-grained PAT plus a short-lived per-client token from an `app-repoman`
GitHub App connect the two without a long-lived credential anywhere in this
repository. This document's job here is only to confirm that this is
already the correct answer to the "code signing across repositories" goal,
not to propose an alternative — electron-builder's own documented pattern is
the alternative, and it is the one this repository's design already rejected
for a stated reason (see above).

### Package consumption across repositories: GitHub pins today, npm trusted publishing as an option

`maximal-client/client/package.json` depends on
`@stuffbucket/maximal-core` as `github:stuffbucket/maximal-core#v0.2.0`, and
`maximal-client/shell/package.json` pins the same package at `#v0.1.0`. This
is the organisation's real, current mechanism for one repository consuming
another as a package: a tag-pinned GitHub dependency, not an npm registry
publish. Issue #31 (slim the `./host` export, build `dist` at pack time
rather than committing it) and issue #22 (client integration) both bear on
how `maximal-electron` itself gets consumed once it is a dependency rather
than a standalone application, and the organisation's own precedent is
useful context for that decision: a registry publish is not yet how this
group of repositories consumes each other.

If a registry publish is chosen instead — which would let `dist` be built at
`prepack` time rather than committed, closing part of what issue #33
describes (`dist/` both committed and gitignored) — an in-house
skill for npm trusted publishing already exists, and its whole purpose is
avoiding a long-lived `NPM_TOKEN` secret in favour of OIDC-issued short-lived
credentials, which fits this repository's "no credential of any kind" rule
better than a classic token would. This is presented as an option to weigh,
not a recommendation to switch: the GitHub-pin approach is a real, working
precedent already in use by two siblings, and departing from it would be a
new pattern for the organisation, not a return to one.

Confidence: medium. Both `package.json` files were read directly; whether
any stuffbucket package has ever actually used npm trusted publishing in
practice was not established — the skill exists as tooling, and its use
here would be new.

### Shared design tokens: naming convergence, not a shared package, and that is probably still right

`docs/architecture.md` already states this repository's `tokens.css`
"follows the scale and the naming" of `maximal`'s
`shell/src/ui/styles/tokens.css`, with a different palette because the two
are different kinds of application. `maximal`'s own `theme.ts` is the
canonical source that generates its `tokens.css`; this repository does the
analogous thing independently rather than importing a shared package.

No open issue asks for a published design-token package, and one is not
recommended here, for a structural reason worth stating: issue #16 requires
this shell to stay maximal-agnostic, so a token package this shell imports
could not itself depend on `maximal`, and a token package `maximal` imports
would put the dependency in the direction opposite of where a design system
would normally flow from a product to a reference shell. Naming-and-scale
convergence by convention, which is what exists today, sidesteps that
problem; a shared package would have to solve it first. This is recorded as
a considered non-recommendation, not an oversight.

### Release trains: already documented, already matches the sibling that matters

`docs/release.md`'s draft-release-then-publish shape states directly that it
is "the same shape `stuffbucket/maximal` uses, for exactly this reason" —
GitHub's immutable-release HTTP 422 on a post-publish asset attach. This
document did not find an external, non-sibling repository whose release-train
shape was worth comparing against; the shape here is already validated
against the sibling it has to interoperate with, which is the standard this
document was asked to hold every recommendation to.

## What could not be verified

- `element-web`'s `apps/desktop` subdirectory was not fetched, so nothing
  about Element's current (post-merge) Electron architecture is cited here,
  only the fact of the merge itself.
- `sentry-electron`'s minidump integration file was located but not read in
  depth; the recommendation to start with Electron's own `crashReporter`
  rests on documented Electron behaviour, not a side-by-side reading of both
  code paths.
- Whether any package in this organisation has used npm trusted publishing
  in practice, as opposed to the skill existing as available tooling, was
  not established.
- The extent of Tabby's session-ownership and stale-session-reaping logic
  beyond `tabby-electron/src/pty.ts` itself — whether it lives in that file
  or a neighbouring service file — was not fully traced.
- The claim about llama.cpp's abort behaviour on some out-of-memory paths is
  stated from general knowledge of the library, not reproduced against
  `node-llama-cpp` inside this repository.
