---
name: write-a-check
description: Add or change a verification script, a test tripwire, or a CI assertion without shipping a check that passes while examining nothing
---

# Write a check

This repository has one recurring defect. A check has correct logic and empty
scope, so it passes while measuring nothing. It has happened six times. One of
them shipped a broken terminal to users in `v0.0.2`.

Read this before you add a check, and before you change the scope of one that
exists.

## The six

| # | The check | Why the scope was empty | What it cost |
| --- | --- | --- | --- |
| 1 | A grep for an error string in the demo capture log | The string never appeared, and no match read as success | Three `play` functions reported passing when one had failed |
| 2 | `checkPalette` in `scripts/check-contrast.mjs` | It returned only the pairs it could parse, and a palette in `oklch()` parsed to none | An empty list read as a clean palette |
| 3 | `scripts/verify-exports.mjs` | It listed its targets by hand | A new export was never checked |
| 4 | `check(findUnpacked('*.node').length > 0, …)` | node-llama-cpp's binary satisfied it | `spawn-helper` stayed inside `app.asar`, and the packaged terminal on macOS never worked. Fixed in #88 |
| 5 | `contentSecurityPolicyChecks` in `scripts/terminal-package.mjs` | The only caller passes no policy, so the branch never runs | The shipped policy has never been measured. Open as #92 |
| 6 | `LLAMA_LIBRARIES.flatMap(findUnpacked).length > 0` | Two patterns flattened into one array, asserted non-empty | Losing all seven `libggml*` files passes. Open as #92 |

Instance 6 sits eight lines below a comment that describes instance 4 as the
lesson learned. Prose next to the code did not stop it.

## Three obligations

### Report how many things you examined

`scripts/verify-docs.mjs` is the model. It prints
`Verifying 16 documents against 194 files` before it says anything about pass
or fail. A reader who knows there are seventeen documents can see the defect in
that line. A bare `ok` line cannot carry that information.

One count per assertion, not one per script. Instance 6 was a script with a
correct total that hid a per-pattern zero.

### Fail on zero

An assertion over a collection needs a floor on the collection. Write the floor
as a separate failure with its own message, so the output distinguishes "this
was wrong" from "there was nothing to look at".

`@stuffbucket/maximal-electron/verify` does this at the seam a consumer
touches: the
first two returned checks are floors on the file lists, because a consumer who
points the verifier at the wrong directory would otherwise get a green run.

### Break it on purpose, and say so

Every defect above was found by running something, and none by reading it.
#88 made nine checks fail deliberately and found that the new `spawn-helper`
assertion would have failed every Linux release, because `pty.cc` uses the
helper only under `__APPLE__`. #87 made six fail deliberately. The first real
run of `release.yml` found #86.

The recipe is the same each time.

1. Make the condition the check exists for true. Delete the file, strip the
   token, rename the artifact.
2. Run the check. Record the message it printed.
3. Undo the mutation, run it again, record the pass.
4. Put both in the pull request body.

For a packaging check, mutate the built package rather than the source, because
that is the artifact the check reads:

```bash
npm run package
rm out/*/Electron.app/Contents/Resources/app.asar.unpacked/**/libggml-base.dylib
npm run verify:package
```

A check you have not seen fail is a claim, not a check.

## The related failure: a check that never runs

Three of the four jobs in `release.yml` had never once completed successfully,
and only a dispatch found that out. That is the same defect one level up: the
scope is the set of runs, and it was empty.

`docs/ci.md` holds the rule for anything added to a workflow. It must be
possible to run before a tag, and it must fail when it has nothing to do. The
dry run exists for the first half and `dry-run-artifacts` for the second.

## Still unfloored

All three are known, and all three are the same shape as the six above.

- `scripts/verify-docs.mjs` filters its roots by `existsSync` and reports the
  surviving count. Rename `docs/` and it verifies `README.md` and `AGENTS.md`
  alone, prints a smaller number, and exits zero.
- `scripts/verify-docs.mjs` ends by printing `All documented names exist`, and
  it checks three claim kinds: `npm run <script>`, a screaming-case constant,
  and a markdown link. A file path in backticks is not one of them, so a
  document may name a script that was deleted and still pass. Measured by
  adding a reference to a `scripts/` file that does not exist: the run stayed
  green.
- `scripts/storybook-check.mjs:152` gives up on axe after twelve attempts and
  carries on with an empty violation list. A story that never lets axe run
  reads as clean.

## Where this is written down

`AGENTS.md` carries the one-line rule. `docs/ci.md` carries the workflow half.
`docs/proposals/engineering-review-01.md` holds the account of instances 1
to 3.
