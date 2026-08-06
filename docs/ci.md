# Continuous integration

Three workflows build. `ci.yml` is the blocking gate, `release.yml` builds and
ships a tag, and `merge-preview.yml` tests what a merge would produce. Two more
build nothing: `triage.yml` labels issues, and `watch-rulesets.yml` reads the
repository settings that no pull request can see change. Each is described in
its own header.

## What each one runs

| Workflow | Trigger | What it is for |
| --- | --- | --- |
| `ci.yml` | pull request, push to `main` and `release/**` | Lint, types, unit and mutation tests, a git-ref install, packaging and the end-to-end suite on macOS and Windows, and the packaged smoke test on macOS |
| `merge-preview.yml` | push to `main` and `release/**` | Replays every open pull request against the new tip |
| `release.yml` | tag `v*.*.*`, or a dispatch to rehearse or to retry | The draft release, the tarball, the registry publish, publish |
| `watch-rulesets.yml` | daily, or a dispatch | Reads the live repository rulesets and files one issue when a protection drops below its floor |

This repository ships no installer. `npm run package`, `npm run
verify:package` and `npm run smoke:packaged` still run in `ci.yml`, because
packaging is a property of the shell and it is where the defects were found.
What was removed was the MSI and the dmg built on top of it, and
`windows-msi-dev.yml` with them. See `docs/release.md`.

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
directory. Issue #86. That MSI is gone now, and the rule it produced is not:
a step that finds nothing fails rather than reporting success.


## The packaged smoke test

`npm run smoke:packaged` is the newest job step and is written to that rule. It
runs in `package (macos-latest)`, after `verify:package`, and it launches the
application it just built. Its own floor is a second launch with `spawn-helper`
moved aside, which has to fail: the step cannot report success without having
started a shell inside the package. `docs/testing.md` describes it.

Windows has no equivalent. The same argument would drive
`out/Stuffbucket-win32-x64/Stuffbucket.exe` in the packaged directory, where
`conpty.node` and `OpenConsole.exe` are the same class of resolution, and the
command would have to be one `cmd.exe` echoes rather than `printf`. The step
here is scoped to macOS rather than run as a job that skips.

## The four install paths


A consumer installs this package one of four ways, and npm runs a different
lifecycle script for each. `npm pack` and a registry publish run `prepack`. A
git dependency runs `prepare`. An `https://` source archive runs neither. A
registry install runs none of them and needs none: the archive it serves was
built by `prepack` at publish time, which is what makes the registry the
supported path. `stuffbucket/maximal` pins the git form today:

```
"@stuffbucket/maximal-electron": "github:stuffbucket/maximal-electron#<ref>"
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

The unsupported form is a `codeload.github.com/.../tar.gz/<sha>` URL, which npm takes
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

## The release rehearsal, and the retry

`release.yml` runs on a tag push and on a dispatch. What a run may do is one
expression, and both halves are required:

```
github.ref_type == 'tag' && (github.event_name == 'push' || inputs.publish == true)
```

A dispatch against a branch fails the first half whatever input it passes, so
no input makes a branch publishable. A dispatch against a tag with `publish`
left at its default fails the second, and rehearses. Run it from the Actions
tab against any branch.

A rehearsal does everything a tag does, except attach and publish:

- `tag-check` takes the tag from `package.json` rather than the ref, and still
  checks the format.
- `package-tarball` runs `npm run verify:exports`, packs, and installs the
  commit by git ref.
- `publish-package` runs `npm run verify:publish` against the packed archive,
  then `scripts/publish-package.mjs --mode rehearse`, which is
  `npm publish --dry-run` with an invalid token. Nothing is uploaded.
- `publish` does not run at all.

`dry-run-artifacts` is what stops a rehearsal being green for nothing. Every
attach step is skipped, so the run would otherwise end without producing
anything and still pass. That job downloads the tarball by name and asserts
exactly one arrived and is non-empty.

It survived the removal of the installers rather than going with them. The
tarball is now the only artifact, which makes it look redundant with
`if-no-files-found: error` on the upload, and it is not. That setting proves a
file existed in the producing job's working directory. It says nothing about
whether the name resolves on the download side, which is the failure #81 was,
nor about whether the file that crossed the boundary has any bytes in it.

`DRY_RUN` is the shell-visible form of the same expression, negated, used
inside `tag-check`. Job and step conditions spell the expression out, because
the `env` context is not available to a job-level condition, and
`tests/workflows.test.ts` pins the two to the same string.

### Why a dispatch can publish at all

It could not, until #162. The rule was "a dispatch run is always a dry run",
and it held because no input existed to make one publish.

That made a tag push a one-shot fuse. A tag is immutable, so a run that does
not complete spends the version, and the remedy was to bump the patch and cut
again. On 2026-07-29 an Actions outage held `tag-check` in the queue from
18:47:28 and cancelled it at 19:02:30 with no runner ever assigned; every
downstream job was skipped. `stuffbucket/maximal-core` lost `v0.4.4` in the
same hour, on the same fifteen-minute queue timeout: the tag is correct, and
nothing was built or published against it. Neither repository had done anything
wrong, and both had to burn a version.

So the tag is a pointer, and publishing is an operation invoked against it:

```
gh workflow run release.yml --ref v0.0.5 -f publish=true
```

Every job is re-runnable against a tag that already exists. `release` reuses a
draft it finds. `package-tarball` attaches under `--clobber` while the release
is a draft, reports `ALREADY ATTACHED` when the asset is already on a published
release, and fails only in the state no retry can repair — published, and
missing the asset, which is the HTTP 422 case. `publish` reads `isDraft` before
flipping it. `publish-package` reports `ALREADY PUBLISHED` rather than a 409.

`verify:tag` does not stand in the way. It refuses a ref whose earlier runs
built a **different** commit, and every retry of a tag builds the same one.

The workflow that runs is the one at the dispatched ref, so this reaches a tag
only if the tag carries it. `v0.0.5` is the first that will.

### The rail that replaced the old one

The old rule was a comment. What replaces it is three things that run:

- `tests/workflows.test.ts` compares the exact expression, not a substring, on
  every step that creates, moves, or publishes anything. `github.ref_type ==
  'tag'` alone would satisfy a `contains` test while letting any dispatch of a
  tag publish.
- `scripts/publish-decision.mjs` refuses `--mode publish` on a non-tag ref
  independently of the workflow file, and `tests/publish-decision.test.ts`
  walks a table of ref shapes over it. The rail is executable, not only
  readable.
- `--ref-type` comes from `GITHUB_REF_TYPE`, which the runner sets and a
  workflow input cannot reach.

`npm publish` appears in no workflow. Every registry call goes through
`scripts/publish-package.mjs`, and a test asserts that, because a step that
spelled the command out would carry none of the above.

### Idempotency, and the `nothing to check` rule applied to a publish

`scripts/publish-package.mjs` asks the registry what it holds before it uploads
anything, and prints one line naming the outcome:

```
PUBLISHED          @stuffbucket/maximal-electron@0.0.5 at …: this run uploaded it.
ALREADY PUBLISHED  @stuffbucket/maximal-electron@0.0.5 at …: this run uploaded nothing.
```

Both are exit 0, and a reader can tell them apart. An operation that did
nothing must not read like one that did something, which is the rule the scoped
checks apply to an empty set, one level up.

`npm view` reports three things and two of them look alike. A version that is
present prints itself. A version absent from a package that exists prints
nothing and still exits 0. A package that does not exist at all exits non-zero
with `E404`. Anything else — a 401, a proxy — is unreadable, and an unreadable
probe must not read as absent: that is the difference between "upload this" and
"we could not tell". An unreadable probe still attempts the upload, and a 409
from that attempt is reported as `ALREADY PUBLISHED`, because the probe and the
upload are two calls and the registry can change between them.


## The tag gate, and the setting it cannot replace

`tag-check` runs `npm run verify:tag` after it matches the tag against
`package.json`. That refuses a tag that is not above every tag that exists, and
refuses a ref that has already been built at another commit — the second is
what `v0.0.2` was, and the workflow runs on a tag ref survive the tag being
deleted, which is what makes them readable at all.

It runs before a tag as well as on one. With no `--sha` it takes the version
from `package.json`, checks the ordering, and says that the run history was not
read, which is the rule at the top of this page applied to itself.

What it cannot do is stop the tag moving in the first place. That needs a
repository ruleset with a `tag` target, which no pull request can create and
which does not exist. `npm run verify:rulesets` reports that gap, and
`watch-rulesets.yml` runs it daily and files one issue rather than reddening a
branch nobody touched — a required check no pull request can turn green is a
merge freeze, not a gate.
[`docs/admin/repository-settings.md`](admin/repository-settings.md) holds the
floor, the three states the check reports, and what the owner has to click.

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
  workflow. This is how the tarball reaches `dry-run-artifacts`, and a rename
  on one side would otherwise leave a download that finds nothing.
- Every `npm pack --pack-destination` step creates the directory first.
- `publish` needs `package-tarball` and nothing else. See `docs/release.md` for
  why that is deliberate.
- Every step in `release.yml` that creates, uploads to, or edits a release
  carries the whole rail, compared as a string rather than by substring.
- The rail names a tag ref, and the `publish` input is a boolean that defaults
  to false. Both halves, asserted separately.
- `DRY_RUN` is that rail negated, so the shell-visible form and the conditions
  cannot disagree.
- No workflow calls `npm publish`. Every registry call goes through
  `scripts/publish-package.mjs`, and each invocation states its mode and
  carries the rail that mode requires. A release can be redone. A version in a
  registry cannot.
- `publish-package` asks for `packages: write`, and a run that is not
  publishing rehearses instead.
- Every `needs` names a job that exists.

Each rule also asserts that it found something to check, because a rule that
matches nothing passes.

There is no YAML linter in CI. `actionlint` catches more than these rules do,
including a broken expression, and it is worth running locally.
