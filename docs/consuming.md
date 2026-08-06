# Consuming this package

This package publishes to the **GitHub Packages npm registry** as
`@stuffbucket/maximal-electron`. Issue #22 named it.

Before the registry there were three install paths and they behaved
differently. `npm pack` runs `prepack`. A `github:` ref runs `prepare`. An
`https://` codeload tarball runs neither, which is why `v0.0.2` installed with
no `dist/` at all. The registry collapses all three: it serves one archive,
already built, and npm resolves a version range against it.

## The cost, stated first

**GitHub Packages requires authentication to install, including for a public
package.** GitHub's own documentation says it plainly: "You need an access
token to publish, install, and delete private, internal, and public packages."
There is no anonymous read.

Two consequences, and neither is small.

- Every consumer writes an `.npmrc` and holds a token. A developer cloning
  `stuffbucket/maximal` cannot run `npm install` until they have made one.
- The registry only supports a **personal access token (classic)**. A
  fine-grained token does not authenticate to it. Classic tokens are the coarse
  kind, and `read:packages` is the narrowest scope that works.

`stuffbucket/maximal` needs that token in GitHub Actions **and** on its
self-hosted macOS signing runner, which is a machine somebody configures by
hand. That is the price of the registry, and it is paid by the consuming
repository rather than this one.

The alternative that avoids it entirely is the public npm registry, which needs
no token to install and a publish credential this repository does not have.
`docs/roadmap.md` is where that argument belongs if the burden proves too high.

## What a consumer writes

An `.npmrc` beside `package.json`, committed:

```
@stuffbucket:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NPM_GITHUB_TOKEN}
```

npm expands the environment variable, so the file carries no credential. The
token goes in the environment: a developer exports it from a shell profile, and
a workflow reads it from a secret.

Then a range rather than a pin:

```json
{
  "dependencies": {
    "@stuffbucket/maximal-electron": "^0.0.5"
  }
}
```

### The token

A personal access token (classic) with `read:packages` and nothing else.
Generate it at Settings, Developer settings, Personal access tokens, Tokens
(classic).

In GitHub Actions, `secrets.GITHUB_TOKEN` reads a package published by the
**same repository**. It does not reach across repositories, so a workflow in
`stuffbucket/maximal` needs a classic token stored as a secret. Grant that
repository read access to the package from the package settings page, and the
token still has to carry `read:packages`.

## Migrating from a git ref or a codeload URL

`stuffbucket/maximal` currently depends on one of these:

```
"stuffbucket-electron": "github:stuffbucket/maximal-electron#<sha>"
"stuffbucket-electron": "https://github.com/.../stuffbucket-electron-0.0.1.tgz"
```

Both break. The rename changes the package identity, not only where it comes
from: `node_modules/stuffbucket-electron` becomes
`node_modules/@stuffbucket/maximal-electron`, and every import changes with it.

Three edits, in one commit:

1. Add the `.npmrc` above, and the token to CI and to the signing runner.
2. Replace the dependency with `"@stuffbucket/maximal-electron": "^0.0.5"`.
3. Rewrite every import specifier. `stuffbucket-electron/host` becomes
   `@stuffbucket/maximal-electron/host`, and the same for `/renderer`,
   `/renderer/styles.css`, `/host/terminal`, and `/verify`.

Every `exports` subpath keeps its shape, so only the package part of each
specifier moves. `sed -i 's|stuffbucket-electron/|@stuffbucket/maximal-electron/|g'`
over the source is the whole of step three.

The old specifiers keep working against the tags that already exist. Nothing
published before the rename changes.

## What is checked, and when

`npm run verify:publish` reads the archive `npm pack` produces, and asserts the
things a publish depends on: the name is scoped to the account that owns the
repository, `publishConfig` names the registry, the file is named for the
scoped package, and every `exports` target inside the archive is a file with
bytes in it. It runs on every dry run and on every tag, before `npm publish`.

**That is everything answerable before a version exists in the registry.** The
real proof is the other one: install `@stuffbucket/maximal-electron` from the
registry in a scratch directory and resolve every export, the way issue #96's
git-ref check does for a `github:` specifier. That check cannot be written yet.
It would have nothing to install, and a check with nothing to check passes. It
is the first thing to add after the first publish lands, and it belongs on top
of the export-checking modules arriving with the `0.0.4` train rather than a
second copy of them.
