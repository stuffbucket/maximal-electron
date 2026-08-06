# Proposals

Research lands here. A proposal argues for names that do not exist yet, which is
why `scripts/verify-docs.mjs` exempts this directory: running a name check over
an argument for something unbuilt produces failures that say only "this has not
been built".

That exemption has a price, and this file exists to pay it. Nothing in the
repository links to this directory. No document, no skill, and not `AGENTS.md`
or `README.md`. A proposal is therefore reachable only by someone who already
knows it is here, and its claims are checked by nothing.

## The rule

A proposal exists to produce tracked work. When it has, record that below and
move any content that became true into a document outside this directory. A
proposal is a record of an argument, not a record of a system.

A proposal with no disposition after the next release is cut gets deleted. The
argument survives in git history, and 400 lines of unreachable prose that nobody
acted on costs more attention than it returns.

## Disposition

Measured on 6 August 2026, after `v0.0.3` shipped. "Produced" means an issue or
a pull request that names the document, or that the document names as its own
output. Citing an issue that already existed does not count.

| Document | Lines | Produced | Disposition |
| --- | --- | --- | --- |
| `engineering-review-01.md` | 159 | #51, #52, #53, and the three checks in #54 | Keep. It is the account behind false-pass instances one to three, cited by `.claude/skills/write-a-check/SKILL.md`. |
| `sibling-needs.md` | 203 | Reordered the `v0.0.3` queue; #90 names it as the reason | Keep until the consumers' code moves, then re-read or delete. |
| `electron-field-guide.md` | 410 | Nothing. Cites #16, #22, #31, #33, #37 and #42, all of which predate it | Owed. |
| `velocity-verification.md` | 264 | Nothing. Cites #24, #25, #26 and #28, all of which predate it | Owed. |
| `velocity-build.md` | 272 | Nothing. Names no issue at all | Owed. |
| `tests-off-the-desktop.md` | 265 | Nothing. Names no issue at all | Owed. |
| `zed-themes.md` | 473 | Nothing. #42 covers the subject and predates it | Owed. |

Five of the seven, 1,684 of 2,046 lines, have produced no tracked work.

The two that paid for themselves did one thing the other five did not: they
named a next action against a number. `engineering-review-01.md` ends in a table
of three issues with a milestone against each. `sibling-needs.md` opens with the
single fact that reordered the queue, and #90 quotes it. The other five end in a
recommendation addressed to nobody, and several of them bury a real finding in a
section titled "what I could not verify".

So the cheap change for the next proposal is not a template. It is that the
author files the issues before opening the pull request, and the proposal names
them.
