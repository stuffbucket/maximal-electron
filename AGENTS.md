# AGENTS.md

Instructions for coding agents working in this repository. Read this before you
change anything. `CLAUDE.md` points here.

This file holds the rules that apply on every change. Everything else is in a
linked document, and the link is the instruction to go and read it before
working in that area. If a rule here looks arbitrary, the reason is in the
linked document.

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
| Look at a component | `npm run storybook` |
| Check every story | `npm run storybook:check` |
| Check the palette | `npm run check:contrast` |
| Package | `npm run package` |
| Verify a package | `npm run verify:package` |
| Verify the docs | `npm run verify:docs` |
| Regenerate icons | `npm run icons` |

Run `npm run lint:fix` after you change code. Do not ask first.

Run `npm run typecheck` and `npm test` before you report a change as done.

## Never

Each of these is load-bearing. Do not relax one to make a change fit.

- **Never add an API key**, or any credential. Discovery finds a provider on
  localhost. A key in this repository is a defect, and no Apple credential
  belongs here.
- **Never expose `ipcRenderer` through `contextBridge`.** The renderer gets
  `invoke` and `on`, both of which reject a name outside the contract.
- **Never weaken `contextIsolation: true`, `nodeIntegration: false`, or
  `sandbox: true`** on any window.
- **Never widen the `shell:open-external` allow-list** beyond `http`, `https`,
  and `mailto`. `setWindowOpenHandler` denies, and `will-navigate` blocks
  cross-origin navigation. Both send the URL to the real browser instead.
- **Never let a channel take a filesystem path from the renderer.** That is an
  arbitrary file read and a path traversal surface. The application icon is the
  worked example: it is configuration the host owns, through
  `STUFFBUCKET_ICON_DIR`, not a request the renderer makes.
- **Never lower the mutation threshold.** `npm run mutate` breaks below 100.
- **Never turn a fuse back on to make a test pass.**
  `EnableNodeCliInspectArguments: false` is why the end-to-end tests drive the
  unpackaged build.
- **Never add an asset to a published release.** GitHub rejects it with HTTP
  422. Everything attaches to the draft.

## Report what you verified

State the command you ran and what it printed. A check that greps for an error
string and matches nothing is not a pass; that has produced two false reports
here. If you did not run something, say so. If a step was skipped or a test
failed, say that first.

Green unit tests are not sufficient for a layout change, and a screenshot is
not an oracle. See `docs/testing.md` before you claim a visual change is
neutral.

## Writing code

- Target under 300 lines for a module, excluding tests. Past roughly 400 lines,
  add a new module instead of growing the file. This applies most to
  `src/renderer/App.tsx` and `src/main/index.ts`, which both attract unrelated
  changes.
- Match the density and idiom of the surrounding code.

### Comments

The default is no comment. A comment earns its place by recording something the
code cannot: a constraint from outside the file, a rejected alternative, or the
failure that produced the shape.

- **Do not restate code.** A comment that says what the next line says creates
  two things to keep in step, and they drift.
- **Keep a comment shorter than the code it explains.** One or two lines above a
  rule, up to about five above a function. Past that the explanation is a
  document, so put it in `docs/` and leave one line pointing there. A ten line
  block over a one line rule is the case this is written for.
- **State the constraint, not the story.** "macOS throttles an occluded
  renderer" earns its line. Three paragraphs retelling how that was discovered
  do not; name the issue number instead and let the issue hold the account.
- **Do not narrate the change.** The code is the current state, not a history.
  Anything of the form "changed from X" or "used to be Y" belongs in the commit
  message.
- Every comment costs attention on every future read, not only the one where it
  was useful. Delete one that has stopped paying.

## Writing prose

Keep sentences short. Do not use contractions. Name the component that acts,
rather than writing a passive that leaves the actor out: `pty.ts` coalesces
output, rather than output is batched.

There is no automated style check. Style here needs judgement, and the one tool
that was tried could not tell a rule from a description. `npm run verify:docs`
checks names, not prose.

## Releases

- Work is marshalled on a `release/x.y.z` branch and folded into `main` when the
  release is cut. **Target the release branch, not `main`.** The tag goes on
  `main` at the fold, and the tag is what starts the build.
- **Two trains are open at all times**, at `n+1` and `n+2` from the shipped
  version. Cutting one opens the next, so there is always somewhere to put work
  that is not the current release.
- Every issue and every pull request carries a milestone. If it does not have
  one, it has not been triaged.
- **Never delete a branch that another pull request targets.** GitHub closes the
  children rather than retargeting them, and a closed pull request whose base is
  gone cannot be reopened. Retarget every child first. This has cost a rebuild
  twice.
- Bump the patch version on the release branch when the train reaches a stable
  state, so `main` never claims a version that has not shipped.

See `docs/release.md`.

## Where the rest of the rules are

Read the linked document before working in that area. Each one holds rules, not
only background.

| Area | Document |
| --- | --- |
| Processes, the IPC contract, terminals, build output | `docs/architecture.md` |
| The overlay agent, the provider chain, the approval gate | `docs/agent.md` |
| Random order, mutation testing, layout evidence, the off-screen suite | `docs/testing.md` |
| Stories, the a11y run, what is deliberately not in CI | `docs/storybook.md` |
| Capture and compose, the pacing constants | `docs/recording.md` |
| Trains, the draft release, macOS signing | `docs/release.md` |
| Code signing | `docs/signing.md` |
| What is planned and what is deliberately not | `docs/roadmap.md` |

Skills carry the walk-throughs: `.claude/skills/add-ipc-channel/SKILL.md`,
`.claude/skills/verify-ui/SKILL.md`, and `.claude/skills/cut-release/SKILL.md`.

## Two rules that live outside those documents

**Fuses.** `forge.config.ts` fuses the packaged binary, and
`scripts/verify-package.mjs` holds a copy of the expected values. Change both in
the same commit, or the check passes on a stale expectation. A change to
`FusesPlugin` also invalidates an existing signature, so say so in the pull
request: the macOS build must be redone.

**External native modules.** Adding one means editing three places: the Vite
external list, the `packagerConfig.ignore` filter in `forge.config.ts`, and
`scripts/verify-package.mjs`. Miss one and the package builds, the tests pass,
and the feature is absent for a user. `node-pty` needs a fourth: `prunePrebuilds`
in `forge.config.ts` drops the platforms a build cannot use, and it throws
rather than skipping.

**Icons** are a third instance of the same duplication. `STUFFBUCKET_ICON_DIR`
names the directory, defaults to `build/icons`, and is the seam a consumer
swaps. `forge.config.ts` and `scripts/verify-package.mjs` each hold a copy of
the run-time file names; change both in one commit. Resolution lives in
`src/main/native/icons.ts`, which imports no `electron` and is on the mutate
list — keep it that way, and leave `nativeImage` to `app-icon.ts`. A macOS
development run shows Electron's own dock icon until `app.dock.setIcon` runs.
That is not a defect, and packaging does not change it.
