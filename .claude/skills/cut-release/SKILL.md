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
```

Set the version in `package.json`. The tag must match it exactly, or the
`tag-check` job fails before anything builds.

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
| `publish` | Flips the draft to published, once, at the end. |

Every asset lands on the **draft**. GitHub immutable releases reject an asset
added after publish with HTTP 422, so there is no second chance.

## If the macOS build fails

The release stays a draft. That is deliberate: it does not publish without a
macOS artifact.

1. Open the run in `stuffbucket/macos-builder`. That is where the real log is.
2. Fix the cause, then re-dispatch with the same tag:

   ```bash
   gh workflow run build.yml --repo stuffbucket/macos-builder \
     -f repo=stuffbucket/maximal-electron -f ref=v0.1.0
   ```

3. When the dmg appears on the draft, publish by hand:

   ```bash
   gh release edit v0.1.0 --draft=false --latest
   ```

## Verify what shipped

```bash
gh release view v0.1.0 --json assets --jq '.assets[].name'
```

Expect four assets: the dmg, the MSI, and a `.sha256` beside each.

Check the macOS signature on a Mac:

```bash
spctl -a -t open --context context:primary-signature -v <path to dmg>
```

## Known gaps

Neither installer carries an update channel. See `docs/release.md` for the
reason and for the builder change that would unblock macOS.
