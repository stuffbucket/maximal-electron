---
name: port-to-project
description: Apply this template's build and release pipeline to another repository
---

# Port this pipeline to another project

Use this to give another repository, such as `stuffbucket/maximal`, the same
build and release mechanics.

## What actually transfers

| Piece | Portable | Note |
| --- | --- | --- |
| `.macos-builder/config` and `build.sh` | Yes | Change `app_path` for the other build system. |
| `.github/workflows/release.yml` | Yes | The draft-then-publish shape is framework neutral. |
| `build/windows/app.wxs` | Mostly | Rename the product, and mint a **new** `UpgradeCode`. |
| `scripts/verify-package.mjs` | Electron only | It reads asar and fuses. |
| `AGENTS.md` and `.claude/skills` | Yes | Adapt the commands table. |
| `e2e/demo/*` except the two below | Yes | Generic. Pages, frames, and seconds only. |
| `e2e/demo/launch.ts` and `*.demo.ts` | No | Rewrite. These are the timelines. |
| `demo/edits/*.json` | No | One per video. The cut, not the machinery. |
| `src/shared/ipc.ts` pattern | Electron only | Tauri has its own command layer. |
| `src/renderer/**` | Yes | React plus Radix plus `react-resizable-panels`. |

## Steps

1. **Rename.** Change `name`, `productName`, and `repository` in
   `package.json`. Change `packagerConfig.name`, `executableName`, and
   `appBundleId` in `forge.config.ts`.

2. **Mint a new `UpgradeCode`.** In `build/windows/app.wxs`. Two products that
   share an `UpgradeCode` will uninstall each other.

   ```bash
   node -e "console.log(require('node:crypto').randomUUID().toUpperCase())"
   ```

3. **Write `.macos-builder/config`.** `app_path` must point at whatever your
   build system produces. Keep `entitlements = default` unless you ship a
   sidecar that needs more. Widening it needs a reason you can name.

4. **Adapt `.macos-builder/build.sh`.** Keep three things regardless of build
   system: stamp the version, remove stale output, and assert the built
   bundle's version matches the tag. That third check exists because a stale
   `Info.plist` once shipped the wrong version inside a dmg.

5. **Do the two manual onboarding steps.** Neither can be scripted.
   - Install the `app-repoman` GitHub App on the repository, with Contents:
     read and write.
   - Add a `MACOS_BUILDER_PAT` secret: a fine-grained token scoped to Actions:
     write on `stuffbucket/macos-builder` only.

6. **Rehearse before you rely on it.** Dispatch `windows-msi-dev.yml` from a
   branch, then push a `v0.0.1-alpha.1` tag and watch the full run.

## For a project that already releases

`maximal` already has a `release.yml` with a draft-then-publish flow and a
`macos-dmg` job. Do not replace it. Take only what is missing, most likely the
`verify:package` idea and the skills.

## What not to copy

- Apple credentials. They live in the private builder. A client repository
  that holds one has a defect.
- Windows signing. It is deferred organisation-wide.
- Auto-update. Neither installer here carries a channel.
