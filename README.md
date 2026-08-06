# Stuffbucket

A reference Electron application. It exists to be forked.

It answers two questions that every desktop project has to answer, and that
most templates leave out:

1. How does this build and ship on macOS and Windows, with real signing?
2. How does an agent work in this repository without breaking it?

Screenshot of the shell: `test-results/shell.png`, after `npm run stills`.

## What is here

| Area | Choice |
| --- | --- |
| Framework | Electron 43 with Forge 7. |
| Renderer | React 19 on Vite 7. |
| Layout | Radix and `react-resizable-panels`. |
| Terminal | `ghostty-web` over `node-pty`. |
| Agent | pi coding agent, or an embedded model. |
| macOS | Signed dmg from a private builder. |
| Windows | Per-user MSI from WiX 5. |
| Tests | Vitest and Playwright. |
| Demos | A scripted screen recorder that drives the real app. |
| Harness | `AGENTS.md` and `.claude/skills/`. |

## Quick start

```bash
npm ci
npm start
```

Other commands are in [AGENTS.md](./AGENTS.md).

## The shell

A three-panel layout in the shape Figma uses:

- A **collapsible left navigation** that reduces to an icon rail, with
  sections that collapse on their own.
- **Document tabs in the title bar**, not in a row of their own.
- **Real terminals in tabs.** The `+` button opens a shell, rendered by
  Ghostty's own emulator compiled to WebAssembly.
- A **floating overlay** running a coding agent, summoned by accelerator. It
  streams, uses tools, and asks before it touches anything. There is no API
  key, and nothing to install: it prefers a local proxy when one is running,
  and otherwise runs a small model inside the application.
- A **grid and list canvas** with selection.
- A **collapsible right inspector** that shows properties when something is
  selected, and settings when nothing is.

Panel sizes persist across restarts.

Native integration covers a splash window and the application menu. It also
covers an optional menu bar or tray icon, notifications, and an update check.
A dock badge tracks real application state.

## Consume the shell frame

Install it from a git ref, or from the tarball a release attaches:

```json
"stuffbucket-electron": "github:stuffbucket/maximal-electron#<ref>"
"stuffbucket-electron": "https://github.com/stuffbucket/maximal-electron/releases/download/v0.0.3/stuffbucket-electron-0.0.3.tgz"
```

`dist/` is built by a lifecycle script rather than committed, and npm runs a
different one for each form. A `codeload.github.com` archive URL runs neither,
so that form is unsupported and refuses to install. This package is not on the
npm registry. Read [docs/consuming.md](./docs/consuming.md).

Either supported form exposes the secured host window at
`stuffbucket-electron/host` and the generic renderer frame at
`stuffbucket-electron/renderer`. The renderer entry exports `ShellLayout`,
`TitleBar`, `TabBar`, `NavRail`, `Canvas`, and `IconButton`. It does not export
the reference application, terminal, agent, sample data, or fixtures.

Import the structural styles separately:

```ts
import {
  Canvas,
  NavRail,
  ShellLayout,
  TabBar,
  TitleBar,
} from 'stuffbucket-electron/renderer';
import 'stuffbucket-electron/renderer/styles.css';
```

The stylesheet ships no palette and scopes every rule under `.sb-shell`.
`ShellLayout` applies that root class. Apply it yourself when composing the
smaller exports directly. Define these semantic variables on that container or
an ancestor:

| Variable | Contract |
| --- | --- |
| `--shell-background` | Window chrome and side-panel surface. |
| `--shell-canvas` | Main document surface and active tab. |
| `--shell-raised` | Tooltip and other floating surfaces. |
| `--shell-text` | Primary foreground. |
| `--shell-text-muted` | Secondary foreground and inactive controls. |
| `--shell-text-subtle` | Tertiary labels and counts. |
| `--shell-border` | Dividers and quiet outlines. |
| `--shell-hover` | Hovered controls. |
| `--shell-active` | Pressed or nested hover controls. |
| `--shell-accent` | Selection, focus, and resize feedback. |
| `--shell-accent-muted` | Selected-control background. |

Sixteen more variables have structural fallbacks in the CSS, and two are read
by JavaScript rather than by any rule. `docs/shell-variables.md` holds the whole
contract, derived from the stylesheet and checked against it in both directions.
Set the ones your design system disagrees with.
`stuffbucket-electron/verify/shell-variables` exports the derivation so an
application can assert its own adapter against the stylesheet it installed.

`TitleBar` accepts caller-owned `leading` and `actions` nodes. Direct `TitleBar`
and `TabBar` consumers provide `tabIdBase` and use `getTabTriggerId` and
`getTabPanelId` on their document tabpanels. `ShellLayout` creates that
association from `layoutId`. It also accepts the same title bar regions and an
optional panel-toggle subscription adapter, so host IPC stays in the consuming
application.

Run `npm run build:package` after changing an exported source file. Run
`npm run verify:exports` to rebuild, inspect the complete renderer import graph,
and verify that every export target appears in `npm pack`.

## Package the terminal

`stuffbucket-electron/host/terminal` and `stuffbucket-electron/renderer` give a
working terminal and leave two packaging traps behind.

- `ghostty-web` inlines its WebAssembly as a data URL and fetches it at startup.
  The content policy needs `'wasm-unsafe-eval'` in `script-src` and `data:` in
  `connect-src`, or the terminal renders nothing.
- `node-pty` is native. Keep it out of the bundler, and unpack its whole
  prebuild directory rather than only `*.node`. On macOS the shell is started by
  `spawn-helper`, which has no extension and is executed from outside the
  archive.

`stuffbucket-electron/verify` exports those assertions as a function to run
against a built application. `docs/architecture.md` has the call.

## Your own icon

The dock, taskbar, window, and menu bar icons all come from one directory.
`STUFFBUCKET_ICON_DIR` says which one, so a fork brands its build without
editing the shell.

```bash
STUFFBUCKET_ICON_DIR=~/brand/icons npm run package
STUFFBUCKET_ICON_DIR=~/brand/icons npm start
```

The directory must carry all six names. `npm run icons` writes them, and honours
the same variable, so it can seed a new set.

| File | Used for |
| --- | --- |
| `icon.icns` | The macOS bundle icon. |
| `icon.ico` | The Windows executable icon. |
| `icon.png` | 512 square. Linux, the dock, the taskbar, and the window. |
| `tray.png` | 32 square, full colour. The Windows and Linux tray. |
| `trayTemplate.png` | 16 square, alpha only. The macOS menu bar. |
| `trayTemplate@2x.png` | 32 square, alpha only. The same, on a retina display. |

`forge.config.ts` reads the variable at build time and fails the build when a
name is missing. `src/main/native/icons.ts` reads it again at run time, which is
what makes an unpackaged `npm start` on macOS show the icon: **a development run
takes its dock icon from Electron itself**, and no amount of packaging changes
that, so `app.dock.setIcon` is the only way to see it before a build.

There is no channel for this. The renderer cannot set an icon, because a
filesystem path taken from a renderer and loaded as an image is an arbitrary
file read. The icon belongs to whoever launches the application.

A consumer depending on this shell as a package passes `icon` to
`createHostWindow` instead, and sets `packagerConfig.icon` in their own Forge
configuration.

## Demos

The application can drive itself and record the result. `demo/` holds the mp4s
and stills that produces.

```bash
npm run package
npm run record                  # drive the app, then cut the video
npm run compose -- workflow     # re-cut, without touching the app
```

Nothing in the output is a mock. The window is the window `npm start` opens,
the terminal runs a real shell, and the overlay talks to a real model through
the real approval gate. So a change that breaks the interface breaks the
recording, and a demo cannot quietly go stale.

Recording is two steps. **Capture** drives the application and keeps every
frame. **Compose** cuts those frames into a video. An edit file says what plays,
in what order, how long each beat holds, and where it freezes.

That split is what makes the timing workable. A capture takes about 45 seconds.
A re-cut takes about 6, and needs no build and no application.

See [docs/recording.md](./docs/recording.md).

## Release

Push a tag. Every asset lands on a draft release, and one job publishes it.

```bash
git tag -a v0.1.0 -m "Release 0.1.0"
git push origin v0.1.0
```

macOS signing runs in the private `stuffbucket/macos-builder`. **No Apple
credential belongs in this repository.** Windows ships unsigned, which is an
organisation-wide decision.

Read [docs/release.md](./docs/release.md) and
[docs/signing.md](./docs/signing.md).

## Known gaps

Stated here rather than discovered later.

- **No auto-update.** An MSI has no update feed, and the macOS builder's
  updater artifact is in Tauri's format, which Electron cannot read.
  `docs/release.md` gives the exact change that would unblock it.
- **The overlay agent has shell access when tools are on.** That is what makes
  it a coding agent. It asks before it runs anything that can change the
  machine, and the "Ask before running" setting controls how much it asks.
  Turn the tools off entirely with the "Agent tools" switch.
- **The summon accelerator is not a double tap of Ctrl.** Electron cannot bind
  a bare modifier without a native monitor.
- **No Linux release.** The makers are configured but no job builds them.
- **The concierge model downloads on first use.** About 610 MB, once, into the
  user data directory. The installer stays small and the model can be upgraded
  without a new build, but a first run with no network and no proxy cannot
  answer.
- **macOS is arm64 only.** The build runner is Apple Silicon.
- **Windows is unsigned.** SmartScreen warns on first run.
- **Placeholder icons.** `scripts/gen-icons.mjs` draws them. Replace the output
  with designer assets before a public release, or point
  `STUFFBUCKET_ICON_DIR` at your own set.

## Fork it

Read [.claude/skills/port-to-project/SKILL.md](./.claude/skills/port-to-project/SKILL.md).

The short version: rename the app, and mint a new WiX `UpgradeCode`. Point
`.macos-builder/config` at your build output, and `STUFFBUCKET_ICON_DIR` at
your icons. Then do the two manual onboarding steps in the GitHub interface.

## Credits

The release mechanics and the agent harness follow two existing projects.

- `openai/codex` contributes the `tag-check` gate, the tag-triggered release,
  the prescriptive `AGENTS.md`, and the self-contained skill format. It
  contains no Electron; only these patterns transfer.
- `stuffbucket/maximal` contributes the draft-then-publish release shape, the
  private macOS builder contract, the WiX installer, the design token scale,
  and the layout-verification discipline in
  `.claude/skills/verify-ui/SKILL.md`.
