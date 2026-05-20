# `@endo/patterns` Diagnostic Feedback

| | |
|---|---|
| **Created** | 2026-05-19 |
| **Updated** | 2026-05-20 |
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
and call its exported functions on a specimen + pattern pair.

`diagnose` is itself a *non-throwing matcher*.
It mirrors the existing `matches(specimen, pattern): boolean` shape from
`@endo/patterns` (which returns a verdict without throwing) and returns a
structured `Trace | undefined` instead of a boolean: `undefined` on match,
a `Trace` on mismatch.
The renderer is a separate function: `render(trace, options?): string`.
Callers compose them; no `try`/`catch` and no caught error are needed.

```js
import { diagnose, render } from '@endo/patterns-diagnose';

const trace = diagnose({ specimen, pattern });
if (trace) {
  console.error(render(trace));
}
```

A caller that prefers to throw, throws:

```js
const trace = diagnose({ specimen, pattern });
if (trace) {
  throw makeError(render(trace));
}
```

A caller that wants both the production `mustMatch` throw *and* the rich
diagnostic on stderr writes the existing `mustMatch` call alongside:

```js
const trace = diagnose({ specimen, pattern });
if (trace) console.error(render(trace));
mustMatch(specimen, pattern);  // throws the today-shaped error
```

No carry-on-error mechanism in the production matcher.
The diagnostic lane is a parallel non-throwing matcher upstream of any
exception-handling the caller chooses to write.

### Surface

```ts
type DiagnoseInput = {
  specimen: unknown;
  pattern: unknown;
  context?: string;  // optional caller-supplied prefix; see exo composition
};

/**
 * Non-throwing matcher. Returns undefined on match, a Trace on mismatch.
 * Mirrors `matches(specimen, pattern): boolean` from `@endo/patterns`;
 * returns structured trace information instead of a boolean.
 */
function diagnose(input: DiagnoseInput): Trace | undefined;

type RenderOptions = {
  format?: 'compact' | 'expanded';  // default 'compact'
  width?: number;                   // line-wrap target; default 100
  color?: boolean;                  // ANSI escapes for terminals; default false
};

/** Renders a Trace as a human-and-agent-legible string. */
function render(trace: Trace, options?: RenderOptions): string;
```

`diagnose` reuses the production matcher's recursion (the *tracing
matcher* described below) but records each step structurally instead of
throwing.
A caller that holds the same `(specimen, pattern)` the failing
`mustMatch` was about to receive can call `diagnose` directly, with no
preceding `try`/`catch`.

The split between `diagnose` (verdict + structure) and `render` (string)
keeps the structured trace available for callers that want to log it as
JSON-Lines, ship it across a CapTP boundary, or feed it back into a
matcher.
A `Trace` is hardened and `JSON.stringify`-safe (its `Passable` fragments
are pre-rendered to short strings; see the *Tracing matcher* section).

### Rendering: compact by default, expanded on request

The renderer has two formats.
**`compact`** is the default and the form an AI agent sees: one mismatch
per line, no indentation, fixed column order, designed to fit a 100-column
terminal and to be cheap to tokenize.
**`expanded`** is opt-in (`render(trace, { format: 'expanded' })`) and is
a Rust-compiler-style indented form for humans inspecting a small number
of failures at a REPL.

#### `compact` format (default)

A header line names the failure mode and counts; subsequent lines are one
per leaf failure, each line carrying the path, the found value, and the
expected pattern, separated by ` | ` for predictable splitting:

```
mismatch (1 leaf): .user.age | found -3 (number) | expected non-negative bigint
```

For `M.or` over three alternatives, the header names the disjunction and
each alternative occupies one line:

```
mismatch (or, 3 alternatives, none matched): { kind: "image", url: 42 }
  alt 0 | .url | found 42 (number) | expected string
  alt 1 | .kind | found "image" | expected "text"
  alt 2 | .kind | found "image" | expected "embed"
```

For `M.arrayOf` with multiple failing elements, the header carries the
totals and each failure is one line:

```
mismatch (arrayOf nat, 3 of 5 elements failed):
  [1] | found 2 (number) | expected bigint
  [3] | found -4n | expected non-negative bigint
  [4] | found "five" | expected bigint
```

The `compact` form has a documented grammar:

```
report      = header NL (indent line NL)*
header      = "mismatch (" summary "):" [" " specimen-or-path]
line        = [label " | "] path " | " "found " value " | " "expected " pattern
indent      = two spaces
separator   = " | "  (column separator; never appears unescaped inside values)
```

Values and patterns inside a line are pre-quoted (the tracing matcher
calls `passableAsJustin` and replaces literal `|` with `\|`) so a reader
can split on ` | ` without escaping concerns.
The line-per-leaf shape lets a tool harness or AI agent line-grep the
output, count failures, or extract the first path without parsing
indentation.

#### `expanded` format (opt-in)

For a human inspecting a small failure at a REPL or in an AVA log, the
expanded format uses indentation and ASCII line-art (`|`, `+`, `-`) for
visual structure:

```
mismatch at .user.age
  found:    -3 (number)
  expected: non-negative bigint
  reason:   the value does not satisfy match:nat
```

The expanded form trades token-density for visual scanability and is
appropriate when the failure count is small and a human is reading the
output line by line.
The renderer is a single module (~300 lines) that walks the `Trace` tree
and emits lines one at a time, computing indentation from depth.
A `color: true` option layers ANSI escapes for terminals in either format.

The compact format is the default because the primary beneficiary is an
AI agent acting on the report.
Multi-line indented output is both larger in tokens and slower to parse
for an agent than a structured line-per-mismatch form.
A human reading the compact form sees a slightly denser layout but the
same information; a human who wants the indented view passes
`{ format: 'expanded' }`.

#### Why not JSON-Lines?

JSON-Lines (`{"path":".user.age","found":"-3","expected":"non-negative bigint"}`
per line) was considered.
The `compact` shape above is both shorter (no quoting overhead, no key
names per line) and equally machine-parseable: a one-line `split(' | ')`
recovers the columns.
A consumer that genuinely wants JSON parses the `Trace` directly
(the `diagnose` return value), bypassing the renderer.
The renderer's job is the human-and-agent-legible string surface; the
structured surface is `Trace` itself.

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
exo wrapper holds the method name and argument index for the failing call.
A caller that wants the diagnostic for an exo-guarded method invokes
`diagnose` with the same `(specimen, pattern)` the exo wrapper would have
checked, plus an optional `context` field naming the method and argument:

```js
const trace = diagnose({
  specimen: arg,
  pattern: methodGuard.argGuards[i],
  context: `${methodName}(${i})`,
});
```

The renderer prefixes the report with the context string (one extra line
in `compact`, one extra section in `expanded`).
No change to `@endo/exo` itself.
A future helper (`diagnoseExoCall(interfaceGuard, methodName, args)`) can
sugar this when the lane sees real use; the primitive surface is
`diagnose({ specimen, pattern, context? })`.

## Exemplar reports

Each example shows the caller code (no `try`/`catch`), the `compact`
output (default), and the `expanded` output (opt-in).
Production `mustMatch` callers continue to see the today-shaped thrown
error; the diagnostic lane is a parallel non-throwing matcher.

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
const trace = diagnose({ specimen, pattern });
if (trace) console.error(render(trace));
```

`compact` (default):

```
mismatch (1 leaf): .user.age | found -3 (number) | expected non-negative bigint
```

`expanded` (`render(trace, { format: 'expanded' })`):

```
mismatch at .user.age
  found:    -3 (number)
  expected: non-negative bigint
  reason:   the value does not satisfy match:nat
```

### Example 2: `M.or` over three structural alternatives

```js
const pattern = M.or(
  M.splitRecord({ kind: 'image', url: M.string() }),
  M.splitRecord({ kind: 'text', body: M.string() }),
  M.splitRecord({ kind: 'embed', target: M.remotable() }),
);
const specimen = harden({ kind: 'image', url: 42 });
const trace = diagnose({ specimen, pattern });
if (trace) console.error(render(trace));
```

`compact` (default):

```
mismatch (or, 3 alternatives, none matched): { kind: "image", url: 42 }
  alt 0 | .url | found 42 (number) | expected string
  alt 1 | .kind | found "image" | expected "text"
  alt 2 | .kind | found "image" | expected "embed"
```

`expanded`:

```
mismatch on or-disjunction, three alternatives, none matched
  specimen: { kind: "image", url: 42 }
  alt 0: splitRecord({ kind: "image", url: string() })
    at .url
      found:    42 (number)
      expected: string
  alt 1: splitRecord({ kind: "text", body: string() })
    at .kind
      found:    "image"
      expected: "text"
  alt 2: splitRecord({ kind: "embed", target: remotable() })
    at .kind
      found:    "image"
      expected: "embed"
```

All three alternatives are reported in both formats; no heuristic
suppresses the others.

### Example 3: `arrayOf` with multiple bad elements

```js
const pattern = M.arrayOf(M.nat());
const specimen = harden([1n, 2, 3n, -4n, 'five']);
const trace = diagnose({ specimen, pattern });
if (trace) console.error(render(trace));
```

`compact` (default):

```
mismatch (arrayOf nat, 3 of 5 elements failed):
  [1] | found 2 (number) | expected bigint
  [3] | found -4n | expected non-negative bigint
  [4] | found "five" | expected bigint
```

`expanded`:

```
mismatch in arrayOf(nat()) over 5 elements; 3 failed
  at [1]
    found:    2 (number)
    expected: bigint
  at [3]
    found:    -4n
    expected: non-negative bigint
  at [4]
    found:    "five"
    expected: bigint
```

## Dependencies

| Design | Relationship |
|--------|--------------|
| (none in `designs/`) | New package; reads but does not modify `@endo/common/apply-labeling-error.js`. No design predecessors. |

## Phased Implementation

The lane is small enough to land as a single PR.
The package is approximately 600 lines including tests.

1. **Phase A: tracing matcher and renderer (single PR).**
   - Add `packages/patterns-diagnose/` (sibling to `packages/patterns/`).
   - `src/trace.js`: tracing matcher that mirrors the production
     `confirmMatches` recursion and accumulates a `Trace` tree.
   - `src/render.js`: report formatter with `compact` (default) and
     `expanded` formats, width and color options.
   - `src/diagnose.js`: the public `diagnose({ specimen, pattern, context? })`
     entry point.
   - `test/diagnose.test.js`: the three exemplar cases above (each with
     both `compact` and `expanded` snapshots) plus the `InterfaceGuard`
     composition case.
   - No changes to `@endo/patterns` or `@endo/common`.

## Design Decisions

1. **Separate package, not a feature flag on `@endo/patterns`.**
   Download size and startup cost for the production matcher are
   load-bearing; any inline diagnostic code that ships with the matcher
   penalizes every consumer.
   A sibling package keeps the cost on the opt-in path.

2. **`diagnose` is a non-throwing matcher, not an error post-processor.**
   The existing `matches(specimen, pattern): boolean` shape proves the
   matcher can give a verdict without throwing.
   A `diagnose({ specimen, pattern }): Trace | undefined` that mirrors
   that shape lets the caller skip `try`/`catch` entirely: no error to
   construct, no error to inspect, no error to rethrow.
   The caller pattern collapses to a single conditional on the trace.

3. **`render` is split from `diagnose`.**
   `diagnose` produces structure; `render` produces a string.
   A caller that wants JSON-Lines or a custom renderer reads the `Trace`
   directly; a caller that wants the default rendering composes the two.
   Bundling them would force every diagnostic consumer through the string
   surface.

4. **`compact` is the default format, `expanded` is opt-in.**
   The primary beneficiary of the diagnostic is an AI agent acting on the
   report; an agent has less budget per token than a human and a one-line-
   per-mismatch shape is both smaller and easier to line-grep.
   A human reading the compact form sees the same information in a denser
   layout; a human who wants the indented Rust-compiler-style view passes
   `{ format: 'expanded' }`.

5. **Column separator is ` | `, not JSON.**
   JSON-Lines was considered.
   The chosen `path | found | expected | reason` form is shorter (no key
   names per line, no quoting overhead) and equally machine-parseable
   (a one-line `split(' | ')` recovers the columns).
   A consumer that genuinely wants JSON parses the `Trace` directly.

6. **All alternatives reported, no closest-alternative heuristic.**
   Rust's compiler reports every candidate when a mismatch is ambiguous,
   ranks them by best-effort depth, and lets the reader pick.
   The lane follows the same convention.
   A configurable picker would invite per-consumer config drift; a single
   convention is predictable.

7. **Tracing matcher is the rich path; the SES cause chain is not used.**
   The earlier draft proposed a cause-chain walker as a fallback for
   callers that hold only the thrown error.
   Since the lane's API takes `(specimen, pattern)` directly (not an
   error), the cause-chain walker becomes dead weight.
   A caller that has the error but lost the arguments is rare; if it
   surfaces in practice, a separate `diagnoseError(err)` helper can be
   added later.

8. **No text-source pattern parser in this design.**
   The earlier axis-C proposal (a recursive-descent reader for a pattern
   subset, producing line-and-column anchors) is a separable concern: it
   introduces a new front-end language, which is a much larger commitment
   than a diagnostic renderer.
   If a text-source pattern path becomes a priority, it is its own design
   document on its own dependency line.

9. **Renderer uses ASCII, not unicode box-drawing.**
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

- **Tracing-matcher drift from the production matcher.**
  Two implementations of the same recursion risk drift.
  Mitigation options: (a) shared test corpus where both produce the same
  match / mismatch verdict; (b) factor the production matcher into a
  visitor shape both lanes consume.
  Option (a) is the lighter first cut; option (b) is the cleaner long
  view.

- **Interaction with `@endo/exo` argument guards.**
  The `context` field on `DiagnoseInput` carries the method-name and
  argument-index prefix.
  Whether a sugar helper (`diagnoseExoCall(interfaceGuard, methodName,
  args)`) should ship in the initial PR or wait for an in-repo user is
  open.
  A short integration test against an `InterfaceGuard`-rejected call
  before Phase A lands is appropriate either way.

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

Revised 2026-05-20 after kriskowal round-2 review:
`diagnose` was reshaped from `diagnose(err, options)` (an error
post-processor that required `try`/`catch`) into
`diagnose({ specimen, pattern })` (a non-throwing matcher mirroring
`matches(specimen, pattern): boolean`).
The renderer was split into a default `compact` format (one-line-per-
mismatch, ` | `-separated columns, sized for AI-agent token economy) and
an opt-in `expanded` format (indented Rust-compiler-style, for humans
reading a small failure at a REPL).
The cause-chain fallback phase was dropped (no error means no chain to
walk).
