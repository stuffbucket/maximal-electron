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
| `./preload` | `exposeBridge`, the generic renderer bridge |
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
import { RUN_MAIN_OPTIONS_VERSION, runMain } from '@stuffbucket/maximal-electron/main';

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

`runtime` carries `app`, an optional `platform`, and an optional
`crashReporter`. Injecting the runtime rather than importing it is what lets
the unit suite drive the whole lifecycle in plain Node, without an Electron
process.

### The order

1. `userDataDirectory` is applied. It has to precede the lock, because Chromium
   derives the lock from the profile directory.
2. `collectCrashDumps` starts the crash reporter, if it is on. It has to follow
   the profile: Crashpad reads `userData` once, when it starts.
3. The single instance lock is taken. Without it, `runMain` quits this process
   and resolves with no window, and no handler is registered.
4. `whenReady`.
5. `discoverDaemonUrl` runs once. Its result is normalized and put on the
   context.
6. `onReady` runs, with the context. Register channels here: it precedes the
   first window, so nothing the renderer calls is missing when it loads.
7. `window(context)` is asked for options, and the window opens.

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
| `collectCrashDumps` | `false` | Write a local minidump for every process the shell owns |
| `keepRunningWithoutWindows` | `() => false` | Survive the last window on every platform |
| `discoverDaemonUrl` | none | An origin to resolve before the first window |
| `onReady` | none | After discovery, before the first window |
| `onActivate` | none | Every activation, with the surviving window |
| `onWindowCreated` | none | Every window the shell opens |
| `onWindowAllClosed` | none | The last window closed, with the quit decision |
| `beforeShutdown` | none | Release what the application owns |

`keepRunningWithoutWindows` is a callback rather than a value because the
answer changes while the application runs: this shell reads a preference the
user can toggle. macOS keeps an application alive without windows regardless.

`collectCrashDumps` is off by default and needs `runtime.crashReporter` when it
is on, or `runMain` throws rather than starting nothing in silence. A crash
reporter is process-wide, so starting one inside somebody else's application is
their decision and not this shell's, and a consumer that already runs one would
otherwise get a second. Nothing is uploaded either way: there is no
`submitURL`, no endpoint, and no credential. See `docs/architecture.md` for
where the dumps land and what covers them.

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

`onWindowAllClosed` receives the decision rather than the inputs to it, and it
runs before the shell acts. An application that reacts to the last window
closing — this one pulls its dock icon out — therefore never recomputes the
policy and never depends on where its own listener sits in the order. It
observes; `keepRunningWithoutWindows` is what changes the answer.

## Registering your own handlers

`runMain` takes `app` rather than owning it, so a consumer can call `app.on`
for anything the options do not cover. Two listeners on one event are fine.
Guessing at the ordering is not, so this is what the shell has already done on
each event it listens to.

| Event | Registered | State when a consumer's listener runs |
| --- | --- | --- |
| `second-instance` | after `whenReady` | The shell activates: a surviving window is passed to `onActivate`, or a replacement window is opened |
| `activate` | after `whenReady` | The same |
| `window-all-closed` | before `whenReady` | The shell may already have called `app.quit()`, depending on registration order. Use `onWindowAllClosed` instead, which is called before the decision is acted on |
| `before-quit` | before `whenReady` | The shell may already have called `preventDefault` and started `beforeShutdown`, depending on registration order |

A listener registered before `runMain` runs first; one registered after it
resolves runs second. Both of the events where that difference is observable
have an option, and the option is the supported route.

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

`src/main/index.ts` runs on `runMain`, which is the point: a seam this
repository's own application does not use is exercised by nothing anybody runs,
and it drifts. `npm run test:e2e` drives that application, and it now drives
the bridge with it.

There is no renderer-side client for the bridge. `resolveBridge` in
`src/renderer/lib/resolve-bridge.ts` answers "is a bridge here", and it is not
exported. A consumer writes `typeof window.myApp?.openExternal === 'function'`,
which is one line and needs no package.

## The preload bridge

`@stuffbucket/maximal-electron/preload` is the seam issue #17 asks for: one
namespaced global, generic native powers, `{ok}` envelopes, working under
`sandbox: true`. `maximal/client` wrote three methods of it by hand because
this export did not exist.

```ts
// the consumer's own preload entry, bundled by the consumer's own bundler
import { exposeBridge } from '@stuffbucket/maximal-electron/preload';

exposeBridge({ namespace: 'myApp' });
```

```ts
// the consumer's main process
window: ({ daemonUrl }) => ({
  preloadPath: join(__dirname, 'preload.js'),
  bridge: { capabilities: ['openExternal', 'versions'], serviceOrigin: daemonUrl },
  // …
}),
```

```ts
// the consumer's renderer
const bridge = (window as { myApp?: Bridge }).myApp;
if (bridge?.openExternal) {
  const result = await bridge.openExternal('https://example.com');
  if (!result.ok) console.warn(result.code, result.message);
}
```

`namespace` has no default. A key this package picked would be one every
consumer collides on, and issue #22 asks for it caller-set.

### The capabilities

| Capability | Channel the host handles | Argument |
| --- | --- | --- |
| `openExternal` | `shell:open-external` | `{ url }` |
| `versions` | `app:versions` | none |
| `checkForUpdate` | `update:check` | none |

Those channel names are literals in `src/preload/capabilities.ts`, not an
import of `src/shared/ipc.ts`. A bridge that imported this shell's contract
would put this repository's own application on the export graph, and
`npm run verify:neutral` fails on exactly that. The duplication owes a check
and has one: `tests/bridge-capabilities.test.ts` asserts every channel the
bridge names is one this shell answers.

`serviceOrigin` is a value rather than a channel. `runMain` already resolves
`discoverDaemonUrl` before the first window, so the origin exists by the time
`window(context)` is called and there is nothing to round-trip. It arrives as
`bridge.serviceOrigin`, normalized, or `null`. A scheme other than `http` or
`https` is refused rather than injected.

### Feature detection

A method the host did not declare is **absent**, not present and failing. The
whole feature test is `typeof bridge.openExternal === 'function'`, and
`bridge.capabilities` lists what the host declared.

The declaration travels through `webPreferences.additionalArguments`, which
Electron appends to the renderer's `process.argv` and which a sandboxed preload
reads. `createHostWindow` writes it from `options.bridge`, and the preload
parses it back.

This is not a version handshake, and that is deliberate. A version number is a
second thing to keep in step with the first, and it drifts the moment a host
implements four capabilities and reports three. Here the host states which
handlers it registered, once, in the same object that opens the window. A
capability a host forgets to declare has no method, which is visible on the
first call rather than at the first release that changed the number.

Probing by calling was the alternative and is worse: `openExternal` cannot be
probed without opening something. A `bridge:capabilities` channel was the other,
and it is a channel that may itself be unimplemented, which is the same problem
one level down.

Filtering is one-way. `declaredCapabilities` keeps only names this build knows,
so a newer host talking to an older bridge loses a method rather than gaining a
broken one.

### Envelopes, not rejections

Every method resolves. None rejects.

```ts
type Envelope<T> =
  | { ok: true; value: T }
  | { ok: false; code: 'unavailable' | 'refused' | 'failed'; message: string };
```

A rejection crosses `contextBridge` as a copied `Error` with its class gone, so
a caller cannot tell "no handler" from "the handler said no" without reading
the message as prose. And a caller who forgets `catch` gets an unhandled
rejection, which a packaged renderer with no DevTools shows nobody. An envelope
is a value, and a discriminated union makes the caller discriminate.

`unavailable` is a channel no handler answers. `refused` is a handler that
threw. `failed` is the bridge refusing before the call left the renderer. A
capability that was never declared produces none of the three, because there is
no method to call.

The envelope is made in the preload, not in the host. A consumer writes
ordinary `ipcMain.handle` that returns a value or throws, and the bridge wraps
it. Nothing about envelopes reaches the main process.

### `sandbox: true`

`createHostWindow` sets it and will not stop. It constrains this seam in two
ways worth stating rather than discovering.

A sandboxed preload cannot `require` a package. Its `require` reaches a handful
of Electron and Node built-ins and nothing in `node_modules`, so
`require('@stuffbucket/maximal-electron/preload')` from a preload file does not
work and cannot be made to. **The consumer bundles this module into their own
preload entry.** That is the one thing they must still do themselves, and it is
why `preloadPath` stays a path they supply: the shell never chooses the file,
only what the file is told.

A sandboxed preload does get `process.argv`, which is what carries the
declaration. That is asserted rather than assumed —
`e2e/preload-bridge.spec.ts` reads `window.stuffbucket.capabilities` out of the
real application's renderer, in a window with `sandbox: true`.

### What replaces what

This shell's own `src/preload/index.ts` calls `exposeBridge`. It passes
`extend` for its own twenty channels, which are this application's and no
consumer's business, and the generic surface underneath is the exported one.
So the export is not a second implementation that can drift from the one this
repository runs: it is the one this repository runs.

`extend` exists because `contextBridge.exposeInMainWorld` allows one call per
key. A consumer wanting only the generic surface omits it.

