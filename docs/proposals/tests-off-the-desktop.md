# Tests off the desktop

The suite already keeps windows off the screen. `isE2EQuiet` in
`src/main/native/preferences.ts` moves every window past the edge of the
display, and both the main window and the overlay set
`backgroundThrottling: false` so an occluded window still composites. That
mechanism is default-on for `npm run test:e2e` and for `npm run record`, and it
exists because the two obvious shortcuts already failed here:
`setOpacity(0)` stopped the compositor and produced blank reference
screenshots that passed anyway, and `page.screenshot` hung on an occluded
window until Playwright's timeout. `capture` in `e2e/screenshot.ts` now reads
through the Chrome DevTools Protocol and rejects a blank image by measured
compressed bytes per pixel, precisely because both of those failures looked
like success.

So the position of the window is a solved problem. What is not solved: a real
`BrowserWindow` in the developer's own login session still does two things no
amount of repositioning fixes. It puts a dock icon in the developer's Dock
(`setDockVisible(true)` in `src/main/index.ts` runs whenever a window opens,
unconditionally), and Electron activates the application on launch. Neither
depends on where the window sits on screen. That is very likely the "rapid
fire" the owner is describing: not paint-over, but a dock icon appearing and
the application briefly claiming to be frontmost, once per `launchApp()` and
around the overlay's eighteen scenarios in `e2e/concierge.spec.ts`.

This document ranks the ways to get the loud part of the suite off the
developer's desktop entirely, separates what was checked here from what
documentation claims, and ends with one thing to do next week.

## Ranked

| Approach | Fixes | Costs | Stops testing | Confidence |
| --- | --- | --- | --- | --- |
| Suppress dock and activation under `isE2EQuiet` | The two leaks the current mitigation does not cover | Low: two calls, guarded the same way `quietBounds` already is | Nothing. Dock visibility and activation are not under test | High |
| Run the whole suite as a second, always-on local macOS user | All paint-over, keyboard theft, and dock/activation noise, for local runs the developer wants to watch | Medium: a second account, auto-login, a `launchd` agent scoped to an Aqua session, and a second checkout or shared build output | Nothing at the rendering layer. Same real WindowServer, same real compositor | Medium (see caveats) |
| Move `stills`/`record` to the existing self-hosted macOS runner, as an uploaded artifact | All local disruption from the two commands that most need real pixels | Medium-High: `macos-builder` is built around one signing flow with no per-app logic, and reusing it risks contention with release builds | Nothing, but trades "watch it happen" for "look at what it produced" | Medium |
| Chromium offscreen rendering (`webPreferences.offscreen`) | Paint-over and dock/activation, for `test:e2e` specifically | Medium: a second window-construction path to maintain alongside the real one | The native chrome this repository's stills exist partly to show (macOS traffic lights), and it is unverified whether the CDP capture path already in use behaves the same against a frameless offscreen surface | Low |
| A virtual display driver (BetterDisplay or similar) | The occlusion/throttling problem `quietBounds` and `backgroundThrottling: false` already solve | Medium: a third-party kernel-adjacent tool, one more moving part | Nothing new, because it does not isolate the app from the developer's own session — dock and activation noise is unchanged | Low |
| Container or VM (`coop`, `bladerunner`, `lima`) | Nothing for this problem | High: all three run Linux guests only | Every macOS-only behaviour: the traffic lights, `app.dock`, notarization, and the packaging checks this application depends on `verify:package` for | High (that it does not fit) |
| macOS Spaces, assigned programmatically | Nothing reachable without private APIs | N/A | N/A, because it is not available | High (that it does not exist) |

## A separate macOS Space, or a background session

Apple's own documentation on Spaces exposes moving the *current* window to a
different collection behaviour (`NSWindow.CollectionBehavior`, including
`canJoinAllSpaces`, which is the opposite of what quiet mode wants), but
nothing in `AppKit` lets a process choose to open a window on a Space it is
not already showing. Every tool that does this — `yabai`, Hammerspoon's
`hs.spaces` — reaches a private, undocumented `CGSSpace` API, and `yabai`'s own
documentation says several of its space-management commands require disabling
System Integrity Protection. That is not a foundation for a project's test
suite. **Verdict: no supported way exists.** This was checked against Apple's
own API surface and against the tools that fill the gap; it was not assumed.

A background *session*, on the other hand, is real and documented, though not
by Electron or Playwright: a second macOS user account, logged in
concurrently through Fast User Switching, has its own Aqua session with a
real, fully composited WindowServer — independent of whichever Space the
primary user is looking at. A `launchd` agent alone cannot reach it
(`LimitLoadToSessionType: Aqua` still requires that *some* GUI session for
that user already exists; a Launch Daemon, which runs before any login,
cannot access a GUI at all). Screen Sharing does not create one either — it
only televises an existing session. This is documented outside Apple's own
reference material, so it is recorded here as a documentation claim, not
something verified in this repository: a GUI session, once started, persists
through a locked screen and through another user switching in; only a full
logout ends it.

Concretely: a second account, auto-logged-in once, running `test:e2e` or
`record` through a Launch Agent scoped to that session, would get a real
compositor, real traffic lights, and zero visual or keyboard contact with the
primary user's Space. Fast-user-switching into that account is exactly the
"watch progress" affordance the owner wants, on demand, without the windows
ever touching the primary session. The cost is real: a second account to
provision, an auto-login password sitting in `/etc/kcpassword`-equivalent
storage (an accepted risk on a single-owner development machine, less so on a
shared one), and a build the second account can either share or duplicate.
This is the strongest option that keeps everything local and keeps pixels
real, and its risk is entirely in the one-time setup, not in the mechanism.

## Chromium offscreen rendering

`webPreferences.offscreen` is real and current: Electron's own tutorial
describes `paint` events carrying a bitmap or a shared GPU texture, modelled
on the Chromium Embedded Framework's approach. Two things in that same
document matter here. First, "an offscreen window is always created as a
Frameless Window" — there is no native chrome at all, so the macOS traffic
lights this repository's stills exist partly to show would not appear in an
offscreen capture under any configuration. Second, "when nothing is
happening on a webpage, no frames are generated," which is a different
failure shape than a blank compositor, but is the same family: an artifact
that is silently absent rather than wrong.

Electron's documentation says nothing about `backgroundThrottling`, nothing
about CI, and nothing about interaction with the CDP `Page.captureScreenshot`
path `capture` already uses. That gap is real: it would have to be tried
against this application to know whether offscreen mode gives the CDP
session anything to read at all, or whether the whole point of `capture` —
reading a surface Chromium already produced for the real window — has
nothing to attach to. Given that `e2e/*.spec.ts` never calls `capture` (see
below), the honest framing is narrower than "should the suite move to
offscreen rendering": it is "could `test:e2e` specifically run against an
offscreen window," and that would still need its own harness path, parallel
to the one in `e2e/harness.ts`, kept in sync with it. That is real
maintenance for a benefit — no dock icon, no activation, because there would
be no window to show — that the next section proposes getting more cheaply.

## A virtual display

CI is already Linux-free for this repository: `.github/workflows/ci.yml` runs
the `e2e` job on `macos-latest` and `windows-latest` only, never
`ubuntu-latest`. So Xvfb is not in play anywhere in this pipeline today, and
there is no macOS analogue to it. Quartz is not X11, and every account of
running macOS GUI work unattended converges on the same fact: a GUI exists
only once a user has logged in at the login window, full stop. A Launch
Daemon cannot reach one, because it runs before any login exists. There is no
kernel-level "virtual framebuffer" that manufactures a GUI session out of
nothing, the way Xvfb manufactures an X server out of nothing.

Software virtual-display tools (BetterDisplay and similar) are a different
thing: they add a virtual monitor *inside an existing, already-logged-in Aqua
session*. That would let a window be genuinely on-screen on a display nobody
is looking at, rather than positioned past the edge of a real one, which is
what `quietBounds` already achieves without a third-party tool. It would not
address dock icons or activation, because it does not create a separate
session — it is the same user, the same Dock, the same Cmd-Tab switcher. This
is not a path to "off the desktop"; it is a fancier version of the trick
already in `preferences.ts`, at the cost of a dependency this repository does
not currently have.

## A container or a virtual machine

`coop` runs AI coding agents in Incus system containers, Linux only, described
in its own README as spinning up Ubuntu 22.04 cloud images; it names no
display server, no X11 or Wayland forwarding, and no GUI capability of any
kind. `bladerunner` boots Linux guests directly on Apple's
Virtualization.framework, with an optional `--gui` flag for a graphical
Debian image — but the guest is Debian, not macOS. `lima` (the checkout at
`stuffbucket/lima` currently mirrors the upstream `lima-vm/lima` project
unmodified) is explicitly a Linux VM tool for macOS *hosts*; nothing in it
runs a macOS guest.

None of the three can host a macOS guest, and Apple's own restore-image-based
macOS virtualization support (for running macOS itself as a VM guest) is not
mentioned by any of them. Running this application's e2e suite inside one of
these would mean running it against Linux, which this repository's own CI
matrix does not do, for a stated reason: `docs/architecture.md` and
`forge.config.ts` describe macOS-specific behaviour — the overlay's `NSPanel`
non-activating focus trick, `app.dock`, the notarized and stapled build
`macos-builder` produces — that a Linux guest cannot exercise at all. Using
one of this organisation's existing Linux tools here would trade "off the
desktop" for "untested on the one platform most of the native code targets."
That is not a trade worth making for this problem.

## Moving the visible checks to CI

The `e2e` job in `ci.yml` already runs `npm run package && npm run test:e2e`
on `macos-latest` and `windows-latest` for every pull request. That already
satisfies "off the developer's desktop" for anything that reaches a pull
request — a GitHub-hosted runner has its own real, if automated, login
session, and nobody is sitting in front of it. It does not help the tight
local loop the owner is describing, because a hosted runner produces
artifacts after the fact, not something to watch live.

`stills` and `record` are the two commands built around real pixels, and
`docs/recording.md` calls the recorder "the loudest offender." Neither runs
in CI today: `e2e/stills.config.ts` says outright that these stayed in the
blocking suite once and it went badly in both directions, and `stills` is
"deliberately outside `playwright.config.ts` and outside CI." `macos-builder`
is a private, self-hosted macOS runner that already exists, already
provisions Node and npm, and already exists specifically so public repositories
never hold a self-hosted runner or Apple secrets themselves. Its own
documentation describes one universal, signing-specific flow with no
per-repo logic and a policy gate that refuses any repository without an
approved configuration. Bolting a long-running, GUI-driving job onto it is a
real design deviation from what it is for, and the machine is singular: a
`stills` or `record` run contending with an in-flight release signing job is
a new failure mode, not a hypothetical one, given how tightly scoped that
repository already keeps its inputs.

If the goal is "look at the pixels without the desktop noise," a
dedicated self-hosted runner — not `macos-builder` itself — that runs
`stills`/`record` on a schedule or on demand and uploads the PNGs and the mp4
as artifacts gets the same outcome as watching a run live: a developer opens
the artifact instead of the window. That is a real cost (provisioning a
second self-hosted runner) for a real gain (zero local disruption, ever, from
the two commands that need real pixels), and it is the only option here that
does not touch the developer's own machine at all.

## Reducing how often the loud suite has to run

This is the highest-value finding, because it was available just from
reading the specs.

`e2e/*.spec.ts` — `concierge.spec.ts`, `download.spec.ts`, `embedded.spec.ts`,
`shell.spec.ts`, nine `test()` blocks and around sixty `expect()` calls
between them — never call `capture`. Not once, in any of the four files.
Every assertion in the suite that CI blocks on and that a developer runs
locally as `npm run test:e2e` goes through Playwright's own locators,
`getComputedStyle`, and `getBoundingClientRect`, all dispatched and read
through the debugger connection Playwright already holds. `capture` — the
function that has to read a real compositor, and the reason `quietBounds` and
`backgroundThrottling: false` exist at all — is called only from
`e2e/*.stills.ts` and from the recorder in `e2e/demo/`, neither of which is
part of `test:e2e` or CI.

So the suite that already runs constantly, in CI and locally, has no
technical dependency on a real composited frame. It needs a real window only
in the sense that Electron requires one to exist; it does not need that
window to ever be looked at, by a human or by a screenshot call. The
remaining disruption from `test:e2e` — the dock icon, the momentary
activation — is not a rendering cost at all, and is exactly what the first
row of the ranked table addresses directly, in-repo, at low cost.

That reframes the "rapid fire" complaint. If it is about `test:e2e`, the fix
is the dock/activation suppression above, because nothing about that suite
needs to be watched. If it is about `stills` or `record`, run with
`STUFFBUCKET_E2E_VISIBLE=1` because a developer explicitly wants to watch,
those are the two commands actually worth moving off the machine, because
they are the only two that produce something meant to be looked at.

## Recommendation

**Next week:** suppress the dock icon and application activation under
`isE2EQuiet`, the same way `quietBounds` already suppresses window position
and the overlay already suppresses always-on-top and focus. This is a low-cost,
in-repo change, guarded by the same flag, and it closes the one gap the
existing "stay off the screen" mechanism does not cover. It fixes `test:e2e`
completely, which is the suite that runs on every push and most often.

**Only if that is not enough:** provision a second, always-on self-hosted
macOS runner — separate from `macos-builder`, to keep its signing-only
contract intact — that runs `stills` and `record` and uploads the images and
the mp4 as artifacts. That removes the last local cost, the two commands that
genuinely need real pixels and are run with `STUFFBUCKET_E2E_VISIBLE=1`, at
the cost of trading "watch it happen" for "look at what it produced." A
second local macOS user account with Fast User Switching is the cheaper,
fully local alternative to that runner, and is worth trying first if the
owner wants to keep watching runs live rather than reviewing artifacts
afterward; it was not verified against this application, only against
Apple's and third-party documentation of how Aqua sessions behave, so treat
it as a spike, not a guaranteed fix.

## What was verified here, and what was not

Verified by reading this repository: `isE2EQuiet`, `quietBounds`, and
`backgroundThrottling: false` in `preferences.ts`, `main-window.ts`, and
`overlay.ts`; `setDockVisible` running unconditionally on window-open in
`src/main/index.ts`; that `capture` is never called from any file in
`e2e/*.spec.ts`, only from `e2e/*.stills.ts` and the recorder; that
`ci.yml` runs `macos-latest` and `windows-latest` only, with no Linux job;
that `stills.config.ts` and `docs/recording.md` both state their commands
run outside CI and outside `playwright.config.ts`; and the descriptions of
`coop`, `bladerunner`, and `macos-builder` from their own repositories.

Taken from documentation, not verified against this application: Electron's
offscreen-rendering behaviour beyond what its own tutorial states; that a
second macOS user's Aqua session survives Fast User Switching and screen
lock; that `yabai`'s space-assignment commands need System Integrity
Protection disabled.

Not checked at all: whether `lima`'s `stuffbucket` fork carries any
undocumented changes beyond mirroring upstream — its README gave no signal
either way, and no further digging was done because no plausible change
there would make it host a macOS guest.
