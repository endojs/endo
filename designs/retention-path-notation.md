# Retention Path Notation and Bulk Collection

| | |
|---|---|
| **Created** | 2026-05-10 |
| **Updated** | 2026-05-19 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Reference |
| **Source** | PR #151 inline review comment 3214462743 |

## Status

**Reference** (captured as a reference document 2026-05-10; the
narrower single-target API in `daemon-retention-paths` is the active
forward-looking proposal).

Captured for reference; not a forward-looking proposal.
The notation and bulk-collection sketch remain available as background
for any future work on retention-path surfaces, but no implementation
PR is planned against this document.
The single-target snapshot and subscription API in
[`daemon-retention-paths`](daemon-retention-paths.md) is the active
proposal.

### Roadmap calibration (per `git blame` on `llm`)

- Design phase: 2026-05-10 (single-day burst). Initial design commit
  `b2f0481f7` 2026-05-10 ("design: retention-path notation for CLI
  and chat UI"); same-day review-wrap `dea3e7186` ("fixup(design):
  kriskowal review wrap, 8 inlines, #181").
- Reference transition: 2026-05-10 (immediate; the document was
  classified Reference at landing, with `daemon-retention-paths`
  carrying the implementable single-target slice).
- No implementation phase is planned against this document; future
  retention-path implementations are scoped via
  `daemon-retention-paths` (PR #284 open).

## What is the Problem Being Solved?

PR #151 adds `endo workers`, which prints each worker formula and the
capabilities tenanted in it via `listWorkerTenants(workerName)`.
The maintainer's review surfaced two concrete gaps:

1. There is no reverse lookup that tells the operator *where* a tenant
   capability lives in the host's namespace.
   `listWorkerTenants` returns `{ name, type }`, but `name` is just the
   first pet name discovered in the host's pet store; a tenant may be
   reachable under several names, under nested directories, or only via
   retention edges with no pet name at all.
2. There is no syntactic convention for unambiguously rendering a
   retention path at the CLI.
   The design `daemon-retention-paths.md` proposes an inspector panel
   per target value, but does not define a textual notation for one
   path, nor a primitive for collecting one path (or one best path) for
   each of many targets in a single call.

This document defines:

- A typed `RetentionPath` shape (extending the segment in
  `daemon-retention-paths.md`) where every component carries its own
  locator so consumers can drill in without a second round trip.
- A bulk host method `listRetentionPaths(targetIds)` that returns a
  best path for each target, in one call, typed.
  The host returns the typed `RetentionPath`; rendering belongs to the
  consumer.
- A "best path" projection rule used by row-oriented surfaces (`endo
  workers`, the workers panel summary list, chat-side tenant chips)
  where a single path per tenant is the constraint.
- A canonical CLI string notation for one path so a CLI line can
  render it unambiguously.
  This notation is owned by the CLI, not the daemon.
  The chat UI consumes the same typed `RetentionPath` and renders with
  markup directly; it does not parse the CLI string.

The richer per-target inspector subscription, the chat paths panel,
and the disincarnate / reincarnate affordances remain in
[`daemon-retention-paths.md`](./daemon-retention-paths.md).
This document is the bulk-collection sibling that unblocks `endo
workers` (PR #151) and any future row-oriented surface, plus the
CLI-side string notation those surfaces need.

## Status of Overlapping Designs

| Design | Overlap | Resolution |
|---|---|---|
| [`daemon-retention-paths`](./daemon-retention-paths.md) (Not Started) | Defines the `RetentionPath` segment shape, single-target `listRetentionPaths(locator)`, `followRetentionPaths(locator)` subscription, paths panel with delete-pet-name and disincarnate. | This sibling reuses the segment shape and extends it so each component carries its own locator. It adds a bulk variant `listRetentionPaths(targetIds)` returning one best path per target, a `bestPath` selection rule, and the integration sketches for `endo workers` and chat tenant chips. |
| [`workers-panel`](./workers-panel.md) (Not Started) | Mentions a `retentionPath(petName)` API returning a flat array of `{ name, formulaType }`. | The flat-array API is replaced by the typed `RetentionPath` from `daemon-retention-paths.md` and rendered by the consumer (CLI string here, chat markup there). |
| [`formula-inspector`](./formula-inspector.md) (Not Started) | Mentions surfacing retention paths as a one-line aside. | Inspector embeds the per-target panel from `daemon-retention-paths.md`; the row-oriented `endo inspect` summary uses the typed bulk return and renders with the CLI notation defined here. |

## Status quo

- `packages/daemon/src/graph.js` already maintains the labeled formula
  graph and exposes `listRetentionPaths(targetId)` (line 748) returning
  `RetentionPath[]`.
  The function is private to the GC; nothing outside `daemon.js`
  imports it.
- `packages/daemon/src/host.js` exposes per-name lookups
  (`identify`, `locate`, `reverseLookup`) but no path-shaped reverse
  lookup.
  `reverseLookup(presence)` returns the local pet store's names for an
  id (a flat array of strings); it does not traverse parent directories
  and does not surface retention edges.
- `pet-store.js` `reverseIdentify(id)` returns names within a single
  pet store; nested directory paths are not reconstructed.
- The existing pet-name path syntax is `/`-delimited (`alice/inbox/2026-05`)
  per `packages/cli/src/pet-name.js` `parsePetNamePath`; the parser
  splits on `/` and accepts every other character verbatim.
- The locator format is
  `endo://{nodeNumber}/?id={formulaNumber}&type={formulaType}` per
  `packages/daemon/src/locator.js`.
- Edge labels already recorded by `graph.js` include `pet:<name>` (set
  on pet-store writes), field names from `extractLabeledDeps` (e.g.,
  `worker`, `handle`, `petStore`, `hub`, `powers`, `slot0`, `bundle`,
  `agent`, `mailbox`, `mailHub`), and `retention` for cross-peer
  edges.

### Pet-name and special-name character set

The exact rules from `packages/daemon/src/pet-name.js` are load-bearing
for the notation, so they are reproduced here.

A `PetName` (regular pet name, the value most callers think of as a
"pet name") is any string of length 1 to 255 that:

- does not contain `/`
- does not contain `\0`
- does not contain `@`
- is not exactly `.` or `..`

Every other printable character is allowed in a pet name.
That includes `:`, `~`, `#`, `*`, ` ` (space), backtick, double-quote,
and so on.
The notation in this design cannot assume any of those characters are
absent from a pet name.

A `SpecialName` is a string matching `/^@[a-z][a-z0-9-]{0,127}$/`,
that is, an `@` followed by a lowercase ASCII identifier with hyphens.
Special names include `@self`, `@host`, `@endo`, `@known-peers-store`.
The `@` prefix is the boundary marker for special names; it does not
appear in the body of any pet name (pet names forbid `@` outright) but
it does appear at the start of special names that occupy the same
namespace.

A `Name` (the type accepted by directory paths) is `PetName |
SpecialName`.
Some pet stores (notably the per-host pet store) use the `@` prefix to
partition special-cased entries; mailbox stores accept only message
numbers (`assertMailboxStoreName` in `packages/daemon/src/mail.js`).
Pet stores in general use the `assertValidName` they were constructed
with, which is `assertPetName` for the standard pet store and other
asserters elsewhere.

For the notation: the only characters guaranteed safe as
pet-name-component delimiters are `/` and `\0`.
`/` is already the path separator.
`\0` is unprintable and unusable in human-facing notation.
Every other ASCII punctuation choice (`:`, `~`, `#`, `,`, etc.) can
appear inside a pet name and therefore needs an escape mechanism.

The notation surface is therefore not blocked on graph plumbing.
What is missing is (a) a typed bulk return shape, (b) a host-facing
entry point, and (c) a CLI notation that handles the real pet-name
character set.

## RetentionPath model

This sibling refines the segment shape in
`daemon-retention-paths.md` so each component carries its own locator
and so the union-find merge kind is explicit on segments that
represent merged groups.

```typescript
type RetentionPathSegment = {
  /**
   * Locator of the group representative for this segment.
   * Always present; consumers use this as the "click target" for
   * drilling into a segment.
   */
  locator: string;
  /**
   * All formula identifiers in the same union-find group as the
   * representative.
   * Length 1 if the segment is not a merged group.
   */
  groupMembers: FormulaIdentifier[];
  /**
   * The kind of merge that produced this group, when length > 1.
   * Examples: `'host+handle'`, `'channel+handle'`,
   * `'promise+resolver'`.
   * Absent when `groupMembers.length === 1`.
   */
  mergeKind?: string;
  /**
   * The locator of the group representative on the upstream side of
   * the edge into this segment.
   * Absent on the root segment.
   */
  referencedBy?: string;
  /**
   * Edge labels from `referencedBy` into this group.
   * Distinguishes pet-name edges (`'pet:<name>'`) from internal links
   * (`'worker'`, `'handle'`, `'hub'`, `'powers'`, `'slot0'`, etc.) and
   * cross-peer retention edges (`'retention'`).
   */
  labels?: string[];
  /**
   * Present on the topmost segment if the group is a GC root.
   * `'persistent'` for entries in `roots` (e.g., `endo`,
   * `known-peers-store`).
   * `'transient'` for entries pinned by an in-flight host operation
   * (entries in `transientRoots`).
   */
  rootKind?: 'persistent' | 'transient';
};

type RetentionPath = RetentionPathSegment[];
```

The leaf segment is the target group; subsequent segments walk
*upstream* toward a root.
The topmost segment carries `rootKind`.
`mergeKind` and `rootKind` are new relative to
`daemon-retention-paths.md`; the per-segment `locator` field is also
new and is the load-bearing addition for "click any component to drill
in" UX in both CLI and chat.

`graph.js` produces the segment with the locator and merge metadata
already available; surfacing them is a render-side change rather than
a graph-side one.

## Host method API

One method is added to the `EndoHost` interface (and the corresponding
`Mail` interface).
It is host-only; guests cannot enumerate retention paths through
capabilities they do not own (the rationale matches
`daemon-retention-paths.md` § "Why host-only").

```typescript
interface EndoHost {
  /**
   * Snapshot the best retention path for many targets in one call.
   * `targetIds` may be formula identifiers or locator strings.
   * Returns one path per input, in input order.
   * A target with no retention path returns an empty array (length 0)
   * at that position.
   * "Best" is defined by the selection rule below.
   */
  listRetentionPaths(
    targetIds: Array<FormulaIdentifier | string>,
  ): Promise<Array<RetentionPath>>;
}
```

The bulk return is `Array<RetentionPath>` (one path per target), not
`Array<RetentionPath[]>` (a list of paths per target).
The single-target "all paths" use case (the inspector panel) is served
by the per-target `listRetentionPaths(locator): Promise<RetentionPath[]>`
defined in `daemon-retention-paths.md`; this bulk method exists for the
row-oriented surfaces that need exactly one path per target.

The daemon does not host any string-rendering method.
The typed return is the shared canonical form; the CLI renders with
the string notation defined below; the chat UI renders with markup
directly from the typed value.

### Best-path selection rule

When a target has multiple retention paths, the host picks one as the
"best" by:

1. Prefer paths rooted at a persistent root (e.g., `@endo`,
   `@known-peers-store`) over paths rooted at a transient root.
2. Prefer paths that contain at least one pet-name edge over paths
   that consist only of field edges (the latter are present but not
   user-named).
3. Prefer the shortest path among those tied on (1) and (2).
4. Prefer the lexicographically smallest path (by rendered notation)
   among those tied on (1), (2), and (3).

Selection happens on the host because it requires the same graph walk
that produced the candidate paths; folding it into the same call
avoids serializing every candidate.

### Errors

- An invalid id or locator string in `targetIds` produces an empty
  `RetentionPath` (length 0) at that position; it is not an error.
  This matches the row-oriented use case where some tenants may have
  been collected between the `listWorkerTenants` call and the
  `listRetentionPaths` call.
- A target whose formula is unknown to this host (a remote-only
  reference) returns the same empty `RetentionPath`.

## CLI string notation

The CLI owns a canonical string notation for rendering one
`RetentionPath` per line.
This notation is for human-readable CLI surfaces (`endo workers`,
`endo paths`, `endo inspect`); it is not transmitted by the daemon and
is not the chat UI's rendering.

### Goals

A retention-path notation must be:

- Unambiguous: one string maps to one path through the formula graph.
- Type-able: an operator at a CLI prompt can write a path by hand
  using ASCII characters available without modifier keys.
- Renderable: works in monospace CLI output.
- Compact for the common case where every edge along the path is a
  pet-name edge.
- Distinguishable: pet-name edges, field edges, retention edges, and
  root markers are visually distinct without relying on color.

### Path-segment notation

A retention path renders left-to-right from a GC root toward the
target.
Each segment of the path produces one of the following textual forms:

| Segment | Notation | Example |
|---|---|---|
| Persistent root | `@<root-name>` | `@endo`, `@known-peers-store` |
| Transient root | `*<root-id-prefix>` | `*7a3f` |
| Pet-name edge | `/<name>` | `/inbox`, `/alice` |
| Field edge | `:<field>` | `:worker`, `:hub`, `:slot0` |
| Retention edge | `~peer:<peer-id-prefix>` | `~peer:7a3f` |

A complete path concatenates segments with no intervening whitespace.
The first segment is always a root.
Persistent roots use the `@` prefix; transient roots use the `*`
prefix to distinguish a short-lived pin from a named root.
The transient root identifier defaults to a 4-char prefix of the root
formula's id; `--full-ids` reveals the full id.
The last segment names the target.
The target's group type is appended after a `#` to disambiguate when
the same name resolves to different formula types in different paths.

Examples:

```
@endo/pins/shared-file#eval
@endo:hub/alice/inbox/2026-05#eval
@known-peers-store:hub~peer:7a3f/shared-file#eval
@endo/host:worker#worker
*7a3f/scratch#eval
```

Parsing is left-to-right, single-character lookahead on `/`, `:`,
`~`, `#`, `@`, `*`.
The set of root names is closed (`endo`, `known-peers-store`, plus a
small fixed list maintained alongside `formula-type.js`'s root
formulas).
Field names are drawn from `extractLabeledDeps` and are also a closed
set.

### Pet-name escaping

Pet names can contain any character except `/`, `\0`, and `@`; in
particular `:`, `~`, `#`, `*`, and whitespace are all permitted.
The notation cannot assume those characters are absent.

A pet-name segment whose body contains any of `/`, `:`, `~`, `#`, or
whitespace renders in a quoted form:

```
/"name with spaces"
/"name:with:colons"
/"name#hash"
```

Quoted form: a leading `/`, a `"`, the literal pet name with `\` and
`"` backslash-escaped, a closing `"`.
A pet name with no special characters renders bare (`/inbox`); the
parser accepts both forms.

The `@` character cannot appear in a pet name (the pet-name validator
rejects it), so the leading `@` of a root segment is unambiguous and
needs no quoting.
Similarly `*` cannot occur immediately after a segment delimiter
without ambiguity (it is reserved for the transient-root prefix); a
pet name beginning with `*` renders as `/"*..."`.

### Group-membership rendering

A retention-path segment can correspond to a group of formulas merged
by union-find (host+handle, channel+handle, promise+resolver).
The default rendering picks the segment's primary pet-name (if any)
or the group representative's id, and appends `+<mergeKind>` to name
the merge:

```
@endo/promise#promise+resolver
@endo/host#host+handle
```

The full member list is available via `--verbose` (CLI) or the
expanded inspector panel.
The `+<mergeKind>` form is more informative than a count and reads
naturally for the small fixed set of merges produced by
`graph.js`'s union-find.

### Multi-path listing

For surfaces that want every path (the per-target inspector deck or
`endo paths <name-or-locator>`), call the single-target
`listRetentionPaths(locator)` from
[`daemon-retention-paths.md`](./daemon-retention-paths.md).
The CLI lists them one per line, prefixed with the path index and
rendered with the notation above:

```
$ endo paths shared-file
1  @endo/pins/shared-file#eval
2  @known-peers-store:hub~peer:7a3f/shared-file#eval
```

### Best-path display in row-oriented surfaces

For row-oriented surfaces where one path per target is the constraint
(`endo workers`, the workers-panel tenant list), the host returns a
single best path; the CLI renders that path and (when there are more)
appends a `+N` suffix indicating additional paths exist:

```
worker-7a3f
  @endo/pins/shared-file#eval +1
  @endo/inbox:mailHub#mail-hub
```

The CLI obtains `+N` either from a separate count field (added in a
follow-up) or by calling the per-target `listRetentionPaths(locator)`
on demand when the operator drills in.
This iteration ships the best-path return without the count; surfaces
that want the count call the per-target API.

If no path is reachable, the best-path string is empty and the row
falls back to the locator.

## Fast collection: indexing and cost

The existing `listRetentionPaths(targetId)` in `graph.js` is a BFS
upstream from the target group through `groupInEdges`; cost is linear
in the number of paths times the average path length.
For the bulk variant, the daemon walks each target independently;
shared upstream work is not memoized in this iteration because the
working set per `endo workers` call is bounded by the tenant count
(typically tens, not thousands).

If profiling shows shared upstream work dominating, the followup is a
memoization layer keyed by `(group, depth)` that caches partial
upstream walks across targets within a single bulk call.
The memoization is correct because the graph cannot mutate during
the call; the host holds the formula-graph lock for the duration.

No reverse-lookup index is added in this iteration.
The `groupInEdges` map already serves as the reverse-lookup
substrate; the missing piece was an externally accessible API and the
shape of the bulk return.

## Integration with `endo workers` (PR #151)

The current PR #151 row format is:

```
worker-7a3f
  shared-file (eval)
  inbox-mailhub (mail-hub)
```

After this design lands, `workers.js` calls
`listRetentionPaths(tenantIds)` once per worker (or once total for all
workers' tenants), receives an `Array<RetentionPath>`, and renders
each path with the CLI notation:

```
worker-7a3f
  @endo/pins/shared-file#eval
  @endo/inbox:mailHub#mail-hub
```

The row's left margin (the tenant's discovered pet name) is dropped;
the rendered notation is the canonical identifier and includes any
pet-name edges.

The `--json` form gains a `retentionPath` field per tenant containing
the typed `RetentionPath`:

```json
{
  "name": "shared-file",
  "type": "eval",
  "id": "...:0000...",
  "retentionPath": [
    { "locator": "...", "groupMembers": ["..."], "rootKind": "persistent", "labels": ["pet:pins"] },
    { "locator": "..." }
  ]
}
```

JSON consumers read the typed shape directly; the CLI string is for
the human-facing surface.

## Integration with chat UI

The chat tenant chip (rendered for each capability inside a worker
tile, value tile, or inspector panel) consumes the same typed
`RetentionPath` returned by `listRetentionPaths`.
The chip renders the path as a sequence of sub-chips, each styled by
edge kind and bound to its segment's `locator`:

- Root segments: bold, blue.
  Persistent vs transient distinguished by an icon, not by the `@` /
  `*` prefix used in the CLI string.
- Pet-name edges: bold, default text color.
- Field edges: gray, italic.
- Retention edges: gray, with a hover tooltip showing the full peer
  id and pet name (if any).
- Type suffix: small caps, muted.

Each sub-chip is clickable and opens the inspector for the segment's
`locator`.
The chat UI does not parse the CLI string notation; it walks the
typed `RetentionPath` directly.
The CLI string notation and the chat markup rendering are two
independent renderings of the same typed value; the typed
`RetentionPath` is the backbone that keeps them from drifting.

The user-facing copy operation in the chat UI yields the CLI string
notation (rendered on the client from the typed value) so the chip
text round-trips through copy and paste into a CLI invocation.

## Phased implementation

### Phase 1: Typed bulk method

- Add `host.listRetentionPaths(targetIds)` returning
  `Array<RetentionPath>`, with the per-segment `locator` and
  `mergeKind` fields surfaced from `graph.js`.
- Surface the new fields on `RetentionPathSegment` from
  `daemon-retention-paths.md`.
- Unit tests: best-path selection, positional preservation, missing
  / invalid ids, transient-only vs persistent-rooted, merged-group
  segments.

### Phase 2: CLI string notation and integrations

- Add `packages/cli/src/retention-path-notation.js` exporting
  `renderRetentionPath(path) -> string` and `parseRetentionPath(string)
  -> RetentionPath | undefined`.
  The parser is included so the CLI can validate hand-typed paths in a
  future search-by-path feature; the bulk method does not depend on it.
- Wire `endo workers` to `listRetentionPaths` and render with the
  notation.
- Add `endo paths <name-or-locator>` (defined in
  `daemon-retention-paths.md`) and have it print using the notation
  defined here.

### Phase 3: Chat tenant chip

- Tenant chip component reads the typed `RetentionPath` and renders
  per the styling above.
- Click on a sub-chip opens the inspector for that segment's locator.
- Copy yields the CLI notation, rendered on the client.

## Alternatives considered

### Use the formula identifier as the path

`{number}:{node}` is unambiguous and type-able, but is two
64-character hex strings.
It carries no information about *why* the formula is alive, which is
the question the operator is asking when they reach for `endo
workers`.
Rejected as the primary surface; retained as a secondary form
available via `--full-ids`.

### Use the pet-name path verbatim (`alice/inbox/2026-05`)

Pet-name paths are already used by the CLI and are familiar.
However, they only describe *one* way the value is reachable
(through nested directories under one root), and they cannot express
field edges, peer retention, or paths that pass through a
non-pet-named intermediary.
A worker held by the host's `:worker` field on a guest formula has no
pet-name path at all.
Rejected as insufficient; retained as the *substrate* for the
`/<name>` segments in the notation.

### Use a JSON shape inline

`{"root":"endo","segments":[{"type":"pet","name":"pins"},...]}` is
unambiguous and renderable, but is not type-able and reads poorly in
a single-line CLI row.
JSON is appropriate for `--json` output and is what the bulk method
returns; inline rendering is the CLI notation's job.
Rejected as a default for human-facing surfaces.

### Use a Unix-path-style notation throughout

`/endo/pins/shared-file` reads naturally to Unix users, but loses the
distinction between pet-name edges and field edges (both look like
`/`-segments).
A field name like `worker` would collide with a pet name `worker`
sharing the same store level.
Rejected; the `:` prefix on field segments is load-bearing.

### Render on the daemon (`describeRetentionPaths`)

An earlier draft proposed a host method `describeRetentionPaths` that
returned rendered notation strings instead of typed paths.
Rationale was shared canonicality: one rendering site, no risk of
drift between CLI and chat.
Rejected: rendering is a consumer concern.
The CLI's notation has no value to the chat UI (which renders with
markup), and a daemon-side string method would force the chat UI to
re-parse CLI strings just to discover segment boundaries it could
have read straight from the typed value.
The typed `RetentionPath` is the backbone that prevents drift; the
two renderings are sibling consumers of that backbone.

## Decisions

- **Path stability across formulations.**
  Snapshot semantics are accepted for this iteration.
  Pet names move; a tenant's best path may change between two `endo
  workers` invocations.
  The `--json` payload includes both the locator and the typed
  `RetentionPath`, so a script that wants stability across snapshots
  matches on the locator.
  Followers and subscribers (a `followRetentionPaths`-style
  subscription for the bulk return) are deferred to a later design,
  alongside the per-target subscription already proposed in
  `daemon-retention-paths.md`.
- **Bulk return shape.**
  The host returns typed `RetentionPath`, not rendered strings.
  Consumer flexibility wins over shared canonicality at the daemon
  boundary.
  The CLI owns its string notation; the chat UI owns its markup
  rendering; the typed shape is the contract that keeps them
  consistent.
- **Group rendering.**
  Merged groups render with the merge kind (`+resolver`, `+handle`)
  rather than just a count.
  The `mergeKind` field on `RetentionPathSegment` carries this
  information from `graph.js`'s union-find.

## Open questions

- **Root-name dictionary scope.**
  This design lists `@endo` and `@known-peers-store` as persistent
  root names.
  Transient roots render as `*<root-id-prefix>` (e.g., `*7a3f`).
  Should the prefix length be configurable, or is 4 hex chars
  enough for diagnosability?
  The current `endo workers` use case does not need to distinguish
  individual transient roots, but the inspector panel might.
- **Pet-name escaping syntax choice.**
  The notation quotes pet names containing `/`, `:`, `~`, `#`, or
  whitespace using `"..."` with backslash-escapes.
  An alternative is percent-encoding (familiar from URLs) which
  reads worse but parses with off-the-shelf libraries.
  The proposed quoted form is the recommendation; flagged for review.

## Affected packages

- `packages/daemon`: surface the `locator`, `mergeKind`, and
  `rootKind` fields on `RetentionPathSegment`; add the bulk
  `listRetentionPaths(targetIds)` host method; export updated types.
- `packages/cli`: new `retention-path-notation.js` (renderer + parser);
  `endo workers` calls the bulk method and renders with the notation;
  `endo paths` (per `daemon-retention-paths.md`) prints using the new
  renderer.
- `packages/chat`: tenant chip component renders the typed
  `RetentionPath` directly with markup; copy yields the CLI notation
  rendered on the client.

## Test plan

- Unit (daemon): bulk method positional preservation; transient-only
  and unreachable cases; merged-group segments expose `mergeKind`;
  per-segment `locator` matches the group representative.
- Unit (CLI): notation render + parse round-trip on representative
  paths (single-pet-name, multi-segment with field edges, with
  retention edge, with merged group, transient-rooted, root-only,
  pet name with `:` and spaces requiring quoting).
- Integration: two-daemon test asserting `listRetentionPaths` for
  a peer-shared target picks the local persistent-rooted path over
  the cross-peer retention path per the best-path rule.
- CLI: smoke test `endo workers` renders notation strings; `--json`
  payload includes typed `retentionPath`.
- Chat: tenant chip renders all four segment kinds from the typed
  shape; copy yields the CLI notation string verbatim.

## Prompt

> We desperately need a CLI and Chat UI notation system for
> unambiguously rendering retention paths and a fast system for
> collecting them. Please investigate the status quo and dispatch a
> designer to propose a design to close the gap, such that there's a
> host method available here for rendering the retention path for
> each worker tenant.
>
> (kriskowal, PR #151 inline review comment 3214462743, 2026-05-10)
