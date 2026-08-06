# Consuming this package

`stuffbucket-electron` ships its library exports from `dist/`, which is built
rather than committed. Which install specifier you write decides whether that
build ever runs.

## The three forms

| Specifier | Lifecycle script npm runs | Result |
| --- | --- | --- |
| `https://github.com/.../releases/download/v0.0.3/stuffbucket-electron-0.0.3.tgz` | `prepack`, at pack time | Works |
| `github:stuffbucket/maximal-electron#<ref>` | `prepare`, in the clone | Works |
| `https://codeload.github.com/.../tar.gz/<sha>` | None | Refused |

This package is not published to the npm registry. `npm install
stuffbucket-electron` finds nothing.

## Supported

A git ref, which is what `stuffbucket/maximal` pins:

```json
"stuffbucket-electron": "github:stuffbucket/maximal-electron#<ref>"
```

npm clones the ref, runs `prepare`, and packs what `files` lists. The ref may
be a tag, a branch, or a commit.

Or a release asset, which is `npm pack` output attached to the tag:

```json
"stuffbucket-electron": "https://github.com/stuffbucket/maximal-electron/releases/download/v0.0.3/stuffbucket-electron-0.0.3.tgz"
```

The asset carries `dist/` already, because `prepack` built it before the tarball
was made. This form installs in seconds and needs no clone and no build
toolchain. Every release from `v0.0.3` onward attaches one.

## Unsupported

A codeload archive:

```
https://codeload.github.com/stuffbucket/maximal-electron/tar.gz/<sha>
```

npm treats that URL as a packed tarball. It is not one: codeload serves the
repository tree, and `dist/` is not in the tree. npm runs no lifecycle script
for an `https://` tarball dependency other than `install` and `postinstall`, so
nothing builds the package, and every entry in `exports` names a file the
install does not carry. An archive of `main` holds 287 entries and none of them
is under `dist/`.

A pin of this form that still works pins a commit older than #70, which is when
`dist/` stopped being committed. Moving that pin forward to any later commit
produces a package whose exports resolve to nothing. Use one of the two
supported forms instead.

## What happens if you use one anyway

`scripts/check-install.mjs` runs at `postinstall`, which is the one lifecycle
script npm runs for all three forms. It compares the `exports` map against the
files on disk and refuses the install:

```
stuffbucket-electron@0.0.2: installed without a build step.

  9 of 5 exports name a file this install does not carry:
    ./dist/host/host-window.d.ts
    ...
```

`npm install` then exits 1. The failure is at install time rather than at your
compile step, which is the whole point of the guard. Issue #100.

`npm install --ignore-scripts` disables it, along with `prepare` for the git
form. A consumer who installs that way gets an unbuilt package from either form
and no warning, and that is the one case this cannot cover.

## Why `dist/` is not committed

Committing it would make every form work, and #70 removed it for two reasons
that have not gone away. A tracked build artifact is rewritten by any build,
silently, because `.gitignore` stops applying once a file is tracked. And the
published export can then disagree with the source it was built from, which it
did: the `./renderer` export shipped one merged pull request behind `src/`.

## What checks this

`npm run verify:git-install` installs a git ref into a scratch directory and
resolves every export, then archives the same ref and asserts the install of
that archive fails carrying the refusal above. Both halves run in the
`git-install` job on every pull request.

`node scripts/verify-git-install.mjs --tarball <url>` runs the export half
against a release asset. It needs a published release, so it runs by hand
before a cut rather than in CI. `.claude/skills/cut-release/SKILL.md` lists it.
