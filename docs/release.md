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

Two trains run at a time, at `n+1` and `n+2` from the shipped version. Cutting
one opens the next, so there is always somewhere to put work that is not the
current release, and nobody has to decide where a change goes before anyone
knows. A third train would be that decision made too early.

| Train    | What belongs on it                                                     |
| -------- | ---------------------------------------------------------------------- |
| `v0.0.1` | The shell's own behaviour: accessibility, interface state, its defects. |
| `v0.0.2` | The seam a consumer depends on: the host entrypoint, the export, the    |
|          | preload bridge, client integration, theming from an external source.    |
| `v0.0.3` | What a consumer installs: the artifact is correct and provably so.      |
| `v0.0.4` | What a consumer carries: install weight, the entrypoint seam, guards.   |

The test for which train a change belongs on is whether
`stuffbucket/maximal` has to change to benefit from it. If it does, the change
is about the seam and belongs on the later train.

Every issue and every pull request carries a milestone. One without a milestone
has not been triaged, and that is the thing to fix before working on it.

Each train has a milestone and a **draft** release. A draft release names a tag
that does not exist yet; GitHub creates it on publish. So the draft is a
statement of intent, and publishing it is what cuts the release. Nothing is
tagged early, and nothing is tagged on a branch other than `main`.

Bump the patch version in `package.json` on the release branch when the train
reaches a stable state, not on `main`, so that `main` never claims a version
that has not shipped.

## Cutting one

1. Fold the release branch into `main`.
2. Push the tag on `main`. The build below runs and fills the draft.
3. Publish the draft. That is the release.
4. Open the next train: a `v0.0.(n+2)` milestone, branch, and draft release, so
   two are open again.

## A pushed tag is immutable

`v0.0.2` was pushed at 23:29:43, deleted, and pushed again at 23:37:44 onto a
different commit, to pick up #80. The workflow run list shows both pushes. The
release was still a draft, so nothing published moved, and the cost this time
was nil.

The cost next time is not. `stuffbucket/maximal` installs this package from a
git ref, so a lockfile records `v0.0.3` and resolves whatever that tag points
at now. Moving a tag changes what a consumer installs without changing anything
they can see. That is the same class of hazard as adding an asset to a
published release, and it has the same answer: cut the next patch.

If a tag's build fails, the tag stays where it is. Fix the cause on the release
branch, bump the patch, and push a new tag. The failed run is the record of what
happened, and deleting the tag deletes that record too.

`stuffbucket/maximal-core` reached the same rule from the other direction. Their
#60 refuses a tag that is not above every tag that already exists, checked
against `git ls-remote --tags origin` rather than the local checkout, because a
checkout is stale by default. Here that ordering has held so far: `v0.0.1` is an
ancestor of `v0.0.2`, and `v0.0.2` of `v0.0.3`.

Nothing enforces any of this. `main` carries two branch rulesets,
`main-no-force-delete` and `main-require-pr`. There is no ruleset with a tag
target, so `git push --delete origin v0.0.3` succeeds today.

## The shape

Push a tag. Seven jobs run. Every asset lands on a **draft** release, and one
job flips it to published at the end.

```
tag-check ──> release (draft) ──┬─> package-tarball ──> publish
                                ├─> windows-msi ──> windows-msi-verify
                                └─> macos-dmg
```

The same workflow runs from a dispatch as a dry run, which builds everything
and attaches nothing. See `docs/ci.md`.

**`publish` gates on the tarball alone.** The installers run on every tag and
do not hold the release.

That is deliberate, and it is a change. `publish` used to need the dmg and the
verified MSI, on the reasoning that a release should not go out without a macOS
artifact. That reasoning holds for someone installing this application, and it
is wrong for the thing this repository now mostly is. `stuffbucket/maximal`
depends on the shell as a **library** and signs its own application, so the
tarball is the artifact it consumes and the dmg is one it never sees. Gating on
the dmg made a package release depend on a credential for a private signing
repository, and `v0.0.1` proved it: a draft nobody could publish.

## What a consumer installs

`package-tarball` runs `npm pack`, which runs `prepack`, which builds `dist`.
Nothing is committed. It runs `verify:exports` first, so a tarball missing an
export target fails before it is attached rather than after somebody installs
it.

The asset is `stuffbucket-electron-<version>.tgz`. A consumer installs it from
the release:

```
npm install https://github.com/stuffbucket/maximal-electron/releases/download/v0.0.1/stuffbucket-electron-0.0.1.tgz
```

No registry and no publish token. The cost is that npm cannot resolve a version
range, so a consumer pins a URL and updates it deliberately.

## Why a draft

GitHub immutable releases reject an asset added after publish, with HTTP 422.
So there is no second chance to attach a file. Everything must land while the
release is still mutable.

This is the same reason `stuffbucket/maximal` uses this shape.

A consequence worth stating: if the macOS build fails, the release still
publishes, carrying the tarball and no dmg. That is the trade made above. A
consumer of the library is unaffected; somebody looking for an installer finds
none, and the failed job says why.

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

```
dotnet tool install --global wix --version 5.0.2
wix extension add -g WixToolset.Util.wixext/5.0.2
wix build build/windows/app.wxs -d Version=x.y.z -d SourceDir=<staging> \
    -arch x64 -ext WixToolset.Util.wixext -out out.msi
```

These live here rather than in a comment inside `app.wxs`, because an XML
comment cannot contain a double hyphen and every one of these commands has a
long option. That is not a style preference: the comment held these commands
verbatim, `wix build` rejected the file with `WIX0104`, and the first tag ever
pushed failed on it. `tests/wxs.test.ts` now parses every `.wxs` file, so a
comment that breaks the XML fails before a release does.

The source is `build/windows/app.wxs`, adapted from `maximal`'s
`build/windows/maximal.wxs`. That file is the last known good Windows installer
in this organisation. It installs per user, so there is no prompt for
administrator rights.

`windows-msi-verify` installs it silently. It asserts the files, the registry
marker, and the Add or Remove Programs entry. It then uninstalls and asserts
clean removal. It takes the MSI from `windows-msi` as a workflow artifact:
`gh release download` cannot resolve a draft by tag name, and the release was a
detour between two jobs that already have the file.

`publish` does not gate on it. A broken installer costs an installer.

To iterate without a release, dispatch `windows-msi-dev.yml` from a branch, or
dispatch `release.yml` for a dry run of the whole pipeline. See `docs/ci.md`.

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
