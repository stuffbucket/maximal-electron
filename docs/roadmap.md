# Roadmap

Work that is scoped but not built. Each entry records what I verified, so the
next person does not repeat the research.

## 1. Ghostty in the tab webview

**Status: done.** See `docs/architecture.md` for the design.

`coder/ghostty-web` is the answer: Ghostty's virtual terminal compiled to
WebAssembly, with the xterm.js API, MIT licensed, built for Coder's Mux. The
shell runs in the main process through `@lydell/node-pty`, which keeps the
renderer sandboxed.

I was wrong in an earlier version of this document. I claimed no web or
WebAssembly build existed. My search was one query with poor terms. There is a
whole ecosystem: `ghostty-web` and `@slopus/ghostty-wasm` on npm, plus
`libghostty-vt` users such as `restty`, `hauntty`, and an Obsidian plugin.

**Remaining work.**

- Verified on macOS only. The prebuilt pty covers Windows and Linux, but no one
  has run it there.
- No tab-level working directory. Every shell starts in the home directory.
- No flow control. A process that floods output will still outrun the batcher.

## 2. Floating overlay, in the wiggle model

**Status: working.** Summon with the accelerator, or the sparkle button in the
title bar.

The Electron translation of wiggle's design:

| Concern | Wiggle | Here |
| --- | --- | --- |
| Window | Non-activating `NSPanel` | `BrowserWindow` with `type: 'panel'` |
| Stacking | Above full screen | `setAlwaysOnTop(true, 'screen-saver')` |
| Dim and card | CSS | CSS |
| Placement | Focused monitor | `getDisplayNearestPoint` on the cursor |
| Summon | Double tap of Ctrl | `CommandOrControl+Shift+Space` |

Two decisions worth keeping.

- **No hide on blur.** The window covers the display, so a click outside the
  card already hits the scrim. A blur handler on top of that makes the card
  vanish whenever a notification steals focus.
- **`showInactive` then `focus`.** That pair puts the panel on screen and gives
  it key input without activating this application.

### The remaining gap: double tap of Ctrl

`globalShortcut` cannot bind a bare modifier, so it cannot see a double tap.
That needs a native monitor: either a small addon around
`NSEvent.addGlobalMonitorForEvents`, or `uiohook-napi`. Both need the
Accessibility permission on macOS, which the application must request and
explain.

The accelerator exists so the feature is usable and testable before that lands.
It is a preference, so the native monitor can replace it without a redesign.

## 3. The overlay agent

**Status: working, with tools and streaming.** Verified end to end: the overlay
asked the agent to run `echo AGENT_TOOL_5521` through its bash tool, and it
reported the real output.

It runs the **pi coding agent**, from `badlogic/pi-mono`:

| Package | Role |
| --- | --- |
| `@earendil-works/pi-ai` | Provider layer. Streams from the local endpoint. |
| `@earendil-works/pi-agent-core` | The agent loop, tools, and session state. |

Both pinned at 0.83.0. Note the repository is `badlogic/pi-mono`. `badlogic/pi`
is a different project, a vLLM deployment CLI, and is easy to vendor by
mistake.

Discovery copies wiggle, and the property worth keeping is that there is
**nothing to configure to start**:

1. Try maximal on `localhost:4141`. It speaks the Anthropic API.
2. Fall back to Ollama on `localhost:11434`, through its OpenAI-compatible path.
3. If neither is up, say so plainly. Never demand a key.

So this application holds no API key, and maximal is the default backend
without being a hard dependency.

### Two details worth knowing

**The tool bridge.** `AgentHarnessTool.execute` takes its context as a fifth
argument. The plain `Agent` does not pass one. `buildTools` closes over that
context, and that closure is the whole bridge between the two layers.

**Tools mean shell access.** The agent gets read, write, edit, and bash in the
working directory. That is what makes it a coding agent rather than a prompt
box. It is also why `agentTools` is a preference, with a switch in the
inspector.

### The approval gate

**Status: working.** A tool call stops and asks before it runs.

`beforeToolCall` blocks the agent loop on a promise. The overlay card then
grows a prompt showing the tool and what it would act on. That is the command
for `bash`, and the path for anything touching a file. Enter allows, Escape
denies, and a third button allows that one tool for the rest of the run.

The policy is a preference, `agentApproval`:

| Value | Behaviour |
| --- | --- |
| `writes` | Default. Reading is free; anything that can change the machine asks. |
| `all` | Every tool asks, including reads. |
| `none` | Never ask. The unattended behaviour, as a deliberate choice. |

Three properties are load-bearing.

- **The gate denies on every edge.** A prompt nobody answers times out after
  45 seconds. Abort denies. Dismissing the card denies. A gate that can hang is
  worse than no gate. The run would hold the agent busy until restart.
- **Remember is per run, and allow only.** Nothing about a decision is stored
  on disk. A remembered deny would break the rest of a run silently.
- **The tool list is an allow-list.** An unrecognised tool asks, so adding one
  cannot quietly widen what runs unattended.

`src/main/native/approval.ts` holds that logic, free of `electron`, so it is
mutation tested rather than merely covered.

### Not yet done

- **No conversation.** Each summon starts a fresh transcript. `pi-agent-core`
  has session storage; wiring it is the next step.
- **No skills or compaction.** `pi-agent-core` ships both.
- **The prompt shows arguments, not effects.** An `edit` call names the file,
  not the diff. Reviewing a change needs the diff.

## Sequencing

The overlay, the terminal, the agent, and the approval gate all work. What is
left, in order:

1. Conversation history across summons.
2. A diff view in the approval prompt for `edit` and `write`.
3. The double-tap Ctrl monitor, which needs a permission prompt.
4. Windows and Linux verification for the terminal and the overlay.
