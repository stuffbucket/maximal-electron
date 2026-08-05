# Verification: what to add, and what not to

This repository already runs mutation testing at `break: 100`, a docs verifier
that checks names rather than prose, a package verifier that reads the built
asar, a contrast checker with a tripwire against its own silent-drop bug, and
an axe pass over every Storybook story. Most of what a team adopts in 2026 to
"raise test quality" is already here. This document is deliberately short. It
recommends four additions, each chosen because it catches something none of
the existing checks catch, and it names five techniques that would look like
progress and would not be: ceremony that produces a green run checking
nothing, the exact failure class `checkPalette` already had and was fixed for.

Everything below was checked against the code in this repository, not assumed
from a technique's general reputation. Where a claim rests on documentation
rather than something read here, that is said explicitly.

## Ranked

| Change | Catches, that nothing catches today | Cost | Confidence |
| --- | --- | --- | --- |
| Real Tab-traversal assertion on the overlay dialog | A focus trap that is declared correct (`role="dialog"`, siblings `aria-hidden`) but does not hold under real keyboard traversal | Low | High |
| A scripted fake provider for the four model-gated scenarios (#25, #26) | The approval gate, the tool round trip, and the overlay's agent behaviour, none of which run in CI today | Medium-High | Medium |
| `fast-check` on `contrast.ts`'s numeric functions only | A domain bug mutation testing structurally cannot find, because it explores code changes, not untried inputs | Low | High |
| Computed grid-column-count assertion in the e2e suite | The exact regression class behind #24: a layout that silently changes column count | Low | High |

### Real Tab-traversal assertion on the overlay dialog

`e2e/shell.spec.ts`'s `the overlay card is a real dialog` scenario checks two
things at the moment the dialog opens: that focus starts inside the card, and
that every sibling of the card carries `aria-hidden="true"`. Both are checked
once, at open, and neither drives a real Tab key.

That is a real gap, not a hypothetical one. `aria-hidden` and `aria-modal`
declare a trap to assistive technology; they do not enforce one. A documented
reproduction (Deque's `axe-core` behind a modal with correct `aria-modal` and
correct initial focus still let focus escape to a background link on the
third Tab press, and `axe-core` reported zero violations for it, because axe
checks the declaration, not the traversal. The same source found that a
`.click()` call against a focus-trapped element proves nothing, because
`inert` blocks real pointer and keyboard interaction without blocking a
programmatic call — exactly the gap between "the test passed" and "a user
could not have done this."

The concrete addition: after the overlay opens, count the focusable elements
inside the card, press real `Tab` that many times plus two, and assert that no
element outside the card ever received focus during the walk. A capture-phase
`focusin` listener recording each target, read back at the end, is enough; no
new dependency, and the assertion sits beside the one that already exists in
the same scenario. Repeat with `Shift+Tab` for the reverse direction, since
forward-only traversal is a weaker guarantee. This costs a few lines in a
scenario that already runs in CI, needs no live model, since opening the
overlay card needs none of the concierge behaviour that `providerState` gates.

Radix's dialog implementation could regress this in ways the current checks
would not notice: a version bump that changes how the trap composes, or a
future refactor that swaps `inert` for a CSS-only visual treatment. The
existing checks would still pass, because they check the declaration, not the
walk.

### A scripted fake provider for #25 and #26

`discoverProvider` in `src/main/native/agent.ts` hits two hardcoded local
addresses (`localhost:4141` for maximal, `localhost:11434` for Ollama), with
no injection point today. The four scenarios gated on a live backend
(`concierge.spec.ts`, and three in `shell.spec.ts`) are the only coverage of
the approval gate and the overlay's keyboard rules under a real agent turn,
and every CI run to date has been green without exercising any of them.

Two options were weighed against building a fake server, and both fall short
of what #25 and #26 actually need:

- **A recorded fixture** (capture one real exchange, replay its bytes) is
  cheaper to build, but it freezes a single conversation. It cannot express
  "the model calls `bash` and needs approval" and "the model refuses" and "the
  provider is reachable but never answers" as separate, deliberately chosen
  scenarios, and #26 is precisely about that last case. A recording also goes
  stale silently against a `pi-ai` version bump, since nothing re-validates it
  against the real wire format.
- **A contract test against a schema** (assert the outgoing request shape,
  assert the parser accepts a documented response shape) is cheap and worth
  having on its own, but it does not run the approval gate, the IPC round
  trip, or the overlay's rendering, so it does not touch what #25 says is
  missing.

The recommendation is a small local HTTP server that speaks enough of the
Anthropic messages streaming format for `pi-ai`'s client to treat it as
`maximal`: `/v1/models` for discovery, and a streaming endpoint that can be
told, per test, to answer plainly, to emit a `tool_use` block for `set_theme`
or `bash`, or to accept the connection and then say nothing. That last mode is
what makes #26 assertable instead of theoretical: today, "ready but stalls" is
inferred from a 60-second timeout in the wild; against a fake that can be told
to stall on command, the fix for #26 (a liveness round trip, or a budget the
scenario owns) becomes something a test can actually exercise pass and fail
on.

This is real engineering effort, not a fixture dropped in from a library. The
streaming event framing has to match what `pi-ai` actually parses, and a
version bump in `@earendil-works/pi-ai` can silently invalidate it. That risk
is preferred over the current one, though: a fake that breaks does so loudly,
in the four scenarios it drives, rather than by staying skipped forever.
Confidence here is medium: the discovery logic and the provider chain were
read directly, but no prototype fake was built or run against `pi-ai`'s
client, so the size of the streaming surface to replicate is an estimate.

### `fast-check` on `contrast.ts`, and nowhere else

Mutation testing at `break: 100` proves that every syntactic variant of the
current code would be caught by some test. It proves nothing about whether the
original code is correct for an input nobody wrote a test for, because Stryker
mutates existing code; it does not invent new inputs. That is precisely the
gap property-based testing fills, and precisely why it does not overlap with
what mutation testing already guarantees.

`contrast.ts`'s numeric core is where that gap is real: `parseHex`,
`luminance`, `contrastRatio`, and `meets` all operate over a continuous or
near-continuous domain, and the existing tests pin specific values (black on
white, one published ratio from issue #28, the boundary at exactly 4.5).
`fast-check` generating arbitrary RGB triples and hex strings would let the
suite assert invariants across the whole domain instead of the chosen points:
`contrastRatio` is symmetric and bounded to `[1, 21]` for any two colours,
`luminance` is monotonic in each channel, and round-tripping an `Rgb` through
formatting and `parseHex` returns the original value. Low cost: one
development dependency, a handful of properties added to
`tests/contrast.test.ts`, and no interaction with the Stryker gate beyond
Stryker also having to kill mutants against whatever these properties assert,
which is the same relationship every other test in that file already has.

`overlay-keys.ts` and `resolve-bridge.ts` were assessed against the same
question, and the honest answer is that `fast-check` would add nothing there.
`escapeAction` takes two booleans; its entire input domain is four values, and
the existing tests already enumerate all four. `outsideAction` takes one
boolean. `resolveBridge` case-splits on whether a candidate has the two
methods the bridge contract requires; the meaningful cases (present, absent,
partially shaped) are already small and already written by hand. Property
testing exists to explore a space too large to enumerate; a two-bit space
does not qualify, and generating booleans through `fast-check` for it would
be a slower, less readable restatement of the tests that are already there.

### A computed grid-column-count assertion, addressing #24

`.canvas` in `src/renderer/styles/shell.css` is `overflow-y: auto`, and the
grid inside it is `grid-template-columns: repeat(auto-fill, minmax(190px,
1fr))`. That is exactly the mechanism issue #24 already suspected: whether a
scrollbar is present changes the inline space the grid computes columns
against, and whether the scrollbar is present depends on whether the content's
height happens to sit on the overflow boundary. Three consecutive `npm run
stills` runs over identical code landing in two different states, confined to
the canvas region of the two views with the most content, is consistent with
that mechanism and with nothing else in the reproduction.

**The layout half of this is fixable. The screenshot half is not, and should
not be treated as if it were.**

`scrollbar-gutter: stable` reserves the scrollbar's gutter whenever
`overflow` is `auto`, `scroll`, or `hidden`, whether or not the content
actually overflows, which is the documented purpose of the property: prevent
a layout change caused by a scrollbar appearing or disappearing. Setting it on
`.canvas` removes the feedback loop #24 names, because the grid's available
width would no longer depend on the overflow state at all. This is source code,
not verification, so it is not this document's to change, but it is the
concrete answer the issue asks for: name the fix, or say honestly that the
layout cannot be pinned. It can be pinned, and this is how.

One caveat, read from documentation rather than confirmed against this
repository's runners: `scrollbar-gutter` has no effect under an overlay
scrollbar, because an overlay scrollbar reserves no gutter to begin with.
Whether the still-bistable machine used a classic or an overlay scrollbar at
capture time was not established here. If the mechanism turns out to be a
mouse-versus-trackpad scrollbar-style switch rather than an overflow-boundary
one, the CSS property above would not be the fix, and the reproduction would
need to check which scrollbar mode was active in each of the two captured
states.

Whichever the mechanism, the still image itself should not become the
regression oracle for this. `AGENTS.md` already says a still is not an
oracle, and the fix here does not change that: it makes one plausible cause
of instability go away, not screenshots trustworthy as a diff target. The
durable verification is a computed-layout assertion in `e2e/shell.spec.ts`,
in the shape `.claude/skills/verify-ui/SKILL.md` already prescribes elsewhere
in this suite: read `getComputedStyle` on the grid element, split
`gridTemplateColumns` into its tracks, and assert the count against a fixed
viewport and the deterministic sample data in `lib/data.ts`. That is a
pass/fail signal a still can never be, and it is the assertion that would have
caught this regression class the first time, deterministically, instead of
being bisected by hand against a rule that turned out to match nothing.

## What not to do here

Every item below would run in CI, print green, and check less than the
techniques already in this repository. That is worse than not having them,
because a green run reads as verified.

- **Do not diff `demo/stills` for equality, in Playwright's
  `toHaveScreenshot` or anything else, and call it a regression gate.** This
  is the one instruction in this research task worth restating as a warning:
  it is the exact mistake `AGENTS.md` already documents and #24 already
  reproduced. A pixel-diff pass would read as "layout unchanged" on a still
  that is bistable for reasons unrelated to the change under review. That is
  `checkPalette`'s old bug wearing a different tool: a check that returns
  green because it quietly stopped checking the thing that matters.
- **Do not put the Storybook test runner, or its replacement, the Storybook
  Vitest addon, into CI.** Storybook's own documentation now marks the test
  runner superseded by the Vitest addon, so recommending the older tool today
  would already be stale advice — but the newer one is the same decision by
  another name: it turns every story into a CI-gated test, which reopens
  exactly the choice `AGENTS.md` already made and defended for
  `npm run storybook:check`: a workshop tool should not gate a pull request,
  and a story broken by a refactor is allowed to rot until someone opens it.
  Nothing about the tool being newer changes that argument.
- **Do not adopt Playwright component testing as a second component-mounting
  harness.** It is a reasonable tool in general, and its 2026 form is
  materially better than the experimental packages it replaced, framework-
  agnostic and requiring no separate config dialect. But this repository
  already has a story and gallery layer in Storybook, and the components with
  `play` functions worth protecting — `TabBar`'s and `TitleBar`'s roving
  keyboard navigation, the generic dialog pattern in `Overlays.stories.tsx` —
  are better served by porting the specific assertion into the existing,
  already-CI e2e suite than by standing up a parallel mounting harness for
  the same components. That gap is real and is addressed above by other
  means; a second framework would not close it any faster and would leave two
  places that know how to render a `TabBar`.
- **Do not add a code-coverage percentage gate on top of mutation testing at
  100.** Line or branch coverage answers "did this execute," which mutation
  testing already subsumes and exceeds: a 100% mutation score means every
  mutated statement was caught by a test that would fail if the logic
  changed, a strictly stronger claim than "this line ran once." A coverage
  threshold here is a second number to chase that carries less information
  than the first, on the modules Stryker already reaches. It could mean
  something on the modules Stryker cannot reach — anything importing
  `electron` — but that is a different scope, and even there a coverage
  number proves execution, not correctness.
- **Do not run `fast-check` over `overlay-keys.ts` or `resolve-bridge.ts`.**
  Said above, restated here because it belongs on this list: their input
  domains are already fully enumerated by the existing tests. Generating
  inputs for a domain of four values is not property-based testing finding
  something exhaustive testing missed; it is exhaustive testing, done slower
  and less legibly, with an extra dependency to show for it.

## What this leaves alone

Coverage as a bare metric, without a gate, costs nothing to keep looking at
locally and is not recommended for removal; it simply adds nothing on top of
`break: 100` that this document could find, and should not be mistaken for a
second, independent signal. Contract testing against a schema for the
provider's request and response shapes is worth having as a companion to the
fake provider above, not a replacement for it: cheap, and it catches a
different fault (the shape of what is sent and parsed) than the fake server
catches (whether the gate and the overlay behave correctly once the shape is
right). Neither changes the ranking above; both are small enough to fold into
the fake-provider work rather than stand alone.

## What could not be verified here

- Whether the two states #24 reproduced correspond to a classic or an overlay
  scrollbar on the machine that captured them. That would settle whether
  `scrollbar-gutter: stable` is the whole fix or only part of it.
- The actual size of the streaming wire surface a fake provider would need to
  implement against `pi-ai`'s client, since no prototype was built. The
  package's compiled output was inspected for shape, not exercised.
- Whether `axe-core`'s JSDOM limitation (`color-contrast` is documented as
  unreliable there) affects anything in this repository's own tooling; every
  axe run here goes through a real Chromium page (`storybook:check`, the a11y
  addon), not JSDOM, so this is stated for completeness rather than as a
  found gap.
