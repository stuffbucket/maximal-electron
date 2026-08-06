# Continuous integration

Four workflows. `ci.yml` is the blocking gate, `release.yml` builds and ships a
tag, `merge-preview.yml` tests what a merge would produce, and
`windows-msi-dev.yml` iterates on the installer from a branch.

## What each one runs

| Workflow | Trigger | What it is for |
| --- | --- | --- |
| `ci.yml` | pull request, push to `main` and `release/**` | Lint, types, unit and mutation tests, packaging and the end-to-end suite on macOS and Windows |
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

## The release dry run

`release.yml` accepts a dispatch, and **a dispatch run is always a dry run**.
There is no input that makes one publish, so the only way to touch a release is
to push a tag. Run it from the Actions tab against any branch.

A dry run does everything a tag does, except attach and publish:

- `tag-check` takes the tag from `package.json` rather than the ref, and still
  checks the format.
- `windows-msi` builds and checksums the MSI, and `windows-msi-verify` installs
  it, asserts the files and the registry entries, uninstalls, and asserts clean
  removal.
- `package-tarball` runs `npm run verify:exports` and packs.
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

### The two settings, and why neither is enabled

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
