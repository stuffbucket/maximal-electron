# Embedding this shell

This shell is a package another application composes. This document is the
contract for that: what a consumer imports, what it passes, and what changes
under it without warning.

`maximal/client` is the consumer this was built for. It composes the shell from
its own `src/main/shell.ts`, spawns its own service, and owns its own renderer.
Nothing about that application appears here, and nothing about it may: a port
number, a home directory variable, a control path, or a provider name in this
repository is a defect, not a convenience.

## The exports

| Specifier | What it is |
| --- | --- |
| `./main` | `runMain`, the main-process lifecycle |
| `./host` | `createHostWindow`, one secured window |
| `./host/terminal` | The terminal host |
| `./renderer` | The React control surface |
| `./renderer/styles.css` | The structural stylesheet |
| `./verify` | Packaging checks a consumer runs against its own build |

All of it is a `tsc` emit, not a bundle: `npm run build:package` runs `tsc`
twice and copies the stylesheet. A consumer imports source-shaped ES modules
and bundles them itself, so its own externals, its own Electron version, and
its own tree shaking apply. `npm run verify:exports` proves each target exists,
that `npm pack` includes it, and that `./main` declares the names below.

## `runMain(runtime, options)`

`runMain` is `./host` plus a lifecycle. It owns the profile directory, the
single instance lock, opening and reopening the window, the quit policy, and
the deferred shutdown. It decides nothing about the application it hosts.

```ts
import { app } from 'electron';
import { RUN_MAIN_OPTIONS_VERSION, runMain } from 'stuffbucket-electron/main';

await runMain(
  { app },
  {
    version: RUN_MAIN_OPTIONS_VERSION,
    discoverDaemonUrl: () => supervisor.start(),
    window: ({ daemonUrl }) => ({
      preloadPath: join(__dirname, 'preload.js'),
      title: 'Consumer',
      width: 1280,
      height: 820,
      loadRenderer: (window) => void window.loadFile(page),
    }),
    beforeShutdown: () => supervisor.stop(),
  },
);
```

`runtime` carries `app` and an optional `platform`. Injecting the runtime
rather than importing it is what lets the unit suite drive the whole lifecycle
in plain Node, without an Electron process.

### The order

1. `userDataDirectory` is applied. It has to precede the lock, because Chromium
   derives the lock from the profile directory.
2. The single instance lock is taken. Without it, `runMain` quits this process
   and resolves with no window, and no handler is registered.
3. `whenReady`.
4. `discoverDaemonUrl` runs once. Its result is normalized and put on the
   context.
5. `onReady` runs, with the context. Register channels here: it precedes the
   first window, so nothing the renderer calls is missing when it loads.
6. `window(context)` is asked for options, and the window opens.

`onActivate` then runs on every activation — a dock click, a menu bar click, a
second launch. `runMain` opens a replacement window when none is left, and
`onWindowCreated` runs for every window it opens.

### The options

| Field | Default | What it does |
| --- | --- | --- |
| `version` | required | `RUN_MAIN_OPTIONS_VERSION`. Anything else throws |
| `window` | required | Options for each window, given the context |
| `userDataDirectory` | Electron's own | Profile directory |
| `singleInstance` | `true` | Take the single instance lock |
| `keepRunningWithoutWindows` | `() => false` | Survive the last window on every platform |
| `discoverDaemonUrl` | none | An origin to resolve before the first window |
| `onReady` | none | After discovery, before the first window |
| `onActivate` | none | Every activation, with the surviving window |
| `onWindowCreated` | none | Every window the shell opens |
| `beforeShutdown` | none | Release what the application owns |

`keepRunningWithoutWindows` is a callback rather than a value because the
answer changes while the application runs: this shell reads a preference the
user can toggle. macOS keeps an application alive without windows regardless.

`beforeShutdown` returning a promise defers the quit until it settles, and the
quit that follows does not run it again. Returning nothing lets the quit
through untouched. This shell has an embedded model that aborts the process if
its worker outlives the Node environment; `docs/agent.md` has that account.

`discoverDaemonUrl` is deliberately blunt about what it hands back: a
normalized absolute URL with no trailing slash, on `context.daemonUrl`. How it
reaches the renderer is the consumer's decision, because the mechanism belongs
to the preload it wrote. The shell does not inject it, does not proxy it, and
does not know what speaks on it. A relative or empty value fails there, where
the message can name the callback, rather than as a blank window.

## Versioning

`options` carries `version`, and `RUN_MAIN_OPTIONS_VERSION` is exported next to
`runMain`. A call site written against another shape throws by name at the
first line of `runMain` instead of reading a field that moved.

Package semver was the alternative and does less: a consumer pinning this
repository by git ref, which the one real consumer does, gets whatever the ref
holds with no version to check. A `runMainV1` export was the other, and it
multiplies entry points for a shape that will mostly gain optional fields.

Adding an optional field does not change the version. Renaming or removing one,
or changing what an existing field means, does. The old version then throws
rather than reading a field that is no longer there.

## What is not here

There is no preload export. `maximal/client` wrote its own in three methods,
and a bridge nobody imports is a shape nobody has tested. The renderer-side
half of that, `resolveBridge`, exists for this repository's own Storybook.

`src/main/index.ts` runs on `runMain`, which is the point: a seam this
repository's own application does not use is exercised by nothing anybody runs,
and it drifts. `npm run test:e2e` drives that application.
