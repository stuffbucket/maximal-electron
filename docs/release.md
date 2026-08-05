# Release

## Trains

Work is marshalled on a release branch and folded into `main` when the release
is cut. The tag goes on `main` at that point, and it is what starts the build
described below.

```
feature branch ──> release/0.0.1 ──> main ──> tag v0.0.1 ──> the build
```

A release branch is an integration branch, not a stabilisation branch. It is
cut from `main` when the release opens, and features target it rather than
`main`. That is why the arrow points into `main` rather than out of it.

Two trains run at a time. A third would mean deciding where work goes before
anyone knows, which is the failure this shape exists to avoid.

| Train    | What belongs on it                                                     |
| -------- | ---------------------------------------------------------------------- |
| `v0.0.1` | The shell's own behaviour: accessibility, interface state, its defects. |
| `v0.0.2` | The seam a consumer depends on: the host entrypoint, the export, the    |
|          | preload bridge, client integration, theming from an external source.    |

The test for which train a change belongs on is whether
`stuffbucket/maximal` has to change to benefit from it. If it does, the change
is about the seam and belongs on the later train.

Each train has a milestone and a **draft** release. A draft release names a tag
that does not exist yet; GitHub creates it on publish. So the draft is a
statement of intent, and publishing it is what cuts the release. Nothing is
tagged early, and nothing is tagged on a branch other than `main`.

Bump `package.json` on the release branch, not on `main`, so that `main` never
claims a version that has not shipped.

## The shape

Push a tag. Six jobs run. Every asset lands on a **draft** release, and one
job flips it to published at the end.

```
tag-check ──> release (draft) ──┬─> windows-msi ──> windows-msi-verify ──┐
                                │                                        ├─> publish
                                └─> macos-dmg ───────────────────────────┘
```

## Why a draft

GitHub immutable releases reject an asset added after publish, with HTTP 422.
So there is no second chance to attach a file. Everything must land while the
release is still mutable.

This is the same reason `stuffbucket/maximal` uses this shape.

A consequence worth stating: if the macOS build fails, the release stays a
draft. It does not publish without a macOS artifact.

## macOS

This repository holds no Apple credential, and it must stay that way. Signing
happens in the private `stuffbucket/macos-builder`. This repository is a
client, and supplies two files:

- `.macos-builder/config` declares the bundle identifier, the entitlement set,
  and the artifact name.
- `.macos-builder/build.sh` builds the unsigned `.app` and stops.

The builder signs, packages, notarizes, staples, and checksums. It then uploads
the dmg onto this repository's draft release.

macOS ships **arm64 only**. The builder exports `ARCH=arm64`, and the runner is
Apple Silicon. `maximal` ships arm64 only for the same reason.

## Windows

An MSI, built with WiX 5 on a GitHub-hosted `windows-2022` runner.

The source is `build/windows/app.wxs`, adapted from `maximal`'s
`build/windows/maximal.wxs`. That file is the last known good Windows installer
in this organisation. It installs per user, so there is no prompt for
administrator rights.

`windows-msi-verify` installs it silently. It asserts the files, the registry
marker, and the Add or Remove Programs entry. It then uninstalls and asserts
clean removal. `publish` gates on that job.

To iterate without a release, dispatch `windows-msi-dev.yml` from a branch.

## Auto-update: why there is none

Neither installer carries an update channel. This is a documented position, not
an oversight.

- An MSI has no update feed.
- The macOS builder **can** emit an updater artifact: a notarized and stapled
  `.app.tar.gz` plus an Ed25519 signature. That pair is what
  `tauri-plugin-updater` consumes.
- Electron cannot read it. Squirrel.Mac installs from a `.zip`.

### What would unblock it

Two options, in rough order of effort.

1. **Add a `zip` artifact to the builder.** Have it emit a notarized, stapled
   `.zip` beside the dmg. Then `update-electron-app` works against GitHub
   Releases, provided this repository is public.
2. **Write a small updater in the main process** that consumes the existing
   `.app.tar.gz` and verifies the Ed25519 signature. No builder change, but
   real code to own.

Windows would need a separate answer, because the MSI cannot self-update. One
option is to ship Squirrel or NSIS beside the MSI.

## Extension points

Deliberately not built. Each is a small, contained addition.

- **Linux.** `forge.config.ts` configures the makers and scopes them to
  `linux`. Add a job to `release.yml` on `ubuntu-22.04`. Build on 22.04 rather
  than latest, for the older glibc baseline.
- **Windows Authenticode.** Deferred organisation-wide. See `docs/signing.md`.
- **Universal macOS binaries.** The runner is Apple Silicon and the builder
  pins `ARCH=arm64`.
- **An NSIS installer.** `maximal` has one, but Tauri generates it, so there is
  no source to copy.
