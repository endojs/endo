# `@endo/patterns` Diagnostic Feedback

| | |
|---|---|
| **Created** | 2026-05-19 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Proposed |

## What is the Problem Being Solved?

A pattern mismatch in `@endo/patterns` returns a one-line error that conflates
the *what* (the failing leaf value) with the *where* (its position inside the
specimen) into a single string built by `applyLabelingError`.
The current implementation prepends a numeric or string label per nesting
level, separated by `:`.
For a small specimen this is legible.
For a realistic specimen (a `splitRecord` with nested arrays, an `M.or` over
three structural alternatives) the result is one of:

- a path that reads `arr: [2]: foo: bar:` with no indication that `2` is an
  array index and `foo` is an object property,
- a "Must match one of" disjunction that re-renders every alternative pattern
  in full and tells the caller nothing about which alternative was closest, or
- a leaf-value rejection (`"abc" - Must be a number`) printed at the top of
  the message and the path printed *after* it, requiring the reader to parse
  right-to-left.

Two consumer postures suffer most:

- **Library users** writing `M.splitRecord(...)` shapes against incoming
  CapTP traffic see a failure in their AVA log and have to manually walk
  the specimen against the pattern in a REPL to find the offending field.
- **AI agents** that construct patterns from natural-language or JSON-Schema
  inputs (the `endo-but-for-bots` audience) see the same message but cannot
  walk the specimen interactively.
  They retry with random perturbations until the message changes, which is
  expensive and frequently masks the underlying mismatch.

The remediation has three independent dimensions that compose, so the design
splits along those axes.
Each axis is independently mergeable; each delivers diagnostic value on its
own; the three together turn a one-line mismatch into a structured report
with a tree path, a per-combinator reason, and (for text-source patterns) a
line and column.

## Scope

This design covers diagnostic output from `mustMatch`, `assertMatches`, and
the underlying `confirmMatches` rejector path.
It does not change the *truthiness* of `matches(specimen, pattern)` for any
existing specimen-pattern pair: patterns that match today still match, and
patterns that fail today still fail.
The diagnostic *string* on the failure side and the structured *cause chain*
on the resulting `Error` are what change.

The design does not propose a new pattern language.
The text-source path (axis C) is an alternative *front end* that produces the
existing `M.*` combinator tree; the back end is unchanged.

Out of scope: changing the on-wire encoding of patterns, changing
`InterfaceGuard` method-argument diagnostics (those flow through
`@endo/exo` and have their own labeling path), changing `getRankCover`
or the storeDB query surface.

## Design

The three axes are independent landings.
Each axis has a clear feature flag at construction time so a consumer can opt
in or opt out without forcing the others.

### Axis A: tree-path accumulation

**Today.** `confirmNestedMatches` calls `applyLabelingError(... prefix)`
where `prefix` is either a property name string, a positive integer array
index, or undefined.
`throwLabeled` then prepends `${label}: ` to the inner error message.
A failure six levels deep produces `0: foo: 1: bar: 2: ...: Must be a string`.
The reader cannot distinguish array indices from property names from map keys.

**Proposed.** Replace the flat-string prefix with a structured *path step*
and accumulate the steps on a dedicated `Error` property
(`error.patternPath`) in addition to the existing message prefix.
A path step is one of:

```js
/** @typedef {{ kind: 'property', name: string }
 *          | { kind: 'index', index: number }
 *          | { kind: 'mapKey', key: Passable }
 *          | { kind: 'setElement', element: Passable }
 *          | { kind: 'orBranch', branchIndex: number }} PatternPathStep
 */
```

The labeling helper `applyLabelingError` keeps its existing string-prepending
behavior for backward compatibility, and additionally walks the cause chain
to collect the structured steps into `error.patternPath`.
The pretty-printed form of a step is:

| Step | Rendering |
|------|-----------|
| `property('foo')` | `.foo` |
| `index(2)` | `[2]` |
| `mapKey('"abc"')` | `[@"abc"]` |
| `setElement('"x"')` | `<"x">` |
| `orBranch(1)` | `(alt 1)` |

So the example above renders as `.arr[2].foo[1].bar` rather than
`arr: 2: foo: 1: bar:`.
The leading `.` is omitted for the root.
The structured property is the durable record; the rendered string is for
the message.

Consumers that want programmatic access (test harnesses, IDE integrations,
the future LLM-feedback path) read `error.patternPath`; humans read the
rendered prefix.

**Migration.** `applyLabelingError` accepts the existing `string|number`
label as today.
New call sites pass a `PatternPathStep`; old call sites are gradually
migrated in a single sweep through `patternMatchers.js`.
The wrapper preserves the previous string format for one release as a
deprecation shim; the next release tightens to the structured form.

**Size:** S.
One module under `packages/patterns/src/patterns/`, one helper in
`@endo/common/apply-labeling-error.js`, the sweep of ~30 call sites in
`patternMatchers.js`.
Tests live alongside the existing `mismatch-stack-demo.test-verbose.js`
plus a new `pattern-path.test.js`.

### Axis B: per-combinator reason renderers

**Today.** Each `MatchHelper` produces its rejection string inline via the
`reject` template tag.
The string is opaque to the caller: a `match:or` failure says "Must match
one of ${qp(patts)}" with the patterns re-rendered as `qp` quotations and
no signal about which alternative was closest.
`match:splitRecord` reports missing or unexpected keys but not the value
mismatch for a present key.
`match:arrayOf` reports the first failing element but not how many failures
there are.

**Proposed.** Each `MatchHelper.confirmMatches` returns *both* the
boolean and (on failure) a structured `MismatchReason`:

```js
/** @typedef {{ combinator: string,
 *              specimenSummary: string,
 *              expectedSummary: string,
 *              cause?: MismatchReason,    // for nesting
 *              alternatives?: MismatchReason[] }} MismatchReason */
```

The combinator-specific renderers carry the existing template-tag string
*as the human prose* of a single reason node, plus the structured payload
for downstream consumers.
The most impactful renderers:

- **`match:or`** records each alternative's `MismatchReason` and picks the
  *closest* alternative for the headline message by a simple heuristic
  (alternative with the deepest matching `patternPath` prefix, tie broken
  by alternative index).
  The headline reads "closest alternative: alt 1 — .foo: Must be a string";
  the full alternative list is available on `error.mismatchReason.alternatives`
  for programmatic consumers.
- **`match:splitRecord`** distinguishes the three failure modes (missing
  required key, unexpected key, value mismatch on a present key) and
  surfaces them as a single combined reason rather than three sequential
  rejects.
- **`match:arrayOf`** records the *count* of failing elements and the
  first three indices in addition to the first failure detail.
- **`match:and`** records *which* conjunct rejected (today the first one,
  but a heuristic preference for the more specific conjunct improves the
  read).
- **`match:not`** renders the negated pattern *with* the matching value
  rather than just naming the pattern, so the reader sees why the negation
  fired.

**Renderer registry.** A small `mismatchRenderers` table keyed by the
combinator's `match:*` tag.
A combinator without a registered renderer falls back to the today-shape
template string, so the change is additive.
Adding a renderer for a new combinator is a four-line patch.

**Size:** M.
The renderer table, a per-combinator renderer for the five combinators
listed above, and an updated `mustMatch` that collects the structured
reason onto `error.mismatchReason` in addition to writing the headline.
The other ~15 combinators retain their existing strings.

### Axis C: alternate text-source path with own parse

**Today.** Patterns are constructed at runtime by chained `M.*` calls.
There is no source-level representation, so there is nothing to attach
line and column numbers to.
A failure in a pattern authored from a JSON-Schema converter, a YAML pattern
file, or an LLM-generated pattern string surfaces against the JS source
location of the converter, not the source location of the author's input.

**Proposed.** Add an alternate front end at
`packages/patterns/src/text-source/`:

```js
import { parsePattern } from '@endo/patterns/text-source.js';

const { pattern, sourceMap } = parsePattern(`
  splitRecord({
    foo: number(),
    bar: string()
  }, {
    baz: number()
  })
`, { sourceName: 'config.pat', startLine: 12 });
```

The parser is a small recursive-descent reader for a pattern subset (the
combinators listed in `packages/patterns/README.md` § "The M Namespace"
that are referentially transparent: no callbacks, no remotables).
It produces a normal `M.*`-built pattern tree plus a `sourceMap`: a
`WeakMap<Pattern, { line, column, length, sourceName }>` keyed by the leaf
combinator instances the parser created.

`mustMatch` accepts an optional `{ sourceMap }` option.
When present, the diagnostic message includes `at config.pat:14:7` against
the failing leaf, and the structured `Error` carries
`error.sourceLocation = { sourceName, line, column }`.

The text source covers the read-only subset and is meant for capability-
constrained authoring (`endo-but-for-bots`, JSON-Schema bridges, CLI
arguments to `endo store --schema`).
A consumer that needs callbacks or remotables stays on the JS combinator
API; the two coexist.

**Why a parse, not just JSON-Schema?** A line-and-column-bearing parse
locates errors against the *exact text the author wrote*.
A JSON-Schema bridge that produces the same combinator tree would still
have to either reproject the schema source or fabricate locations against
a JSON DOM.
The recursive-descent reader is smaller (one file, ~200 lines) and gives
the diagnostic a real anchor.

**Size:** M-L.
Parser, lexer, source-map data structure, `mustMatch` integration point,
and the test fixtures (a few canonical pattern strings with expected
mismatch messages including line and column).
Phase boundary candidate: the parser can land before the `mustMatch`
integration, with the integration as a second PR.

### Composition

The three axes compose without coupling:

- A consumer using only axis A sees the structured path on every error.
- A consumer adding axis B sees the combinator-aware reason renderer; the
  reason includes the path from axis A.
- A consumer constructing the pattern from text source (axis C) additionally
  sees a line and column on the leaf.

The features stack additively on the same `Error`:

| Property | Axis | Shape |
|----------|------|-------|
| `error.message` | A, B | Human prose, prefixed by path |
| `error.patternPath` | A | `PatternPathStep[]` |
| `error.mismatchReason` | B | `MismatchReason` (tree) |
| `error.sourceLocation` | C | `{ sourceName, line, column }` |

## Exemplar Error Messages

Three before-and-after pairs illustrate the change.
Each "after" shows the message after axes A and B land; the text-source
variant under each case shows the further sharpening from axis C.

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
mustMatch(specimen, pattern);
```

**Today:**

```
user: age: -3 - Must be non-negative
```

**After axes A + B:**

```
.user.age: -3 - Must be a non-negative bigint (got number)
```

**After axis C (specimen from a `.pat` text file):**

```
schema.pat:3:11 .user.age: -3 - Must be a non-negative bigint (got number)
```

### Example 2: M.or with three structural alternatives

```js
const pattern = M.or(
  M.splitRecord({ kind: 'image', url: M.string() }),
  M.splitRecord({ kind: 'text', body: M.string() }),
  M.splitRecord({ kind: 'embed', target: M.remotable() }),
);
const specimen = harden({ kind: 'image', url: 42 });
mustMatch(specimen, pattern);
```

**Today:**

```
{"kind":"image","url":42} - Must match one of [splitRecord(...), splitRecord(...), splitRecord(...)]
```

(the `(...)` redactions are the actual quoted patterns inline, which spans
multiple terminal lines.)

**After axes A + B:**

```
closest alternative (alt 0): .url: 42 - Must be a string (got number)
  alt 0: .url: 42 - Must be a string
  alt 1: .kind: "image" - Must be "text"
  alt 2: .kind: "image" - Must be "embed"
```

The closest-alternative heuristic picks alt 0 because its `kind` matched
and the failure is on a leaf one level deeper than the kind-mismatch
failures for alts 1 and 2.

### Example 3: arrayOf with multiple bad elements

```js
const pattern = M.arrayOf(M.nat());
const specimen = harden([1n, 2, 3n, -4n, 'five']);
mustMatch(specimen, pattern);
```

**Today:**

```
[1]: 2 - Must be a bigint
```

(only the first failure is reported; the caller does not know there are
three more.)

**After axes A + B:**

```
[1]: 2 - Must be a bigint (and 2 more failures at [3], [4]; 4 total of 5 elements)
```

## Dependencies

| Design | Relationship |
|--------|--------------|
| (none in `designs/`) | This design touches `@endo/patterns` directly; no design predecessors. Implementation interacts with `@endo/common/apply-labeling-error.js`. |

## Phased Implementation

Phase A and Phase B are independently mergeable; either could land first.
Phase C depends on Phase A for the path-step rendering it consumes.

1. **Phase A: tree-path accumulation.**
   - Introduce `PatternPathStep` and the `applyLabelingError` wrapper that
     accumulates structured steps.
   - Sweep `patternMatchers.js` to pass structured steps instead of strings.
   - Add `pattern-path.test.js` with the three example failures above.
   - Verify the existing `mismatch-stack-demo.test-verbose.js` and the
     existing `patterns.test.js` pass with the new prefix format
     (`message: /...regex.../` adjusts on a small number of test cases).

2. **Phase B: per-combinator reason renderers.**
   - Add `mismatchRenderers` table and the five renderers listed above.
   - Plumb `error.mismatchReason` through `mustMatch`.
   - Add `mismatch-reason.test.js` exercising the closest-alternative
     heuristic for `match:or` and the count-and-indices summary for
     `match:arrayOf`.

3. **Phase C: text-source parse.**
   - Add `text-source/lexer.js`, `text-source/parser.js`, and
     `text-source/source-map.js`.
   - Integrate the source map into `mustMatch` via an options bag.
   - Add `text-source.test.js` with a handful of canonical pattern strings
     and the expected line-and-column diagnostics.

## Design Decisions

1. **Three independent axes, each separately mergeable.**
   Bundling them into one PR would make the change harder to review and harder
   to roll back; each axis delivers diagnostic value independently.

2. **Structured payload on the `Error` rather than a parallel return channel.**
   `mustMatch` already throws on failure; piggybacking structured information
   on the thrown `Error` reuses the existing call chain without an API change.
   Consumers that want programmatic access read the properties; consumers that
   want the human message read `error.message`.

3. **The closest-alternative heuristic for `match:or` prefers depth, then
   alternative index.**
   Other heuristics are possible (most fields matched, longest prefix of
   the path tree shared with the specimen).
   Depth is simple, deterministic, and matches the intuition that "the
   alternative that got furthest before failing is the one the author
   probably meant".

4. **Axis C reads a referentially transparent subset.**
   Excluding callbacks and remotables keeps the parser small and keeps the
   text-source authoring posture (LLM-generated patterns, configuration
   files) from accidentally smuggling code through.

5. **The renderer table is a registry, not class polymorphism.**
   A registry keeps the renderer-author concern (an external package writing
   a new `MatchHelper`) decoupled from the renderer-author's concern, and
   matches the existing `matchHelpers` registry shape in `patternMatchers.js`.

## Open Questions

- **Backward compatibility window for the path-prefix format.**
  Existing tests in `@endo/patterns`, `@endo/exo`, and downstream consumers
  use regex matches against the today-format prefix (`foo: bar:`).
  How many releases does the deprecation shim stay? One release (next minor)
  is the lightest; two is the safest.

- **Does `mismatchReason` belong on the `Error` or on a side-channel registry
  keyed by error identity?**
  Putting it on the `Error` is convenient but couples the diagnostic shape
  to the error.
  A `WeakMap<Error, MismatchReason>` keeps the error clean at the cost of an
  extra import for consumers.
  This design proposes the property; the alternative is recorded here as the
  fallback if review reveals a constraint.

- **Text-source surface: a function or a literal-template tag?**
  `parsePattern(string, options)` is simpler.
  A tagged template `pattern\`splitRecord({ ... })\`` reads more naturally but
  conflates a parse-time concern (line and column) with a JS-side concern
  (the tagged template's source location).
  The design proposes a function for the first cut.

- **Should the closest-alternative heuristic be configurable?**
  Some consumers may prefer "first matching kind" over "deepest path".
  The simplest path: a single heuristic, no option, until a real downstream
  consumer asks.

- **Interaction with `@endo/exo` argument guards.**
  `applyLabelingError` is also used by `@endo/exo` for method-argument
  labeling.
  This design's path-step accumulator must not break that consumer.
  A short investigation pass before Phase A lands is appropriate; the
  expected outcome is that exo's per-argument label is a `property`-step
  with the argument name, which composes cleanly.

## Prompt

> Substantially improve `@endo/patterns` mismatch diagnostics: line and column,
> tree path, human-readable reason. Carve into three axes:
> A) tree-path accumulation,
> B) per-combinator reason renderers,
> C) alternate text-source path with own parse.
> Length: 1 to 3 screens.
