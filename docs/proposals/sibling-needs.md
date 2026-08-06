# What maximal and maximal-core need from this shell next

`v0.0.2` published today. This asks what the two consumers this shell exists
for actually need, and which of our open issues serve that need. The answer
below rests on reading their code, not their issue titles: `maximal`'s
`client/` has not landed on its `main` branch yet, so every claim about it
comes from the worktrees at `.claude/worktrees/electron-client/client` and
`.claude/worktrees/client-ci-task1/client`, which carry the furthest-along
version of that code.

## The one fact that reorders everything else

`maximal/client` imports exactly one thing from this package today:
`createHostWindow` and `HostWindowOptions`, from `./host`
(`client/src/main/shell.ts:8`). Its renderer
(`client/src/renderer/main.tsx`) is a bare React tree with inline styles. It
imports nothing from `./renderer`, nothing from `./host/terminal`, and does
not load `./renderer/styles.css`. Its preload
(`client/src/preload/index.ts`) is hand-written from scratch — three methods,
`getCoreOrigin`, `getProxyUrl`, `openExternal` — and does not use anything we
export, because we export no preload.

So three of our four export paths have zero consumers today. Everything
below that concerns `./renderer`, `TerminalHost`, `Profile`, or settings is
speculative in the strict sense: no line of consumer code asks for it yet.
Only `./host` is load-bearing, and it works.

## Table, ranked by how soon they hit it

| Their issue | What it needs from us | Ours that serves it | Status |
| --- | --- | --- | --- |
| maximal#421 | A tag or branch ref in place of a raw commit SHA | none (v0.0.2's existence is the whole answer) | Imminent — unblocked today, ready to act on |
| maximal#417 / #22 (epic) | `runMain(runtime, options)`, a versioned `options` shape | #15 | Imminent — their own comment on #22 says they are "ready to consume... the moment packaging + `runMain` land" |
| maximal#417 / #22 | `./host`'s dependency tree not pulled in whole | #31 | Imminent, already costing them — see below |
| maximal#417 / #22 | CI proof the shell carries no `maximal` literal | #16 | Imminent per their epic checklist; not blocking. Would fail today if scoped to all of `src` — see below |
| maximal#417 / #22 | A generic, feature-detected preload bridge | #17 | Half already shipped, for our own reasons, not theirs — see below |
| maximal#427 (Settings) | Possibly `Profile` / settings surfaces | #60 | Speculative — #427 describes its own Settings UI and does not name our export |
| maximal#412 (packaging) | Nothing from `./host/terminal` yet | #76 | Speculative — no `TerminalHost` import exists to protect |
| (none filed) | Owner-scoped terminal cleanup, multi-window | #74 | Speculative — the client opens exactly one `BrowserWindow` today |
| (none filed) | Terminal supply-chain hygiene | #79 | Speculative until `./host/terminal` has a consumer |
| (none filed) | Unscoped-selector guard on the CSS a consumer will import | #51 | Not requested, but protects the one stylesheet export the moment `./renderer/styles.css` gets a consumer |

Everything under "speculative" is real work and none of it is wrong to have
filed. It is just not what either sibling is waiting on, verified from their
code rather than inferred from ours.

## The repin: maximal#421

`client/package.json` (worktree copy, both `.claude/worktrees/electron-client`
and `.claude/worktrees/client-ci-task1` agree) currently reads:

```
"stuffbucket-electron": "github:stuffbucket/maximal-electron#fe3ca59949c191f86031bc15585855589477e6de"
```

The exact line the issue's own acceptance criterion asks for — "`main` HEAD
or a tag" — and the one that matches "once the shell repo cuts a release," is:

```
"stuffbucket-electron": "github:stuffbucket/maximal-electron#v0.0.2"
```

`v0.0.2` is a real annotated tag on this repository today. Nothing in the
client's code would break: the only import from us, `createHostWindow` /
`HostWindowOptions` in `client/src/main/shell.ts`, matches
`src/host/host-window.ts` field for field — `preloadPath`, `title`, `width`,
`height`, `loadRenderer` are all present and none of the newer optional
fields (`icon`, `titleBarStyle`, `titleBarOverlay`, `trafficLightPosition`)
are referenced, so their absence from the client's call site is not a gap.

One thing worth their own attention, not a defect of ours: `github:` is a
**source** dependency, not the release tarball. `npm install` clones the
repo at that ref, installs our `devDependencies`, and runs our `prepare`
script (`build:package`, confirmed in `package.json`), which is exactly how
the current SHA pin already produces a working `dist/host` in their
`node_modules`. That path never runs `scripts/verify-exports.mjs` — that
script only runs inside the `package-tarball` CI job, ahead of `npm pack`
(`.github/workflows/release.yml:296`). So the safety net `docs/release.md`
describes — "a tarball missing an export target fails before it is attached
rather than after somebody installs it" — does not cover the install method
`maximal` actually uses. A broken export would surface at their `tsc` step
instead, later and on their side, not silently.

## Distribution: the tarball-URL cost does not apply to the real consumer

`docs/release.md` frames the cost of this shell's distribution as: "npm
cannot resolve a version range, so a consumer pins a URL and updates it
deliberately." That is true of the `npm install https://.../releases/download/...`
path, and it is not the path `maximal` takes. `github:` dependency
specifiers support a tag, a branch, or `#semver:<range>` matched against git
tags — and this repository already tags real semver (`v0.0.1`, `v0.0.2`).
`maximal` could write `github:stuffbucket/maximal-electron#semver:^0.0.2` and
float across our patch releases the same way a registry range would, at the
cost of trusting our tagging discipline instead of a registry's. Nobody has
asked for that yet, and #421 only asks to stop pinning a raw SHA, so the
tag pin above is the right size of change. But the framing that a consumer
"cannot" express a range is specific to the tarball-URL method this repo
documents and publishes for, and it is not how the one real consumer
installs this package. Worth correcting in `docs/release.md` the next time
that document is touched, since it currently describes a cost nobody pays
and omits the one that does apply (source build, not `verify:exports`).

## The agnostic seam: #15, #16, #17, #22 — real, but not urgent, and one risk

The client's own maintainer, commenting on #22, confirms `createHostWindow`
already meets #15's stated bar ("Shell builds and runs a trivial demo app
with no maximal dependency... currently reads as already met") and that the
client is "ready to consume... the moment packaging + `runMain` land." That
is an explicit statement that #15 is wanted, not yet blocking, because the
client wrote around its absence with its own `shell.ts` wrapper.

The literals #22 asks removed are real, not inferred from a title.
`src/shared/ipc.ts:333` reads `export const BRIDGE_KEY = 'stuffbucket'`.
`src/main/native/agent.ts:40` reads `const MAXIMAL_BASE =
'http://localhost:4141'`, and `src/shared/ipc.ts:123` types
`AgentProvider` as `'maximal' | 'ollama' | 'embedded'`. None of these ship
to a consumer — none of `native/agent.ts`, `shared/ipc.ts`, or
`preload/index.ts` is on an export path — but they are in `src`, and #16 as
worded ("parses `src` with the TS compiler API... scans src + docs +
strings") would fail against today's tree the first time it runs. Whoever
picks up #16 needs to either scope the guard to the export paths only, or
accept that #22's literal removal has to land in the same change, not after.
There is a second reason to remove `MAXIMAL_BASE`: it names the exact port
`maximal-core` reserves for itself (`maximal-core`'s own sidecar avoids
binding it — see `client/src/main/core.ts`'s `PREFERRED_PROXY_PORT`), so a
user running this shell's own demo app and the real `maximal` client at once
has two things probing the same port under the same name, for unrelated
reasons.

#17 is two issues wearing one number. The half that shipped —
`resolveBridge` no longer throwing on import, `src/renderer/lib/
resolve-bridge.ts`, merged in PR #27 — was confirmed by the client's
maintainer as "exactly #17" after reading this repository's branch directly.
But it shipped for this repository's own Storybook, not for a consumer: we
export no preload, so nothing about our bridge reaches `maximal/client`
either way. It wrote its own preload from three lines, independently. The
remaining scope in #17 — a single namespaced global, generic capabilities,
`{ok}` envelopes — describes a shape nobody will import unless a preload
entry point is added to `exports`, which is not proposed anywhere. Split
the done half out and close it; the rest has no consumer behind it yet.

One open question neither side has settled, raised by the client's
maintainer on #22 and unresolved as of this reading: does `maximal`'s UI get
*built with* this shell's controls (Button, Dialog, Tabs, the design system),
or does the shell host a thin window into a UI `maximal` owns outright? The
placeholder renderer answers nothing — it uses none of our components, but
it is explicitly a placeholder. `runMain`'s `options` shape is exactly what
this decision constrains, so #15 cannot be finished correctly before it is
settled, only built to one guess or the other.

## The host export's weight: #31 is not speculative, it is already paid

`stuffbucket-electron`'s `dependencies` field carries
`node-llama-cpp`, `@lydell/node-pty`, `ghostty-web`, five `@radix-ui/*`
packages, and `react-resizable-panels` — all of it, for a package whose only
consumed entry point needs `electron` alone. This is not a theoretical
cost: the client's own `node_modules/node-llama-cpp` and
`node_modules/@node-llama-cpp` total 51 MB, installed and present in the
worktree, for a function the client does not call. `client/node_modules` is
788 MB in total. #31 is already on the wrong milestone — tagged `v0.0.2`,
which shipped today, and still open. It should move to `v0.0.3` rather than
stay parked on a train that already sailed.

## What serves nobody

Checked against both siblings' open issues and their code, these have no
traceable consumer behind them. That does not make them wrong to fix — they
are this shell's own release and quality debt — but nothing in `maximal` or
`maximal-core` is waiting on any of them:

- **#69** (no secret configured for the macOS builder) and **#81**
  (`windows-msi-verify` cannot download from a draft). Both concern this
  repository's own installers. `maximal` builds and signs its own app
  through its own `.macos-builder` config and its own packaging CLI (#412);
  it does not consume our dmg or our msi. `docs/release.md` already states
  the tarball is what a library consumer needs and gates publish on that
  alone — these two issues are about the installer path the same document
  says is secondary now.
- **#79** (node-pty provenance and exact pinning) is real supply-chain
  hygiene, but it protects `./host/terminal`, which has no consumer yet.
- **#49** (icon seam untested on Windows/Linux), **#42** (Zed theme
  ingestion), **#52** (CI race on fast merges), **#55** (comment ratio),
  **#65** (contrast pair gap), **#24** (stills bistability), **#25** (e2e
  needs a live model) — none of these touch an export path, and none is
  named or implied by any open issue on either sibling. They are this
  repository's own engineering health.

## What I could not verify

- The design brief every `maximal` and `maximal-core` issue cites,
  `research_log/2026-08-04-codex-od-learnings-for-electron-client.md`,
  exists in that repository's history (`bd13a37`) but is not present on
  `main` or on the worktrees read for this document. Its content is
  represented here only through what the issues themselves quote.
- `client/` has not merged to `maximal`'s `main`. Everything about its
  actual import graph in this document comes from two worktrees
  (`electron-client`, `client-ci-task1`) that agree with each other; if a
  third, further-along branch exists and diverges, this document would be
  reading a stale snapshot.
- Whether `maximal-core`'s `feat/jsonrpc-mcp-control` branch (referenced in
  a comment on `maximal`#417) has since merged, and what that changes about
  the control-plane contract, was not checked — it does not touch this
  shell's exports either way.
