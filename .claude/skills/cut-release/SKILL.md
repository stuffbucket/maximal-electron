---
name: cut-release
description: Tag a release and ship the npm tarball
---

# Cut a release

A release carries one asset: the npm tarball. This repository builds no
installer. See `docs/release.md`.

## Before you tag

```bash
npm ci
npm run lint && npm run typecheck && npm test
npm run package && npm run verify:package && npm run smoke:packaged
npm run test:e2e
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
packs the tarball, installs the commit by git ref, asserts the artifact exists,
and attaches nothing. Every release defect this repository has shipped was in a
job that had never run. See `docs/ci.md`.

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
| `package-tarball` | Packs what a consumer installs, installs the commit by git ref, and attaches the tarball. |
| `publish` | Flips the draft to published, once, at the end. |
| `dry-run-artifacts` | Dispatch only. Asserts the dry run produced a tarball. |

`publish` gates on `package-tarball`.

Every asset lands on the **draft**. GitHub immutable releases reject an asset
added after publish with HTTP 422, so there is no second chance.

## Verify what shipped

```bash
gh release view v0.1.0 --json assets --jq '.assets[].name'
```

Expect one asset: `stuffbucket-electron-<version>.tgz`.

The release tarball is a supported install specifier, so install it once from
its published URL and resolve every export:

```bash
node scripts/verify-git-install.mjs --tarball \
  https://github.com/stuffbucket/maximal-electron/releases/download/v0.1.0/stuffbucket-maximal-electron-0.1.0.tgz
```

No job does this. The asset exists only after `publish`, which is after every
job has run. See `docs/consuming.md`.

## Known gaps

No installer, nothing signed, and no update channel. See `docs/release.md` for
the reasons and `docs/signing.md` for what restoring signing would take.
