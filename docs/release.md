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

Push a tag. Four jobs run. Every asset lands on a **draft** release, and one
job flips it to published at the end.

```
tag-check ──> release (draft) ──> package-tarball ──> publish
```

The same workflow runs from a dispatch as a dry run, which builds everything
and attaches nothing. See `docs/ci.md`.

## There is no installer

This repository ships one asset: the npm tarball. It builds no MSI and no dmg.

That is a removal, and the reasons are on the record:

- The dmg job never once succeeded. It needed a credential for the private
  signing repository, nobody ever minted one, and no dmg was ever produced for
  this repository (#69).
- Every MSI this repository published contained zero files. `msiinfo export
  <msi> File` returned no rows for `v0.0.2` and for `v0.0.3`. A 226 MB download
  that installs nothing (#112). Both assets have since been deleted from the
  published releases.
- `stuffbucket/maximal` consumes this shell as a library and packages, signs,
  and notarizes its own application. It has never consumed either installer.

Three of the eight jobs in `release.yml` existed for those two artifacts, and
a fourth workflow, `windows-msi-dev.yml`, existed only to iterate on one of
them. Nearly half the release pipeline was maintaining something no consumer
used and one half of which had never worked.

**Packaging is kept.** `npm run package` produces a `.app` on macOS and a
`win32` directory on Windows, `ci.yml` runs it on both platforms, and `npm run
verify:package` asserts the asar contents, the native modules, the icons, and
the fuses. Packaging correctness is a real property of the shell: it is how #88
was found, where `spawn-helper` was stranded inside `app.asar` and every
terminal failed to start in a packaged build. What was deleted is the installer
wrapped around the package, not the package.

A fork that wants an installer adds one. `forge.config.ts` has no makers, so
that is a maker plus a job, and nothing here fights it.

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

A consequence worth stating: a release carries the tarball and nothing else. A
consumer of the library has everything. Somebody looking for an installer finds
none, and this document is where they learn why.

## macOS

This repository holds no Apple credential, and it must stay that way.

It also no longer signs anything. Signing existed to produce the dmg, the dmg
is gone, and the client contract for `stuffbucket/macos-builder` went with it:
`.macos-builder/config` and `.macos-builder/build.sh` are deleted, and so is
the repository secret the `macos-dmg` job required and never had (#69).

`npm run package` still produces an **unsigned** `Stuffbucket.app`. Gatekeeper
refuses to open it on a machine other than the one that built it, which is the
expected behaviour for an unsigned bundle and not a defect. A consumer that
distributes a macOS application signs it themselves; `stuffbucket/maximal` does
exactly that.

Restoring signing means restoring the builder client contract and one job. The
shape is recorded in `docs/signing.md`.

## Windows

Windows ships no installer. `npm run package -- --platform=win32 --arch=x64`
produces `out/Stuffbucket-win32-x64/`, which contains `Stuffbucket.exe` and its
resources, and that directory is what a fork would wrap.

The MSI that used to be built here was built with WiX 5 from
`build/windows/app.wxs`. Every copy it ever published contained zero files
(#112), and both published assets have been deleted. The `.wxs` source, the
WiX build steps, the install-and-uninstall verification job, and the
`windows-msi-dev.yml` iteration harness are all removed.

## Auto-update: why there is none

There is no update channel, and now no installer to carry one. This is a
documented position, not an oversight.

- Electron's own updaters install over a delivered artifact. This repository
  delivers a library tarball, which npm updates.
- `stuffbucket/maximal` owns its own application and its own update story.

A fork that ships an application adds a maker, a release job, and an updater
together. `update-electron-app` against GitHub Releases is the shortest path,
and it needs a `.zip` artifact and a public repository.

## Extension points

Deliberately not built. Each is a small, contained addition.

- **Any installer at all.** `forge.config.ts` declares no makers. Adding one
  plus a release job is the whole change; see the section above for why none is
  here.
- **Linux.** Add `@electron-forge/maker-deb` and `@electron-forge/maker-rpm`,
  scope each to `linux`, and add a job to `release.yml` on `ubuntu-22.04`.
  Build on 22.04 rather than latest, for the older glibc baseline.
- **Windows Authenticode.** Deferred organisation-wide. See `docs/signing.md`.
- **Universal macOS binaries.** Not built here, and untried. `prunePrebuilds`
  in `forge.config.ts` already accepts `universal` and keeps both node-pty
  prebuilds, so the native-module side of it is done.
