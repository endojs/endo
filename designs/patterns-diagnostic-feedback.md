# `@endo/patterns` Diagnostic Feedback

|             |                       |
| ----------- | --------------------- |
| **Created** | 2026-05-19            |
| **Updated** | 2026-05-20            |
| **Author**  | Kris Kowal (prompted) |
| **Status**  | Proposed              |

## What is the Problem Being Solved?

A pattern mismatch in `@endo/patterns` returns a one-line error that
conflates the _what_ (the failing leaf value) with the _where_ (its position
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
  of the message and the path printed _after_ it, requiring the reader to
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

The remediation is an **opt-in submodule** of the same package:
`@endo/patterns/explain-mismatch.js`.
The production matcher path stays as it is today; the explain-mismatch
submodule ships alongside but is only loaded by callers that import it
explicitly.
Because the submodule lives inside `@endo/patterns`, it has direct access
to the matcher's internals (the `matchHelpers` registry, the
`confirmMatches` recursion) without re-implementing any of them.

## Scope

This design covers the diagnostic output rendered for a failed
`mustMatch` / `assertMatches` call when the caller opts into the
explain-mismatch submodule.
It does not change the _truthiness_ of `matches(specimen, pattern)` for any
existing specimen-pattern pair, does not change the production matcher's
thrown-error shape (`message` and SES cause chain remain bit-identical),
and does not propose a new pattern language.

Out of scope: changing the on-wire encoding of patterns, changing
`InterfaceGuard` method-argument labeling (those flow through `@endo/exo`
and have their own labeling path; the explain-mismatch submodule reads the
same `applyLabelingError` chain and benefits transparently), changing
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
   outer error with ``annotateError(outerErr, X`Caused by ${innerErr}`)``.
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
  The structured payload is latent in the chain; only the _shape_ of each
  label (currently `string | number`) is impoverished.
- **The SES console already renders the full causal chain.**
  Human readers in a Node REPL or AVA test failure get the multi-line
  cascade, just not in an actionable format and not at the message surface
  that an agent's tool harness inspects.
- **`InterfaceGuard` argument labeling composes through the same chain.**
  `@endo/exo` adds a `${methodName}(${argIndex})` label at the boundary;
  the inner pattern chain extends naturally beneath it.
  The explain-mismatch submodule gets this for free.

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

### Why a submodule rather than a sibling package

An earlier draft proposed `@endo/patterns-diagnose` as a sibling package.
Sliding the same facility _inside_ `@endo/patterns` as
`./explain-mismatch.js` is strictly cleaner:

- The submodule has direct access to the `matchHelpers` registry and the
  `confirmMatches` recursion without re-export hoops.
  There is exactly one source of matcher truth.
- A sibling package would either re-implement the matcher (drift risk and
  duplicated maintenance) or expose a stable internal surface for the
  sibling to consume (an API contract the package would otherwise not
  need).
  The submodule has neither problem.
- Download cost stays opt-in: bundlers and Node's ESM loader pull a
  submodule only when an import names it, and `./explain-mismatch.js`
  appears nowhere on the production matcher's import graph.
  Callers that never `import` it never pay for it.
- The package boundary is unchanged, so `package.json` `exports` simply
  lists the new entry (`"./explain-mismatch.js": "./src/explain-mismatch.js"`)
  alongside the existing main entry.

## Design

### Submodule surface: `@endo/patterns/explain-mismatch.js`

A new submodule of `@endo/patterns`, exported via the package's `exports`
field, that callers import explicitly when they want a rich diagnostic.
The production matcher path (`mustMatch`, `assertMatches`, `matches`) is
unchanged and pays no additional cost.

```js
import { explainMismatch } from '@endo/patterns/explain-mismatch.js';

const report = explainMismatch({ specimen, pattern });
if (report !== undefined) {
  console.error(report);
}
```

`explainMismatch` is a _non-throwing matcher that returns its diagnostic as
a string_.
It mirrors the existing `matches(specimen, pattern): boolean` shape from
`@endo/patterns` (which returns a verdict without throwing) and returns a
rendered string on mismatch or `undefined` on match.
No `try`/`catch`, no caught error, and no separate render step are needed
at the call site.

A caller that prefers to throw, throws:

```js
const report = explainMismatch({ specimen, pattern });
if (report !== undefined) {
  throw makeError(report);
}
```

A caller that wants both the production `mustMatch` throw _and_ the rich
diagnostic on stderr writes the existing `mustMatch` call alongside:

```js
const report = explainMismatch({ specimen, pattern });
if (report !== undefined) console.error(report);
mustMatch(specimen, pattern); // throws the today-shaped error
```

No carry-on-error mechanism in the production matcher.
The submodule is a parallel non-throwing matcher upstream of any
exception-handling the caller chooses to write.

### Surface

```ts
type ExplainMismatchInput = {
  specimen: unknown;
  pattern: unknown;
  context?: string; // optional caller-supplied prefix; see exo composition
  format?: 'compact' | 'expanded'; // default 'compact'
  width?: number; // line-wrap target; default 100
  color?: boolean; // ANSI escapes for terminals; default false
};

/**
 * Non-throwing matcher. Returns undefined on match, a rendered diagnostic
 * string on mismatch. Mirrors `matches(specimen, pattern): boolean` from
 * `@endo/patterns`; returns a string instead of a boolean.
 */
function explainMismatch(input: ExplainMismatchInput): string | undefined;
```

`explainMismatch` reuses the production matcher's recursion internally,
recording each step structurally instead of throwing, and renders the
result before returning.
The intermediate trace tree (built during the recursion) is an internal
implementation detail; the public surface is the rendered string.
Callers that want a structured trace cross the same package boundary the
production matcher does; if a structured trace surface ever becomes
load-bearing it is a separate export under the same submodule.

### Rendering: compact by default, expanded on request

The renderer has two formats.
**`compact`** is the default and the form an AI agent sees: one mismatch
per line, no indentation, fixed column order, designed to fit a 100-column
terminal and to be cheap to tokenize.
**`expanded`** is opt-in (`explainMismatch({ ..., format: 'expanded' })`)
and is a Rust-compiler-style indented form for humans inspecting a small
number of failures at a REPL.

#### `compact` format (default)

A header line names the failure mode and counts; subsequent lines are one
per leaf failure, each line carrying the path, the found value, and the
expected pattern, separated by `|` for predictable splitting:

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

Values and patterns inside a line are pre-quoted (the explain-mismatch
recursion calls `passableAsJustin` and replaces literal `|` with `\|`) so a
reader can split on `|` without escaping concerns.
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
The renderer is a single module (~300 lines) that walks the internal trace
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
A consumer that needs structured JSON crosses the package boundary the
same way: the submodule is small enough that a JSON-rendering variant can
land as a second export when a real downstream consumer asks.

### Rich rather than configurable

The submodule does not expose a knob for "preferred alternative selection"
or "summary heuristic".
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
The explain-mismatch submodule follows that convention.

### Tracing recursion (internal)

The submodule's recursion mirrors `confirmMatches` from
`packages/patterns/src/patterns/patternMatchers.js`, but instead of
throwing on mismatch it accumulates a structured trace.
The trace shape is internal:

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

The recursion calls into the existing `matchHelpers` registry directly
(it lives in the same package and imports the helpers like any other
module of `@endo/patterns`), so there is exactly one source of matcher
truth.
For the five combinators with interesting branch structure (`or`, `and`,
`splitRecord`, `arrayOf`, `recordOf`) the submodule has a dedicated
explorer that calls the helper and records the structured step.
Because the recursion shares its building blocks with `confirmMatches`
there is no parallel implementation to drift; a change to a helper updates
both lanes simultaneously.

### Composition with `@endo/exo` argument guards

When a method-argument mismatch surfaces through an `InterfaceGuard`, the
exo wrapper holds the method name and argument index for the failing call.
A caller that wants the diagnostic for an exo-guarded method invokes
`explainMismatch` with the same `(specimen, pattern)` the exo wrapper
would have checked, plus an optional `context` field naming the method and
argument:

```js
const report = explainMismatch({
  specimen: arg,
  pattern: methodGuard.argGuards[i],
  context: `${methodName}(${i})`,
});
```

The renderer prefixes the report with the context string (one extra line
in `compact`, one extra section in `expanded`).
No change to `@endo/exo` itself.
A future helper (`explainExoCall(interfaceGuard, methodName, args)`) can
sugar this when the submodule sees real use; the primitive surface is
`explainMismatch({ specimen, pattern, context? })`.

## Exemplar reports

Each example shows the caller code (no `try`/`catch`), the `compact`
output (default), and the `expanded` output (opt-in).
Production `mustMatch` callers continue to see the today-shaped thrown
error; the submodule is a parallel non-throwing matcher.

### Example 1: nested splitRecord with a wrong-typed leaf

```js
import { explainMismatch } from '@endo/patterns/explain-mismatch.js';

const pattern = M.splitRecord(
  { user: M.splitRecord({ name: M.string(), age: M.nat() }) },
  { meta: M.recordOf(M.string(), M.string()) },
);
const specimen = harden({
  user: { name: 'kris', age: -3 },
  meta: { source: 'cli' },
});
const report = explainMismatch({ specimen, pattern });
if (report !== undefined) console.error(report);
```

`compact` (default):

```
mismatch (1 leaf): .user.age | found -3 (number) | expected non-negative bigint
```

`expanded` (`explainMismatch({ specimen, pattern, format: 'expanded' })`):

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
const report = explainMismatch({ specimen, pattern });
if (report !== undefined) console.error(report);
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
const report = explainMismatch({ specimen, pattern });
if (report !== undefined) console.error(report);
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

| Design               | Relationship                                                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| (none in `designs/`) | New submodule inside `@endo/patterns`; reads but does not modify `@endo/common/apply-labeling-error.js`. No design predecessors. |

## Phased Implementation

The submodule is small enough to land as a single PR.
The new code is approximately 600 lines including tests.

1. **Phase A: explain-mismatch submodule (single PR).**
   - Add `packages/patterns/src/explain-mismatch.js` (the public entry).
   - Add `packages/patterns/src/explain-mismatch/trace.js` (tracing
     recursion that mirrors `confirmMatches` and accumulates a trace).
   - Add `packages/patterns/src/explain-mismatch/render.js` (report
     formatter with `compact` (default) and `expanded` formats, width and
     color options).
   - Add `packages/patterns/package.json` `exports` entry
     (`"./explain-mismatch.js": "./src/explain-mismatch.js"`).
   - Add `packages/patterns/test/explain-mismatch.test.js`: the three
     exemplar cases above (each with both `compact` and `expanded`
     snapshots) plus the `InterfaceGuard` composition case.
   - No changes to `mustMatch`, `assertMatches`, `matches`, or
     `applyLabelingError`.

## Design Decisions

1. **Submodule of `@endo/patterns`, not a sibling package.**
   The submodule has direct access to the matcher's `matchHelpers` registry
   and `confirmMatches` recursion: no re-export hoops, no parallel
   implementation, and a single source of matcher truth.
   Download cost stays opt-in because `./explain-mismatch.js` appears
   nowhere on the production matcher's import graph.
   An earlier draft proposed a sibling `@endo/patterns-diagnose` package;
   that framing required either re-implementing the matcher (drift) or
   exposing a stable internal surface for the sibling to consume (API
   contract the package would otherwise not need).
   The submodule has neither problem.

2. **`explainMismatch` is a non-throwing matcher, not an error
   post-processor.**
   The existing `matches(specimen, pattern): boolean` shape proves the
   matcher can give a verdict without throwing.
   An `explainMismatch({ specimen, pattern }): string | undefined` that
   mirrors that shape lets the caller skip `try`/`catch` entirely: no
   error to construct, no error to inspect, no error to rethrow.
   The caller pattern collapses to a single conditional on the return
   value.

3. **Public surface is a single function returning a string, not a
   split diagnose-plus-render pair.**
   An earlier draft exposed `diagnose(...): Trace | undefined` and
   `render(trace, options): string` as two public functions.
   For the primary consumers (an agent's tool harness, a human in a
   REPL), the structured trace is an implementation detail; the rendered
   string is what they consume.
   Folding the two into `explainMismatch({ ..., format? })` removes a
   joint the caller would otherwise have to assemble and keeps the
   internal trace type out of the public API.
   A future structured-trace export can land as a second submodule entry
   if a real downstream consumer needs one; the conservative starting
   point is the single string-returning function.

4. **`compact` is the default format, `expanded` is opt-in.**
   The primary beneficiary of the diagnostic is an AI agent acting on the
   report; an agent has less budget per token than a human and a one-line-
   per-mismatch shape is both smaller and easier to line-grep.
   A human reading the compact form sees the same information in a denser
   layout; a human who wants the indented Rust-compiler-style view passes
   `{ format: 'expanded' }`.

5. **Column separator is `|`, not JSON.**
   JSON-Lines was considered.
   The chosen `path | found | expected | reason` form is shorter (no key
   names per line, no quoting overhead) and equally machine-parseable
   (a one-line `split(' | ')` recovers the columns).
   A consumer that genuinely wants JSON gets a future second export, not
   a configuration knob on the string renderer.

6. **All alternatives reported, no closest-alternative heuristic.**
   Rust's compiler reports every candidate when a mismatch is ambiguous,
   ranks them by best-effort depth, and lets the reader pick.
   The submodule follows the same convention.
   A configurable picker would invite per-consumer config drift; a single
   convention is predictable.

7. **Tracing recursion reuses the matcher's helpers in place.**
   Because the submodule lives inside `@endo/patterns`, its recursion
   imports `matchHelpers` and the per-combinator helpers directly.
   There is no second copy of the matcher to drift from the production
   path: a change to a helper updates both lanes simultaneously, and a
   shared test corpus exercising both `matches` and `explainMismatch`
   pins the verdict-equivalence.
   The earlier sibling-package draft worried about drift; the submodule
   reshape dissolves that concern entirely.

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
   font-and-encoding sensitivity that the submodule does not need.
   A future `style: 'unicode'` option is trivial to add (the line-art
   characters are module constants) if a caller asks.

## Open Questions

- **Interaction with `@endo/exo` argument guards.**
  The `context` field on `ExplainMismatchInput` carries the method-name
  and argument-index prefix.
  Whether a sugar helper (`explainExoCall(interfaceGuard, methodName,
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
mismatch, `|`-separated columns, sized for AI-agent token economy) and
an opt-in `expanded` format (indented Rust-compiler-style, for humans
reading a small failure at a REPL).
The cause-chain fallback phase was dropped (no error means no chain to
walk).

Revised 2026-05-20 after kriskowal round-3 review:
the sibling-package framing was retired in favor of a submodule of
`@endo/patterns` itself, exported as `@endo/patterns/explain-mismatch.js`.
The submodule has direct access to the matcher's `matchHelpers` registry
and `confirmMatches` recursion, eliminating the drift-vs-stable-internal-
surface tension a sibling package would have introduced.
The two-function `diagnose` + `render` API was folded into a single
`explainMismatch({ specimen, pattern, context?, format?, width?, color? })`
that returns a rendered string (or `undefined` on match); the structured
trace remains an internal implementation detail.
