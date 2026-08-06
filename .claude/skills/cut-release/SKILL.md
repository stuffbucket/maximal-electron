---
name: cut-release
description: Tag and ship a release across macOS and Windows
---

# Cut a release

## Before you tag

```bash
npm ci
npm run lint && npm run typecheck && npm test
npm run package && npm run verify:package && npm run test:e2e
npm run verify:git-install
```

`verify:git-install` installs this checkout the way `stuffbucket/maximal` pins
it, by git ref, and resolves every export. It then archives the same ref and
asserts that installing the archive fails loudly, which is the form npm builds
nothing for. It runs against the local clone, so it needs no network and no
pushed tag. The tarball and the git ref are different lifecycle scripts, and a
tag has shipped with only one of them wired.

Set the version in `package.json`. The tag must match it exactly, or the
`tag-check` job fails before anything builds.

Then dispatch `release.yml` from the branch. A dispatch is always a dry run: it
builds the MSI, installs and removes it, packs the tarball, and attaches
nothing. Every release defect this repository has shipped was in a job that had
never run. See `docs/ci.md`.

```bash
gh workflow run release.yml --ref release/0.1.0
```

```bash
# package.json version 0.1.0 -> tag v0.1.0
git tag -a v0.1.0 -m "Release 0.1.0"
git push origin v0.1.0
```

Accepted tag shapes: `v1.2.3`, `v1.2.3-alpha`, `v1.2.3-alpha.1`, `v1.2.3-beta`,
`v1.2.3-beta.4`.

## What the workflow does

| Job | What it does |
| --- | --- |
| `tag-check` | Asserts the tag matches `package.json`. Fails fast. |
| `release` | Creates a **draft** release with generated notes. |
| `windows-msi` | Packages, builds the MSI with WiX, attaches it and a checksum. |
| `windows-msi-verify` | Installs silently, asserts, uninstalls, asserts clean. |
| `macos-dmg` | Dispatches the private builder, polls the draft for the dmg. |
| `package-tarball` | Packs what a consumer installs, installs the commit by git ref, and attaches the tarball. |
| `publish` | Flips the draft to published, once, at the end. |

`publish` gates on `package-tarball` alone. An installer that fails costs an
installer, not the release.

Every asset lands on the **draft**. GitHub immutable releases reject an asset
added after publish with HTTP 422, so there is no second chance.

## If the macOS build fails

The release publishes without a dmg. `stuffbucket/maximal` consumes the
tarball and signs its own application, so a missing installer does not hold it
up. See `docs/release.md`.

1. Open the run in `stuffbucket/macos-builder`. That is where the real log is.
2. Fix the cause, then cut a patch release. A published release cannot take a
   new asset.

## Verify what shipped

```bash
gh release view v0.1.0 --json assets --jq '.assets[].name'
```

Expect four assets: the dmg, the MSI, and a `.sha256` beside each.

The release tarball is a supported install specifier, so install it once from
its published URL and resolve every export:

```bash
node scripts/verify-git-install.mjs --tarball \
  https://github.com/stuffbucket/maximal-electron/releases/download/v0.1.0/stuffbucket-maximal-electron-0.1.0.tgz
```

No job does this. The asset exists only after `publish`, which is after every
job has run. See `docs/consuming.md`.

Check the macOS signature on a Mac:

```bash
spctl -a -t open --context context:primary-signature -v <path to dmg>
```

## Known gaps

Neither installer carries an update channel. See `docs/release.md` for the
reason and for the builder change that would unblock macOS.
