# Architecture

## Processes

```
main process                  preload (sandboxed)         renderer
─────────────                 ───────────────────         ────────
src/main/index.ts             src/preload/index.ts        src/renderer/main.tsx
  lifecycle, windows            contextBridge only          React 19 shell
src/main/ipc.ts               exposes: invoke, on
  handler map
src/main/native/*             ↑ both derive their types from ↓
  menu, tray, notifications
  preferences, updates              src/shared/ipc.ts
src/main/windows/*                  the contract
  main window, splash
```

## The contract

`src/shared/ipc.ts` is the load-bearing file.

`IpcContract` maps each channel to a request type and a response type.
`IpcEvents` maps each event to a payload. Everything else derives from those
two.

Three properties fall out, and each is enforced by the compiler rather than by
review:

1. **No missing handler.** `src/main/ipc.ts` types its handler map as
   `Record<IpcChannel, ...>`. Declare a channel without handling it and the
   build fails.
2. **No drift.** A handler's argument and return types come from the contract,
   so it cannot quietly return a different shape.
3. **No stale runtime list.** `IPC_CHANNELS` and `IPC_EVENTS` are checked
   against the type maps by an exhaustiveness assertion at the bottom of the
   file.

The preload bridge checks every name against those runtime lists. That check is
the security boundary: a compromised renderer cannot reach an arbitrary main
process handler, because the name is not in the set.

The renderer never sees `ipcRenderer`.

## The shell

A three-panel layout, in the shape Figma uses.

| Region | Component | Behaviour |
| --- | --- | --- |
| Title bar | `TitleBar` | Draggable. Hosts the document tabs. |
| Left | `LeftNav` | Collapses to an icon rail. Sections collapse on their own. |
| Centre | `Toolbar`, `Canvas` | Grid or list. Selection drives the inspector. |
| Right | `Inspector` | Properties when something is selected, settings when not. |

Libraries do the work that is easy to get wrong:

- `react-resizable-panels` owns panel width, collapse, and layout persistence.
  Version 4 exports `Group`, `Panel`, and `Separator`. It is not the version 3
  API most examples show.
- Radix supplies `Tabs`, `Collapsible`, and `Tooltip`, so keyboard navigation,
  roving focus, and ARIA wiring are not hand-rolled.
- `lucide-react` supplies icons.

Tabs live in the title bar rather than in a row of their own. That is where
Figma puts them, and it returns a row of vertical space to the canvas.

## Terminals

A tab is either the library grid or a terminal. The `+` button opens a terminal.

`ghostty-web` supplies the terminal. It is Ghostty's own virtual terminal
implementation compiled to WebAssembly, with the xterm.js API on top. Coder
built it for Mux, and it is MIT licensed.

It parses and renders. It does not run a process. The shell lives in the main
process, in `src/main/native/pty.ts`, which is what lets the renderer keep
`sandbox: true`.

```
keystroke -> term.onData -> `pty:write` channel -> shell
shell     -> `pty:data` event                   -> term.write
```

Three details are load-bearing.

- **Output is batched.** A build log emits thousands of small writes per
  second. One message each would swamp the channel, so `pty.ts` coalesces on an
  8 millisecond timer.
- **Terminals stay mounted.** Switching tabs hides the inactive host rather
  than unmounting it. A remount would kill the shell and lose the scrollback.
- **The content policy needs two additions.** `script-src` needs
  `'wasm-unsafe-eval'`, and `connect-src` needs `data:`. `ghostty-web` inlines
  its WebAssembly module as a data URL and fetches it at startup, so there is
  no separate asset to serve.

### Packaging the native module

`@lydell/node-pty` is native, and this is the part that breaks quietly.

It stays external to the Vite bundle. Bundling it would inline code that
resolves a `.node` file by relative path, and that path does not survive the
move into `.vite/build`. Being external means it has to arrive as real files.

Forge's Vite plugin sets `packagerConfig.ignore` to "keep only `/.vite`",
because it assumes everything is bundled. That excluded the module entirely.
The package built, every test passed, and a user would still have had no
terminal. `forge.config.ts` now supplies its own `ignore`, and
`scripts/verify-package.mjs` asserts the module is present.

## Design tokens

`src/renderer/styles/tokens.css` follows the scale and the naming in
`maximal`'s `shell/src/ui/styles/tokens.css`, so a component can move between
the two projects. The palette differs, because this is a document-style
application rather than a menu-bar utility.

Components reference semantic names only. No component contains a hex value.

## Native integration

| Feature | Module | Note |
| --- | --- | --- |
| Splash | `windows/splash.ts` | Self-contained HTML. A timer closes it, so a missed signal cannot strand it. |
| Application menu | `native/menu.ts` | Sends typed events. It never mutates renderer state directly. |
| Menu bar or tray | `native/tray.ts` | Optional, driven by a preference. macOS needs a `Template` image. |
| Notifications | `native/notifications.ts` | Also owns the dock bounce. |
| Dock badge | `native/notifications.ts` | The renderer reports a count; the main process decides whether to show it. |
| Preferences | `native/preferences.ts` | One JSON file under `userData`. |
| Updates | `native/updates.ts` | Returns `unsupported`. See `docs/release.md`. |
| Overlay | `windows/overlay.ts` | Non-activating panel on the cursor's display. |
| Agent | `native/agent.ts` | pi coding agent. Finds maximal or Ollama. No API key. |
| Tool approval | `native/approval.ts` | Decides what the agent must ask about. Pure, and mutation tested. |

The menu and the tray both route through `sendEvent`, so the React shell stays
the single owner of view state.

## Build output

| Source | Output | Why |
| --- | --- | --- |
| `src/main/index.ts` | `.vite/build/main.js` | `entryFileNames` is explicit, or it collides with preload. |
| `src/preload/index.ts` | `.vite/build/preload.js` | Emits CommonJS: a sandboxed preload cannot use ES modules. |
| `src/renderer/*.html` | `.vite/renderer/main_window/` | `root` is set, so `outDir` must be absolute. |

That last row is a real trap. Forge's default `outDir` is relative to the root
it supplies. Override `root` without also setting `outDir` and the renderer
builds into `src/renderer/.vite/`, where the package never finds it.

## Testing

| Layer | Tool | Covers |
| --- | --- | --- |
| Unit | Vitest | Main-process logic and contract types. |
| End to end | Playwright | Behaviour and computed layout, against the built bundles. |
| Packaging | `scripts/verify-package.mjs` | asar contents and fuse values. |

The third layer exists because the second cannot reach it. Playwright attaches
through the Node inspector, and `EnableNodeCliInspectArguments: false` disables
that on a packaged binary. So the end-to-end tests drive the unpackaged build,
and a separate script checks what only a package can show.

Reference screenshots go through `capture` in `e2e/harness.ts`, not
`page.screenshot`. macOS stops compositing an occluded window. The plain call
then blocks until its timeout instead of returning. `capture` reads the
renderer through the debugger. So it does not depend on what is in front.

A run also keeps off the developer's screen. The overlay is built to sit above
full-screen applications and take the keyboard, which is correct in production
and hostile during sixteen scenarios. Under `STUFFBUCKET_E2E` the windows move
off the side of the display instead. They still show, still report visible, and
still lay out identically. `STUFFBUCKET_E2E_VISIBLE=1` puts them back.

Moving them is deliberate. Making them transparent works too, and it stops the
compositor producing content. The images came out blank while the suite stayed
green. `capture` now rejects an image under a size floor for that reason.
