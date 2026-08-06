# Continuous integration

Four workflows. `ci.yml` is the blocking gate, `release.yml` builds and ships a
tag, `merge-preview.yml` tests what a merge would produce, and
`windows-msi-dev.yml` iterates on the installer from a branch.

## What each one runs

| Workflow | Trigger | What it is for |
| --- | --- | --- |
| `ci.yml` | pull request, push to `main` and `release/**` | Lint, types, unit and mutation tests, a git-ref install, packaging and the end-to-end suite on macOS and Windows |
| `merge-preview.yml` | push to `main` and `release/**` | Replays every open pull request against the new tip |
| `release.yml` | tag `v*.*.*`, or a dispatch for a dry run | The draft release, the MSI, the dmg, the tarball, publish |
| `windows-msi-dev.yml` | dispatch | Builds and installs the MSI from any branch |

## The problem this page exists for

Every defect in the release pipeline so far was a job that had never executed.
The `v0.0.2` train hit three: an XML comment that stopped `wix build` producing
an MSI, `npm pack` into a directory nobody created, and a download that cannot
resolve a draft release. The unit suite was green throughout. A check that only
runs behind a tag is a check nobody has run.

So the rule for anything added here is that it must be possible to run it
before a tag, and it must fail when it has nothing to do.

The first complete dry run found another, one level down: `wix build` harvested
zero files, said so as a warning, and produced an MSI that installed an empty
directory. Issue #86. A step that finds nothing now fails rather than reporting
success.

## The three install paths

A consumer installs this package one of three ways, and npm runs a different
lifecycle script for each. `npm pack` and a registry publish run `prepack`. A
git dependency runs `prepare`. An `https://` source archive runs neither.
`stuffbucket/maximal` pins the git form:

```
"stuffbucket-electron": "github:stuffbucket/maximal-electron#<ref>"
```

`v0.0.2` shipped with the build in `prepack` alone. Installing that tag by git
ref produces a package holding the licence, the readme, and the manifest, and
no `dist/` at all. Nothing here noticed, because `verify:exports` runs
`npm pack` and walks the other path.

`npm run verify:git-install` walks the git path. It installs this package into
a scratch directory, resolves every entry in `exports` from inside that
directory, and asserts each target is a file that exists. Resolution alone is
not enough: `import.meta.resolve` answers from the manifest and never touches
the disk, so every specifier of the broken `v0.0.2` "resolved". It then checks
the installed renderer entry against the approved component surface and walks
its import graph, which is the same pair of questions `verify:exports` asks of
the local build; `scripts/export-checks.mjs` holds both, so the two paths share
one definition of what an export has to satisfy.

It runs in three places, because the ref it installs is the whole point:

| Where | Ref |
| --- | --- |
| Locally, with no arguments | `git+file:` onto this checkout at `HEAD`, so it needs no network and no push |
| `ci.yml`, the `git-install` job | The pushed head of the branch under review, as `github:owner/name#sha` |
| `release.yml`, in `package-tarball` | The commit being released, beside the tarball that is about to be attached |

The local default is what makes it runnable before cutting. The CI job is what
makes a regression fail before it lands rather than after a consumer installs
it.

### The archive path, which cannot be made to work

The third form is a `codeload.github.com/.../tar.gz/<sha>` URL, which npm takes
for a packed tarball. It is the repository tree, and `dist/` is not in the
tree, so the install produces a package whose exports name files that are not
there — with exit 0. `stuffbucket/maximal` pinned one, and it worked only
because that commit predates #70 and still carried a committed `dist/`.

No lifecycle script can build it, so the answer is to refuse it.
`scripts/check-install.mjs` runs at `postinstall`, which npm does run for every
install form, and exits 1 when an export names a file the install does not
carry. The same `verify:git-install` run archives the ref under review with
`git archive` — what codeload serves — installs that archive, and asserts the
failure carries that refusal. "npm exited non-zero" alone would pass on a
network error, so the refusal text is the assertion. Issue #100, and
`docs/consuming.md` is the consumer-facing version.

## The release dry run

`release.yml` accepts a dispatch, and **a dispatch run is always a dry run**.
There is no input that makes one publish, so the only way to touch a release is
to push a tag. Run it from the Actions tab against any branch.

A dry run does everything a tag does, except attach and publish:

- `tag-check` takes the tag from `package.json` rather than the ref, and still
  checks the format.
- `windows-msi` builds and checksums the MSI, and `windows-msi-verify` installs
  it, compares the installed tree against a manifest of the packaged
  application, asserts the registry entries, launches the executable,
  uninstalls, and asserts clean removal.
- `package-tarball` runs `npm run verify:exports`, packs, and installs the
  commit by git ref.
- `macos-dmg` and `publish` do not run at all. The first needs
  `MACOS_BUILDER_PAT` and produces nothing but an asset on the draft.

**The dry run does not cover macOS.** That is the remaining hole, and it is a
real one: on `v0.0.2` the `macos-dmg` job failed in three seconds because
`MACOS_BUILDER_PAT` was not set, and no dmg has ever been built for this
repository. The job now says so by name instead of reporting the GitHub CLI's
generic advice about a missing token, but only a tag reaches it.

`dry-run-artifacts` is what stops a dry run being green for nothing. Every
attach step is skipped on a dispatch, so the run would otherwise end without
producing anything and still pass. That job downloads the MSI and the tarball,
asserts both are present and non-empty, and checks the MSI against its
recorded SHA-256.

`DRY_RUN` is the shell-visible form of the same condition, used inside
`tag-check`. Job and step conditions spell it out as an event name, because the
`env` context is not available to a job-level condition.

## The merge race

`ci.yml` runs on a pull request head merged with the base **as it was when that
run started**. Once the base moves, the green check on the pull request is a
statement about a state that no longer exists.

That is how `main` acquired a failing test. One pull request added a check that
reads every stylesheet, another added a stylesheet three seconds later, and
each was green against a `main` that did not contain the other.

`merge-preview.yml` closes the general case. After a push to `main` or a
release branch it lists every open pull request targeting that branch, checks
out the head, merges the new tip, runs lint, types, and the unit tests, and
reports the result as a `merge-preview` commit status on the pull request head.
It blocks nothing. It puts the answer where the merge decision is made.

What it costs: one runner per open pull request per push, for the fast half of
`ci.yml`. Packaging and the end-to-end suite are left out.

What it does not close: a race shorter than the run. Two merges 180 seconds
apart is exactly that case, and only a queue serialises it.

### The neutrality guard

`npm run verify:neutral` runs in the `static` job and answers whether this
shell knows anything about the application it hosts. Issue #16 asks for it, and
a named consumer waits on it.

Two checks, because two things go wrong.

`scripts/neutrality.mjs` parses every TypeScript source under `src` with the
compiler API and denies a specifier that reaches `maximal`,
`maximal-core`, or `@stuffbucket/maximal-core`. A parse rather than a grep,
because `require.resolve`, `createRequire(import.meta.url)('…')`, an aliased
`createRequire`, `import.meta.resolve`, and a type-position `import('…')` each
launder an import past a text search. A specifier the parse cannot read — one
built from a variable — fails too, because that is the one shape it cannot
judge.

The second check scans for the terms in `FORBIDDEN_TERMS`, which defaults to
`maximal`, `maximal-core`, and `copilot`. The boundary treats `_` and `-` as
separators, so `MAXIMAL_BASE` matches where `\b` would not.

**The scope is decided, not inherited.** Every file under `src`, plus
`README.md`, which is the only prose npm puts in the tarball. `docs/` is out:
it is this repository's own record, written throughout by comparison with the
repository this one was extracted from, and no consumer installs it. The guard
asserts that boundary rather than assuming it, so a manifest that starts
packing documentation fails.

One exemption, stated once: a term inside a `stuffbucket/…` slug names a
repository rather than depends on one, and this repository is called
`maximal-electron`. An npm scope is not a slug, so `@stuffbucket/maximal-core`
in a string is still reported.

Two files carry a narrow exemption with the reason inline, both waiting on
issue #22. Each exemption is checked three ways: the file must exist, it must
still contain a match, and it must be absent from the export graph. A fixed
file therefore cannot keep its exemption, and no exemption can ever cover a
file a consumer installs.

Every part of this has a floor, because a scan of nothing reports a clean tree.
The run parses a built-in fixture of all ten laundering forms and stops before
touching the tree if it does not catch every one.

## The two settings, and why neither is enabled

Both change how merging behaves for everyone, so both are the repository
owner's call. Neither is enabled. `ci.yml` carries the `merge_group` trigger so
that enabling the first is a settings change and not a code change.

**A merge queue on `main` and each `release/**` branch.** GitHub builds the
prospective merge result, runs `ci.yml` against it, and merges only if it
passes. This closes the race completely, including the 180 second one.

The cost: no pull request merges directly any more. Every merge enters a queue
and waits for a full `ci.yml` run against the queued state, which is the
package and end-to-end matrix on macOS and Windows. That turns a merge from an
immediate action into a wait of several minutes, and a queue entry that fails
is ejected and has to be re-queued. With three agents working in separate
worktrees, which is the normal case here, throughput is the queue's rate rather
than the number of agents.

**Branch protection with "require branches to be up to date before merging".**
Cheaper to run and it also closes the race, by refusing a merge whose head does
not contain the base tip.

The cost: it serialises merges by hand. Every pull request must be updated
after every other merge lands, and each update re-runs `ci.yml` on the pull
request. With three concurrent pull requests, landing the first invalidates the
other two, so the same work happens as with a queue but a person or an agent
drives it. It also requires the full branch protection ruleset, which forces
decisions about who may push to `main` that are not otherwise on the table.

The recommendation is to leave both off and keep `merge-preview.yml`, until the
same failure happens twice more or the merge rate rises enough that a queue
pays for itself.

## The workflow files are tested

`tests/workflows.test.ts` parses every file in `.github/workflows` and asserts
what a compiler would if YAML went through one:

- Every artifact a job downloads by name is uploaded by name in the same
  workflow. This is how the MSI reaches `windows-msi-verify`, and a rename on
  one side would otherwise leave a download that finds nothing.
- Every `npm pack --pack-destination` step creates the directory first.
- `publish` needs `package-tarball` and nothing else. See `docs/release.md` for
  why that is deliberate.
- Every step in `release.yml` that creates, uploads to, or edits a release is
  guarded, so a dry run cannot publish.
- Every `needs` names a job that exists.

Each rule also asserts that it found something to check, because a rule that
matches nothing passes.

There is no YAML linter in CI. `actionlint` catches more than these rules do,
including a broken expression, and it is worth running locally.
