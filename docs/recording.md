# Screen recordings

This repository can drive itself and record the result. The output is an mp4
that plays anywhere, cut from real frames of the real application.

Nothing here is a mock. The window in the video is the window `npm start`
opens. The terminal in it runs a real shell. The overlay in it talks to a real
model through the real approval gate.

```bash
npm run package        # the recorder drives the built bundles
npm run record         # every timeline
npm run record -- --grep workflow
```

Output lands in `demo/`.

## Why this exists

A reference template has to show what it is. A screenshot cannot show an agent
taking a turn, and a hand-made screen capture goes stale the moment the
interface moves.

A recorded timeline does not go stale. It is code, it runs in continuous
integration terms, and a change that breaks the interface breaks the recording.

## The layers

| File | Responsibility |
| --- | --- |
| `scripts/record.mjs` | Front door. Checks `ffmpeg` and the build, then runs Playwright. |
| `e2e/demo/record.config.ts` | Playwright config. Matches `*.demo.ts` only. |
| `e2e/demo/recorder.ts` | Timeline, pacing rules, and frame timing. |
| `e2e/demo/screencast.ts` | Frame capture over the Chrome DevTools Protocol. |
| `e2e/demo/encode.ts` | The `ffmpeg` filter graph, and the probe that checks it. |
| `e2e/demo/caption.ts` | The lower third, injected into the page. |
| `e2e/demo/launch.ts` | Launch the shell in demo mode. Application specific. |
| `e2e/demo/*.demo.ts` | The timelines. Application specific. |
| `e2e/demo/rules.demo.ts` | Proves the pacing rules, in milliseconds. |

The first six are generic. They know about pages, frames, and seconds. They
know nothing about this application. A fork keeps them unchanged and rewrites
only `launch.ts` and the timelines.

## Writing a timeline

A timeline is a list of scenes. Each scene drives the interface, then holds
still long enough for a viewer to read the screen.

```ts
const scenes = [
  scene({
    name: 'A caption in the lower third',
    note: 'An optional second line',
    hold: 6,
    drive: async ({ shell }) => {
      await shell.click('[data-testid="nav-library"]');
    },
  }),
];

await record({ app, shell, scenes, output });
```

Use `scene()` rather than an object literal. It is where the hold rule is
checked, and a bare literal skips the check.

## The pacing rules

These are enforced in `recorder.ts`, not left to whoever writes a timeline.
Every one of them is easy to shave off and hard to notice until the video is
unwatchable.

| Rule | Value | Why |
| --- | --- | --- |
| `MIN_HOLD_SECONDS` | 5 | Time on a still screen. Shorter reads as a slideshow. |
| `SETTLE_SECONDS` | 1.2 | The interface reacts after `drive` resolves. |
| `GAP_SECONDS` | 1.2 | Scenes never butt up against each other. |
| `DIP_SECONDS` | 0.35 | The fade across each join. |
| `MIN_TOTAL_SECONDS` | 30 | Give a viewer time to take it in. |
| `MAX_FINAL_PAD_SECONDS` | 12 | A cap, so padding cannot rescue a stub. |

A timeline that cannot reach the duration floor is rejected before the
application launches. It does not fail after a minute of recording.

One rule the code cannot enforce. When the point of a scene is a visible
change, make the change happen **early** in `drive`. Let the hold sit on the
result. A scene that flips the theme on its last line spends its whole hold on
the picture before the change.

## Why the capture goes through the debugger

`page.screenshot` reads the operating system surface. A recording run parks its
windows off the side of the display. An occluded window gets no frames from the
macOS compositor, so the call blocks until its timeout.

`Page.startScreencast` reads the renderer instead, which does not care what is
in front. Measured here it delivers about 23 frames a second while the
interface moves, against about 3 a second for a screenshot loop.

It also emits nothing while the screen is still. That is correct. A held frame
carries the whole pause, and `writeSequence` gives it the duration it deserves.

## Why the timing is not a frame rate

A screencast emits at irregular intervals. The obvious fix is an `ffmpeg`
concat list with a `duration` per still. That is wrong.

The concat demuxer rounds every duration to the inner demuxer time base, which
for a still is a fortieth of a second. Frames arriving at about 30 a second
each rounded up to 40 milliseconds. A 38 second timeline came out as 51 seconds
of slow motion.

So each scene is written as a numbered sequence at the output frame rate, with
symbolic links rather than copies. A minute of video is 1800 ticks over roughly
900 distinct stills.

## Colour

The stills are JPEG, which is full range. Carrying that through tags the mp4 as
`yuvj420p`, and players disagree about what to do with that tag. The same file
comes out washed out in one player and crushed in another.

The filter graph converts with `in_range=full:out_range=tv`. That writes a
plain `yuv420p` limited range stream, and it puts black at the level the fade
expects.

## What the recorder checks

A recording that produces a broken file must fail, not ship. After the encode
the recorder probes the output and rejects it when:

- the duration is under `MIN_TOTAL_SECONDS`,
- the codec is not `h264`.

Close the application with `closeApp` from `e2e/harness.ts`. A crash during
teardown happens after the last frame, so a plain close would report a clean
recording over a process that aborted.

## Requirements

- `ffmpeg` and `ffprobe`. Nothing installs them for you. See below.
- A packaged build. The recorder drives `.vite/`, for the reason in
  `AGENTS.md`: the `EnableNodeCliInspectArguments` fuse stops Playwright
  attaching to a packaged binary.
- `STUFFBUCKET_E2E_VISIBLE=1` to watch a run. It is slower, and it takes over
  the desktop for the length of the timeline.

## Finding the encoder

`src/main/native/ffmpeg.ts` owns the search. It is the only copy of these
rules, and it imports no `electron`, so the recorder and the application both
use it.

The order for each tool:

1. `FFMPEG` or `FFPROBE`, when set. An explicit value wins outright. Searching
   past a bad override would hide the typo.
2. Known install directories for the platform. On macOS that is Homebrew on
   Apple Silicon, then Homebrew on Intel, then MacPorts, then the system.
3. The bare name, resolved through `PATH`.

Step 2 exists because a graphical application on macOS does not inherit the
shell `PATH`. The window server launches it. So a `brew` install that works in
a terminal is invisible to the packaged application.

**The check runs the binary.** It calls `-version` and waits for exit code 0.
Asking whether a file exists is not the same question. A broken symlink, the
wrong architecture, or a missing execute bit all satisfy a stat. Each one then
fails inside the encode.

## When it is not installed

The recording stops before it launches anything, and says so:

```
ffmpeg and ffprobe are not installed. Recording needs them to encode the video.

  brew install ffmpeg

Then try again. Set FFMPEG and FFPROBE if they are somewhere unusual.
```

Three rules behind that message:

- **Nothing is downloaded or installed on the user's behalf.** An encoder is an
  executable, not data. Fetching one after install is a different risk class
  from fetching model weights, which `llama.ts` does. A truncated model fails
  loudly on load. A substituted binary does not.
- **One command, not a menu.** Somebody blocked on this wants a line to paste.
- **Say that the fix is to run it again.** Without it the reader has to guess
  whether the application is now in a broken state.

The check lives in `e2e/demo/global-setup.ts`, which Playwright runs once
before any worker starts. It pins the paths it verified into the environment,
so the encoder that runs is the one that was tested.

## Fixture data

`src/renderer/lib/demo-runs.ts` holds the agent fleet the video shows. The main
process loads the renderer with `?demo=1` when `STUFFBUCKET_DEMO` is set, and
the renderer mounts that fixture instead of the ordinary shell.

Nothing else in the application behaves differently. The terminal, the overlay,
the agent, and the approval gate are all the production code paths.
