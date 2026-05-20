# `@endo/patterns` Diagnostic Feedback

| | |
|---|---|
| **Created** | 2026-05-19 |
| **Updated** | 2026-05-19 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Proposed |

## What is the Problem Being Solved?

A pattern mismatch in `@endo/patterns` returns a one-line error that
conflates the *what* (the failing leaf value) with the *where* (its position
inside the specimen) into a single string built by `applyLabelingError`.
The current implementation prepends a numeric or string label per nesting
level, separated by `:`.
For a small specimen this is legible.
For a realistic specimen (a `splitRecord` with nested arrays, an `M.or` over
three structural alternatives) the result is one of:

- a path that reads `arr: [2]: foo: bar:` with no indication that `2` is an
  array index and `foo` is an object property,
- a "Must match one of" disjunction that re-renders every alternative pattern
  in full and tells the caller nothing about which alternative was closest,
- or a leaf-value rejection (`"abc" - Must be a number`) printed at the top
  of the message and the path printed *after* it, requiring the reader to
  parse right-to-left.

Two consumer postures suffer most:

- **Library users** writing `M.splitRecord(...)` shapes against incoming
  CapTP traffic see a failure in their AVA log and have to manually walk
  the specimen against the pattern in a REPL to find the offending field.
- **AI agents** that construct patterns from natural-language or JSON-Schema
  inputs (the `endo-but-for-bots` audience) see the same message but cannot
  walk the specimen interactively.
  They retry with random perturbations until the message changes, which is
  expensive and frequently masks the underlying mismatch.

The cost of any remediation matters: `@endo/patterns` is loaded by every
application that uses `mustMatch`, `assertMatches`, or an `InterfaceGuard`,
and download size plus startup cost are felt across the whole audience.
A diagnostic facility that adds even a few kilobytes to the production
matcher path is a regression for callers who never read the resulting
message.

The remediation lives in a **separate lane**: an opt-in
`@endo/patterns-diagnose` (or similarly named sibling) package that an
application imports only when it wants rich diagnostics.
The production matcher path stays as it is today; the diagnostic lane is
bigger, slower, and only loaded by callers that ask for it.

## Scope

This design covers the diagnostic output rendered for a failed
`mustMatch` / `assertMatches` call when the caller opts into the diagnostic
lane.
It does not change the *truthiness* of `matches(specimen, pattern)` for any
existing specimen-pattern pair, does not change the production matcher's
thrown-error shape (`message` and SES cause chain remain bit-identical),
and does not propose a new pattern language.

Out of scope: changing the on-wire encoding of patterns, changing
`InterfaceGuard` method-argument labeling (those flow through `@endo/exo`
and have their own labeling path; the diagnostic lane reads the same
`applyLabelingError` chain and benefits transparently), changing
`getRankCover` or the storeDB query surface, and introducing a text-source
pattern language (a separate parse-from-text axis is its own design and is
not pursued here).

## Investigation: what `applyLabelingError` already delivers

The original prompt's framing assumed the production matcher needed
augmenting to carry diagnostics.
A close read of the existing implementation suggests the data is mostly
already there, locked behind a render surface that humans see at the SES
console but agents cannot read programmatically.

### Today's shape

`applyLabelingError(func, args, label)` in `@endo/common`:

1. Calls `func(...args)`.
   On synchronous success returns the value; on async success forwards the
   fulfillment.
2. On rejection (sync or async) constructs a new outer `Error` whose
   message is `` `${label}: ${innerErr.message}` `` and **annotates** the
   outer error with `` annotateError(outerErr, X`Caused by ${innerErr}`) ``.
3. Throws the outer error.

`annotateError` is `assert.note` from SES.
It attaches a hidden details record to the error, surfaced by the SES
console (`console.error(err)`) at log time but **not** present on
`err.message` or any enumerable property.
The cause chain is reachable only via SES's privileged
`takeNoteLogArgs(err)` (an internal weakmap accessor) or by capturing the
console output.

In `packages/patterns/src/patterns/patternMatchers.js`, the matcher uses
`applyLabelingError` (via `confirmNestedMatches`) at every nesting level:
property recursion, array-element recursion, `bagOf` element recursion,
`recordOf` entry recursion.
A six-level-deep failure produces a six-link annotated cause chain plus a
flattened `message` of the form `"l1: l2: l3: l4: l5: l6: detail"`.

### What this delivers (more than the original design assumed)

- **Per-level labels are preserved as distinct Error objects.**
  A diagnostic renderer that walks the chain can recover each label
  independently rather than parse the flattened string.
  The structured payload is latent in the chain; only the *shape* of each
  label (currently `string | number`) is impoverished.
- **The SES console already renders the full causal chain.**
  Human readers in a Node REPL or AVA test failure get the multi-line
  cascade, just not in an actionable format and not at the message surface
  that an agent's tool harness inspects.
- **`InterfaceGuard` argument labeling composes through the same chain.**
  `@endo/exo` adds a `${methodName}(${argIndex})` label at the boundary;
  the inner pattern chain extends naturally beneath it.
  The diagnostic lane gets this for free.

### What this does not deliver (the gap)

- **No programmatic walker over the cause chain.**
  The diagnostic information lives in SES-internal weakmaps.
  An agent's harness reads `err.message` (one flat line); without an
  explicit walker the chain is invisible.
- **No discrimination of step kinds.**
  A label of `2` could be an array index, a bag-count index, an alternative
  branch.
  The current shape is `string | number` and the convention is "number
  means array index", but `bag counts[3]` is already a string in some
  call sites and `M.or` does not currently emit a per-alternative label
  at all.
- **No combinator awareness at render time.**
  `M.or` over three alternatives currently fails with `"Must match one of
  [...]"` and abandons all per-alternative chain information.
  The chain stops at the disjunction; alternatives are not labeled with
  their own attempted-match chain.
- **No rendering convention.**
  The flat colon-joined message is the only string format.
  A multi-line indented rendering exists nowhere.

The gap is not "the matcher fails to record the path".
The gap is "the recorded path is held in a private place, in a string-only
format, with no combinator-aware renderer, and the disjunction combinator
discards its branch attempts".

## Design

### Separate lane: `@endo/patterns-diagnose`

A new sibling package alongside `@endo/patterns`.
Production callers depend on `@endo/patterns` and pay zero additional cost.
Callers that want rich diagnostics also depend on `@endo/patterns-diagnose`
and call its single exported function on a caught error (or on a
specimen + pattern pair).

```js
import { mustMatch } from '@endo/patterns';
import { diagnose } from '@endo/patterns-diagnose';

try {
  mustMatch(specimen, pattern);
} catch (err) {
  const report = diagnose(err, { specimen, pattern });
  if (report !== undefined) {
    console.error(report);
  }
  throw err;
}
```

`diagnose` returns `string | undefined`.
The string is a multi-line, indented, line-art rendering of the mismatch
ready for `console.error`, an AVA log, or an LLM tool response.
`undefined` is the "I had nothing useful to add" return: the error did not
originate from a pattern mismatch, the specimen/pattern pair is missing,
or the chain was structurally unrecoverable.
The caller is expected to fall back to the thrown error's own message in
the `undefined` case.

The return shape is deliberately a string and not a structured object.
A consumer that wants programmatic structure constructs it from the
specimen and pattern directly (re-running the matcher under a tracing
variant) rather than from a parsed diagnostic string.
The diagnostic lane's currency is *human-and-agent-readable prose*, not
machine-parseable data.

### Surface

```ts
type DiagnoseOptions = {
  specimen?: unknown;     // re-walks the specimen against the pattern for richer detail
  pattern?: unknown;      // required if specimen is supplied
  width?: number;         // line-wrap target; default 80
  color?: boolean;        // ANSI escapes for terminals; default false
};

function diagnose(
  err: Error,
  options?: DiagnoseOptions,
): string | undefined;
```

When `specimen` and `pattern` are both supplied, `diagnose` re-runs an
internal *tracing matcher* (a parallel implementation that records every
step structurally) and assembles the report from that trace.
When neither is supplied, `diagnose` walks the SES cause chain on `err`
(via `takeNoteLogArgs` or equivalent) and assembles a degraded report from
just the labels and inner-error messages.
The tracing path is the richer surface; the chain-walk path is the
fallback for the case where the caller has the error but not the
arguments.

Trivially-promoted-to-error use:

```js
const report = diagnose(err, { specimen, pattern });
if (report !== undefined) {
  throw makeError(report);
}
throw err;
```

A two-line wrapper any caller can write that turns the diagnostic into a
thrown error.
No "carry-on-error" mechanism in the production matcher; the lane is
upstream of any catch the caller chooses to write.

### Rendering: indentation and line-art

The rendering convention takes cues from the Rust compiler's mismatch
output: a path on the left margin, a caret column pointing at the failing
leaf, the failing value rendered inline, and an explanation indented
beneath.
ASCII line-art (`|`, `+`, `-`, `~`) carries the structure; no template
literal, no fancy unicode by default.
A `color: true` option layers ANSI escapes for terminals.

Sample rendering for a nested splitRecord mismatch:

```
pattern mismatch
 |
 +-- .user
 |    |
 |    +-- .age
 |          |
 |          +-- found:    -3 (number)
 |          +-- expected: non-negative bigint
 |
 = the value at .user.age does not satisfy match:nat
```

For an `M.or` over three alternatives, the renderer attempts each
alternative under the tracing matcher and reports *all* attempts, not a
single "closest" pick.
The reader sees the full set of interpretations the matcher considered;
the renderer ranks them in best-effort depth-first order but does not
discard:

```
pattern mismatch
 |
 +-- specimen: { kind: "image", url: 42 }
 |
 = three alternatives, none matched:
 |
 +-- alt 0: splitRecord({ kind: "image", url: string() })
 |    |
 |    +-- .url
 |          |
 |          +-- found:    42 (number)
 |          +-- expected: string
 |
 +-- alt 1: splitRecord({ kind: "text", body: string() })
 |    |
 |    +-- .kind
 |          |
 |          +-- found:    "image"
 |          +-- expected: "text"
 |
 +-- alt 2: splitRecord({ kind: "embed", target: remotable() })
      |
      +-- .kind
            |
            +-- found:    "image"
            +-- expected: "embed"
```

For `M.arrayOf` with multiple failing elements, the renderer reports the
total count and the first few failing indices in a compact subform:

```
pattern mismatch in arrayOf(nat()) over 5 elements
 |
 = 3 elements failed: [1], [3], [4]
 |
 +-- [1]
 |    |
 |    +-- found:    2 (number)
 |    +-- expected: bigint
 |
 +-- [3]
 |    |
 |    +-- found:    -4n
 |    +-- expected: non-negative bigint
 |
 +-- [4]
      |
      +-- found:    "five"
      +-- expected: bigint
```

The renderer is a single module (~300 lines) that converts a `Trace` (the
intermediate representation the tracing matcher produces) into the report
string.
No template literal: the formatter walks the trace and emits lines one at
a time, computing indentation from depth, so wrapping at `width` and
optional ANSI coloring work uniformly.
Line-art characters are constants in the module and trivially swappable
(e.g., to unicode box-drawing) if a future caller wants a richer terminal
rendering.

### Rich rather than configurable

The lane does not expose a knob for "preferred alternative selection" or
"summary heuristic".
A single rendering convention applies: report every interpretation the
matcher considered, rank by depth-of-match (deeper = considered closer),
and let the reader pick.
This trades a small amount of verbosity for predictability: the same
mismatch always renders the same way, regardless of how the caller
configured the package.

The Rust-compiler-error analogy is deliberate.
Rust's mismatch output does not let the caller pick between "first
candidate" or "best candidate"; it shows them all, with the most likely
intent surfaced as a `help:` suggestion.
The patterns-diagnose lane follows that convention.

### Tracing matcher

A small internal re-implementation of the matcher's recursion that, instead
of throwing, accumulates a `Trace` tree:

```js
/** @typedef {{ kind: 'property', name: string }
 *          | { kind: 'index', index: number }
 *          | { kind: 'mapKey', key: Passable }
 *          | { kind: 'setElement', element: Passable }
 *          | { kind: 'orBranch', branchIndex: number, branchPattern: Pattern }
 *          | { kind: 'arrayOfElement', index: number }
 *          | { kind: 'recordOfEntry', key: string }} TraceStep
 */

/** @typedef {{ path: TraceStep[],
 *              outcome: 'match' | { failure: string,
 *                                   specimenFragment: Passable,
 *                                   expectedFragment: Pattern },
 *              children: Trace[] }} Trace
 */
```

The tracing matcher reuses every `MatchHelper` from `patternMatchers.js`
where the helper's `confirmMatches` is referentially transparent; for the
five combinators with interesting branch structure (`or`, `and`,
`splitRecord`, `arrayOf`, `recordOf`) the tracing lane has a dedicated
explorer that calls back into the helpers but records the structured step
itself.

The tracing matcher lives in `@endo/patterns-diagnose`, not in
`@endo/patterns`.
Code size and runtime cost stay outside the production path.

### Composition with `@endo/exo` argument guards

When a method-argument mismatch surfaces through an `InterfaceGuard`, the
thrown error's chain has an outer label like `"foo(0): inner..."` from the
exo wrapper, and the inner cause is the labeled pattern chain.
`diagnose` on that error recognizes the exo-prefix shape and renders the
method-argument context as a top section of the report, then the inner
pattern trace beneath.
No change to `@endo/exo` itself; the diagnostic lane reads what is already
there.

## Exemplar reports

### Example 1: nested splitRecord with a wrong-typed leaf

```js
const pattern = M.splitRecord(
  { user: M.splitRecord({ name: M.string(), age: M.nat() }) },
  { meta: M.recordOf(M.string(), M.string()) }
);
const specimen = harden({
  user: { name: 'kris', age: -3 },
  meta: { source: 'cli' },
});
try {
  mustMatch(specimen, pattern);
} catch (err) {
  console.error(diagnose(err, { specimen, pattern }));
}
```

Reports (under `diagnose`):

```
pattern mismatch
 |
 +-- .user
 |    |
 |    +-- .age
 |          |
 |          +-- found:    -3 (number)
 |          +-- expected: non-negative bigint
 |
 = the value at .user.age does not satisfy match:nat
```

The thrown error's `message` is unchanged from today (`"user: age: -3 -
Must be non-negative"`).
Production callers see the same string; only the opt-in `diagnose`
consumer sees the richer rendering.

### Example 2: `M.or` over three structural alternatives

```js
const pattern = M.or(
  M.splitRecord({ kind: 'image', url: M.string() }),
  M.splitRecord({ kind: 'text', body: M.string() }),
  M.splitRecord({ kind: 'embed', target: M.remotable() }),
);
const specimen = harden({ kind: 'image', url: 42 });
```

`diagnose` returns the three-alternative report shown above under
*Rendering: indentation and line-art*.
All three alternatives are reported.
No heuristic is applied to suppress the others.

### Example 3: `arrayOf` with multiple bad elements

```js
const pattern = M.arrayOf(M.nat());
const specimen = harden([1n, 2, 3n, -4n, 'five']);
```

`diagnose` returns the count-plus-first-failing-indices report shown above.
The thrown error's message is unchanged.

## Dependencies

| Design | Relationship |
|--------|--------------|
| (none in `designs/`) | New package; reads but does not modify `@endo/common/apply-labeling-error.js`. No design predecessors. |

## Phased Implementation

The lane is small enough to land as one or two PRs.
Splitting it into more phases trades reviewability for build artifacts;
the package is approximately 600 lines including tests.

1. **Phase A: tracing matcher and renderer.**
   - Add `packages/patterns-diagnose/` (sibling to `packages/patterns/`).
   - `src/trace.js`: tracing matcher that mirrors the production
     `confirmMatches` recursion and accumulates a `Trace` tree.
   - `src/render.js`: report formatter (line-art renderer, width and
     color options).
   - `src/diagnose.js`: the public `diagnose(err, options)` entry point.
   - `test/diagnose.test.js`: the three exemplar cases above plus the
     `InterfaceGuard` composition case.
   - No changes to `@endo/patterns` or `@endo/common`.

2. **Phase B: cause-chain fallback path** (optional, deferrable).
   - When `diagnose` is called without `{ specimen, pattern }`, walk the
     SES cause chain on `err` and render a degraded report.
   - Requires either upstream access to `assert.takeNoteLogArgs` (today
     SES-internal) or a thin compatibility shim.
   - Cuttable: callers can always supply `{ specimen, pattern }` and the
     tracing path produces a strictly richer report.

Phase A is the deliverable.
Phase B is convenience for callers that lose the original arguments before
the catch.

## Design Decisions

1. **Separate package, not a feature flag on `@endo/patterns`.**
   Download size and startup cost for the production matcher are
   load-bearing; any inline diagnostic code that ships with the matcher
   penalizes every consumer.
   A sibling package keeps the cost on the opt-in path.

2. **Return type is `string | undefined`, not a structured object.**
   The lane's product is human-and-agent-readable prose.
   A caller that wants structure re-runs the tracing matcher directly
   (or invokes a future variant of `diagnose` that returns the `Trace`
   intermediate value).
   Keeping the public return as a renderable string sidesteps the
   compatibility question of "what shape is the structure".

3. **No template literal for the renderer.**
   The renderer walks the trace and emits lines, computing indentation
   from depth.
   A template literal would couple the rendering convention to a single
   shape; the line-by-line emitter generalizes to wider widths and
   optional ANSI coloring without restructuring.

4. **All alternatives reported, no closest-alternative heuristic.**
   Rust's compiler reports every candidate when a mismatch is ambiguous,
   ranks them by best-effort depth, and lets the reader pick.
   The lane follows the same convention.
   A configurable picker would invite per-consumer config drift; a single
   convention is predictable.

5. **Diagnostic lane reads `applyLabelingError`'s output as-is.**
   The production matcher's cause chain is already rich.
   Modifying the matcher to "carry structured payloads on errors" would
   bloat the production path for the benefit of a diagnostic surface that
   the chain already provides.
   The tracing matcher is the rich path; the chain walk is the fallback.

6. **No text-source pattern parser in this design.**
   The earlier axis-C proposal (a recursive-descent reader for a pattern
   subset, producing line-and-column anchors) is a separable concern: it
   introduces a new front-end language, which is a much larger commitment
   than a diagnostic renderer.
   If a text-source pattern path becomes a priority, it is its own design
   document on its own dependency line.

7. **Renderer uses ASCII line-art, not unicode box-drawing.**
   ASCII renders correctly in every terminal, log file, and CI output.
   Unicode box-drawing is prettier in modern terminals but introduces
   font-and-encoding sensitivity that the lane does not need.
   A future `style: 'unicode'` option is trivial to add (the line-art
   characters are module constants) if a caller asks.

## Open Questions

- **Package name.**
  `@endo/patterns-diagnose` is the working name; alternatives include
  `@endo/patterns-explain`, `@endo/patterns-debug`, or a verb-named
  `@endo/explain-mismatch`.
  The README convention "what does this package do" favors a noun-shaped
  name aligned with `@endo/patterns`.

- **Phase B necessity.**
  If the convention of "the caller always has `(specimen, pattern)` at
  the catch site" holds in practice, the cause-chain fallback is dead
  weight.
  A short survey of in-repo `mustMatch` callers (a dozen or so across
  `@endo/exo`, `@endo/marshal`, `@endo/daemon`) should settle this
  before Phase A lands.

- **Should `diagnose` also accept a string (the formatted message) as the
  first argument** instead of (or in addition to) an `Error`?
  Some callers receive only the formatted message across a process
  boundary (CapTP errors after serialization).
  The chain is gone; only the flat string survives.
  A best-effort string parser could produce a degraded report.
  Decision deferred to Phase B context.

- **Tracing-matcher drift from the production matcher.**
  Two implementations of the same recursion risk drift.
  Mitigation options: (a) shared test corpus where both produce the same
  match / mismatch verdict; (b) factor the production matcher into a
  visitor shape both lanes consume.
  Option (a) is the lighter first cut; option (b) is the cleaner long
  view.

- **Interaction with `@endo/exo` argument guards.**
  `applyLabelingError` is also used by `@endo/exo` for method-argument
  labeling.
  The diagnostic lane's `Trace` representation must accommodate the
  outer exo-wrapper label as a top step, distinct from the inner pattern
  steps.
  A short integration test against `@endo/exo`'s argument-guard error
  shape before Phase A lands is appropriate.

## Prompt

> Substantially improve `@endo/patterns` mismatch diagnostics: line and column,
> tree path, human-readable reason. Carve into three axes:
> A) tree-path accumulation,
> B) per-combinator reason renderers,
> C) alternate text-source path with own parse.
> Length: 1 to 3 screens.

Revised 2026-05-19 after kriskowal `CHANGES_REQUESTED` review:
the three-axis carry-on-error design was reshaped into a single
**separate-lane** proposal per the maintainer's framing.
A close read of `applyLabelingError` showed the path chain is already
recorded (as a SES cause chain via `annotateError`) but is unreachable to
programmatic readers, so the rework is "build a sibling package that
reads what is already there and renders it richly" rather than "thread
structured payloads through the matcher".
The text-source parse path was deferred as a separable concern (its own
front-end language deserves its own design).
