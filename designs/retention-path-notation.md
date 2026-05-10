# Retention Path Notation and Bulk Collection

| | |
|---|---|
| **Created** | 2026-05-10 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Proposed |
| **Source** | PR #151 inline review comment 3214462743 |

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
   retention path either at the CLI or in the chat UI.
   The design `daemon-retention-paths.md` proposes an inspector panel
   per target value, but does not define a textual notation for one
   path, nor a primitive for collecting one path (or one best path) for
   each of many targets in a single call.

This document defines:

- A canonical string notation for one retention path so a CLI line or
  a chat message can render it unambiguously.
- A bulk host method `listRetentionPaths(targetIds)` that returns paths
  for an array of targets in a single round trip.
- A "best path" projection used by row-oriented surfaces (`endo
  workers`, the workers panel summary list, chat-side tenant chips)
  where a single line per tenant is the constraint.

The richer per-target inspector subscription, the chat paths panel,
and the disincarnate / reincarnate affordances remain in
[`daemon-retention-paths.md`](./daemon-retention-paths.md).
This document is the notation and bulk-collection sibling that
unblocks `endo workers` (PR #151) and any future row-oriented surface.

## Status of Overlapping Designs

| Design | Overlap | Resolution |
|---|---|---|
| [`daemon-retention-paths`](./daemon-retention-paths.md) (Not Started) | Defines `RetentionPath[]` shape, `listRetentionPaths(locator)` per-target snapshot, `followRetentionPaths(locator)` subscription, paths panel with delete-pet-name and disincarnate. | This sibling reuses the `RetentionPath` shape verbatim. It adds a string notation for one path, a bulk variant `listRetentionPaths(targetIds)` returning a map, a `bestPath` projection, and the integration sketches for `endo workers` and chat tenant chips. |
| [`workers-panel`](./workers-panel.md) (Not Started) | Mentions a `retentionPath(petName)` API returning a flat array of `{ name, formulaType }`. | The flat-array API is replaced by the `RetentionPath` shape from `daemon-retention-paths.md` and rendered using the notation defined here. |
| [`formula-inspector`](./formula-inspector.md) (Not Started) | Mentions surfacing retention paths as a one-line aside. | Inspector embeds the per-target panel from `daemon-retention-paths.md`; the row-oriented `endo inspect` summary line uses the notation here. |

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
  per `packages/cli/src/pet-name.js` `parsePetNamePath`.
  Pet names cannot contain `/`, `\0`, `@`, or be `.` or `..` per
  `packages/daemon/src/pet-name.js`.
- The locator format is
  `endo://{nodeNumber}/?id={formulaNumber}&type={formulaType}` per
  `packages/daemon/src/locator.js`.
- Edge labels already recorded by `graph.js` include `pet:<name>` (set
  on pet-store writes), field names from `extractLabeledDeps` (e.g.,
  `worker`, `handle`, `petStore`, `hub`, `powers`, `slot0`, `bundle`,
  `agent`, `mailbox`, `mailHub`), and `retention` for cross-peer
  edges.

The notation surface is therefore not blocked on graph plumbing.
What is missing is (a) a textual rendering, (b) a host-facing entry
point, and (c) an aggregation-friendly bulk variant.

## Notation

### Goals

A retention-path notation must be:

- Unambiguous: one string maps to one path through the formula graph.
- Type-able: an operator at a CLI prompt can write a path by hand
  using ASCII characters available without modifier keys.
- Renderable: the same notation works in monospace CLI output and in
  the chat UI (where it can be additionally styled, but the underlying
  text is the source of truth).
- Compact for the common case where every edge along the path is a
  pet-name edge.
- Distinguishable: pet-name edges, field edges, retention edges, and
  root markers are visually distinct without relying on color.

### Path-segment notation

A retention path renders left-to-right from a GC root toward the
target.
Each segment of the path produces one of three textual forms:

| Segment | Notation | Example |
|---|---|---|
| Root group | `@<root-name>` | `@endo`, `@known-peers-store` |
| Pet-name edge | `/<name>` | `/inbox`, `/alice` |
| Field edge | `:<field>` | `:worker`, `:hub`, `:slot0` |
| Retention edge | `~peer:<peer-id-prefix>` | `~peer:7a3f` |

A complete path concatenates segments with no intervening whitespace.
The first segment is always a root in `@<name>` form.
The last segment names the target.
The target's group type is appended after a `#` to disambiguate when
the same name resolves to different formula types in different paths.

Examples:

```
@endo/pins/shared-file#eval
@endo:hub/alice/inbox/2026-05#eval
@known-peers-store:hub~peer:7a3f/shared-file#eval
@endo/host:worker#worker
```

Parsing is left-to-right, single-character lookahead on `/`, `:`,
`~`, `#`.
The set of root names is closed (`endo`, `known-peers-store`, plus a
small fixed list maintained alongside `formula-type.js`'s root
formulas).
Field names are drawn from `extractLabeledDeps` and are also a closed
set.
Pet names cannot contain `/`, `:`, `~`, `#`, `@`, or `\0`; this
guarantees the notation is unambiguous against pet-name content.

The `~peer:<prefix>` form uses the first 4 hex chars of the peer's
node number for human readability.
A full peer id is recoverable via the `--full-ids` flag (CLI) or by
hovering the rendered chip (chat).
The notation deliberately does not embed full 64-char peer ids inline;
they would defeat compactness and readability is the point of the
notation.

### Group-membership rendering

A retention-path segment can correspond to a group of formulas merged
by union-find (host↔handle, channel↔handle, promise↔resolver).
The default rendering picks the group's primary pet-name segment if
one exists, else the first member id, and appends `+<n>` if the group
has more than one member.

```
@endo/promise#promise+1   # promise + resolver group
@endo/host#host+1         # host + handle group
```

The full member list is available via `--verbose` (CLI) or the
expanded inspector panel.
This keeps the bulk row format short while giving operators a way to
drill in.

### Multi-path listing

`listRetentionPaths(targetId)` returns *every* path; many targets
have several.
The CLI lists them one per line, prefixed with the path index:

```
$ endo paths shared-file
1  @endo/pins/shared-file#eval
2  @known-peers-store:hub~peer:7a3f/shared-file#eval
```

The chat UI renders each path as a chip stack, with each segment a
clickable sub-chip linking to its formula's inspector.
The notation is the underlying text payload, copy-pasted out of the
UI as the canonical form.

### Best-path projection

For row-oriented surfaces where one path per target is the constraint
(`endo workers`, the workers-panel tenant list, chat tenant chips on
a value), the host returns a single "best" path chosen by:

1. Prefer paths rooted at `@endo` (the host agent root) over peer
   roots.
2. Prefer paths that contain at least one pet-name edge over paths
   that consist only of field edges (the latter are present but not
   user-named).
3. Prefer the shortest path among those tied on (1) and (2).
4. Prefer the lexicographically smallest path among those tied on
   (1), (2), and (3).

The chosen path is rendered using the notation above and serves as
the row's identifier surrogate.
A `+N` suffix indicates additional paths exist for the same target,
clickable in the chat UI to expand:

```
worker-7a3f
  shared-file       @endo/pins/shared-file#eval +1
  inbox-mailhub     @endo/inbox:mailHub#mail-hub
```

If no path is reachable (the target is held only by transient pins or
by an in-flight host operation), the best-path string is `@transient`
and the `+N` count is zero.

## Host method API

Two methods are added to the `EndoHost` interface (and the
corresponding `Mail` interface).
Both are host-only; guests cannot enumerate retention paths through
capabilities they do not own (the rationale matches
`daemon-retention-paths.md` § "Why host-only").

### Bulk snapshot

```typescript
interface EndoHost {
  /**
   * Snapshot retention paths for many targets in one call.
   * `targetIds` may be formula identifiers or locator strings.
   * Returns a map keyed by the input order; missing targets map to
   * an empty array.
   */
  listRetentionPaths(
    targetIds: Array<FormulaIdentifier | string>,
  ): Promise<Array<RetentionPath[]>>;
}
```

The bulk shape replaces the per-target shape proposed in
`daemon-retention-paths.md` § "Daemon surface".
A single host call walks the graph once per target without repeated
CapTP round trips.
For `endo workers`, the cost is one host call regardless of tenant
count, where the per-target API would be one call per tenant.

The returned array is positional with `targetIds` so the caller can
reassemble a result map without sending pet names back over CapTP.

For backwards compatibility with the inspector panel use case, the
single-target convenience wrapper

```typescript
listRetentionPathsFor(
  targetId: FormulaIdentifier | string,
): Promise<RetentionPath[]>;
```

remains available; it is sugar for `listRetentionPaths([targetId])
.then(([paths]) => paths)`.

### Best-path projection

```typescript
interface EndoHost {
  /**
   * Return the chosen "best" retention path for each target as the
   * notation string defined above, plus a count of additional paths.
   * Empty path string (`""`) means the target is unreachable;
   * `"@transient"` means it is held only by transient pins.
   */
  describeRetentionPaths(
    targetIds: Array<FormulaIdentifier | string>,
  ): Promise<Array<{ best: string; otherCount: number }>>;
}
```

`describeRetentionPaths` is the method `endo workers` calls per row.
It returns rendered strings (not raw `RetentionPath` shapes) so the
CLI and chat UI share the canonical rendering and cannot drift.

Rendering happens on the host because:

- The notation is the host's authoritative view of its own namespace.
- Field-label and root-name dictionaries live in the daemon
  (`extractLabeledDeps`, `formula-type.js`); duplicating them in CLI
  and chat is a drift hazard.
- Best-path selection requires the same graph walk; folding rendering
  into the same call avoids serializing intermediate `RetentionPath`
  shapes.

The richer `RetentionPath[]` shape is still exposed via
`listRetentionPaths` for the inspector panel and for any consumer
that wants to render paths differently.

### Errors

- An invalid id or locator string in `targetIds` produces an empty
  array entry at that position; it is not an error.
  This matches the row-oriented use case where some tenants may have
  been collected between the `listWorkerTenants` call and the
  `describeRetentionPaths` call.
- A target whose formula is unknown to this host (a remote-only
  reference) returns `[]` from `listRetentionPaths` and `{ best: "",
  otherCount: 0 }` from `describeRetentionPaths`.

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

The notation rendering itself is O(path-length) and adds negligible
cost on top of the graph walk.

No reverse-lookup index is added in this iteration.
The `groupInEdges` map already serves as the reverse-lookup
substrate; the missing piece was an externally accessible API and a
notation, not an index.

## Integration with `endo workers` (PR #151)

The current PR #151 row format is:

```
worker-7a3f
  shared-file (eval)
  inbox-mailhub (mail-hub)
```

After this design lands, `workers.js` calls
`describeRetentionPaths(tenantIds)` once per worker (or once total
for all workers' tenants) and renders:

```
worker-7a3f
  @endo/pins/shared-file#eval +1
  @endo/inbox:mailHub#mail-hub
```

The row's left margin (the tenant's discovered pet name) is dropped;
the notation string is the canonical identifier and includes any
pet-name edges.
The `+N` suffix tells the operator that drilling in (`endo paths
<locator>` or the chat panel) reveals additional paths.

The `--json` form gains a `retentionPaths` field per tenant:

```json
{
  "name": "shared-file",
  "type": "eval",
  "id": "...:0000...",
  "retentionPaths": {
    "best": "@endo/pins/shared-file#eval",
    "otherCount": 1
  }
}
```

## Integration with chat UI

The chat tenant chip (rendered for each capability inside a worker
tile, value tile, or inspector panel) uses the same
`describeRetentionPaths` payload.
The chip renders the notation string in monospace, with each segment
a sub-chip styled by edge kind:

- `@root` segments: bold, blue.
- `/petname` segments: bold, default text color.
- `:field` segments: gray, italic.
- `~peer:abcd` segments: gray, with a hover tooltip showing the full
  peer id and pet name (if any).
- `#type` suffix: small caps, muted.

Clicking the chip opens the per-target paths panel from
`daemon-retention-paths.md` (which subscribes via
`followRetentionPaths` and lists every path).

The notation string is the chip's `data-retention-path` attribute and
is what the user copies when the chip is selected.
Round-tripping through copy and paste is a stated goal.

## Phased implementation

### Phase 1: Notation renderer and bulk method

- Add `packages/daemon/src/retention-path-notation.js` exporting
  `renderRetentionPath(path) -> string` and `parseRetentionPath(string)
  -> RetentionPathShape | undefined`.
  The parser is included so the chat UI can validate hand-typed input
  in a future search-by-path feature; it is not required by the bulk
  method.
- Add `host.listRetentionPaths(targetIds)` and
  `host.describeRetentionPaths(targetIds)`.
- Unit tests: notation round-trip on representative paths
  (single-pet-name, multi-segment with field edges, with retention
  edge, with group `+N`, transient-only, root-only).
- Integration test: two-daemon setup; receiving host's
  `describeRetentionPaths` for a peer-shared target shows both the
  local pet-store path and the cross-peer retention path.

### Phase 2: CLI integration

- Wire `endo workers` to `describeRetentionPaths`.
- Add `endo paths <name-or-locator>` (defined in
  `daemon-retention-paths.md`) and have it print using the notation
  defined here.

### Phase 3: Chat tenant chip

- Tenant chip component reads `describeRetentionPaths` payload and
  renders per the styling above.
- Click expands to the per-target panel from
  `daemon-retention-paths.md`.

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
field edges, peer retention, or paths that pass through a non-pet-named
intermediary.
A worker held by the host's `:worker` field on a guest formula has no
pet-name path at all.
Rejected as insufficient; retained as the *substrate* for the
`/<name>` segments in the notation.

### Use a JSON shape inline

`{"root":"endo","segments":[{"type":"pet","name":"pins"},...]}` is
unambiguous and renderable, but is not type-able and reads poorly in a
single-line CLI row.
JSON is appropriate for `--json` output and is what the per-target
`listRetentionPaths` returns; inline rendering is the notation's job.
Rejected as a default for human-facing surfaces.

### Use a Unix-path-style notation throughout

`/endo/pins/shared-file` reads naturally to Unix users, but loses the
distinction between pet-name edges and field edges (both look like
`/`-segments).
A field name like `worker` would collide with a pet name `worker`
sharing the same store level.
Rejected; the `:` prefix on field segments is load-bearing.

## Open questions

- **Root-name dictionary scope.** This design lists `@endo` and
  `@known-peers-store` as root forms.
  `transientRoots` are also roots; should they render as
  `@transient` (proposed) or as `@transient-<formulaId-prefix>` for
  diagnosability?
  The current `endo workers` use case does not need to distinguish
  individual transient roots, but the inspector panel might.
- **Pet-name escaping.** Pet-name characters are restricted to a
  printable subset that excludes `/`, `:`, `~`, `#`, `@`, `\0`.
  No escaping is needed today.
  If the pet-name grammar is ever relaxed (e.g., to allow Unicode
  symbols), the notation may need a quoting form like
  `/"name with spaces"`.
  Out of scope for this iteration; flagged so the parser keeps room
  for it.
- **Group rendering for `+N` members.** The default is `name+1` for a
  two-member group.
  Is the count the right summary, or should the notation render the
  *kind* of merge (`+resolver`, `+handle`)?
  Resolvable when `endo workers` is the first consumer with real
  fixtures.
- **Path stability across formulations.** Pet names move; a tenant's
  best path may change between two `endo workers` invocations.
  Is this acceptable for a snapshot-shaped surface, or does the row
  format need a stable identifier (the locator) plus the notation as
  a derived display field?
  The proposed `--json` payload includes both `id` and the rendered
  notation; the CLI text form prints only the notation but is
  acknowledged to be snapshot-only.
- **Bulk rendering vs raw paths.** `describeRetentionPaths` is the
  proposed shared rendering point.
  An alternative is to return raw `RetentionPath[]` to all consumers
  and let each consumer render.
  The trade-off is shared canonicality versus consumer flexibility;
  the design picks shared canonicality but flagging the alternative
  for review.

## Affected packages

- `packages/daemon`: new `retention-path-notation.js`, two new host
  methods, exported types.
- `packages/cli`: `endo workers` calls `describeRetentionPaths`;
  `endo paths` (per `daemon-retention-paths.md`) prints using the new
  renderer.
- `packages/chat`: tenant chip component renders the notation.

## Test plan

- Unit: notation round-trip; best-path selection rules; bulk method
  positional preservation; transient-only and unreachable cases.
- Integration: two-daemon test asserting `describeRetentionPaths` for
  a peer-shared target lists both local and cross-peer paths in the
  expected order.
- CLI: smoke test `endo workers` renders notation strings; `--json`
  payload includes `retentionPaths`.
- Chat: tenant chip renders all four segment kinds; copy-paste yields
  the notation string verbatim.

## Prompt

> We desperately need a CLI and Chat UI notation system for
> unambiguously rendering retention paths and a fast system for
> collecting them. Please investigate the status quo and dispatch a
> designer to propose a design to close the gap, such that there's a
> host method available here for rendering the retention path for
> each worker tenant.
>
> (kriskowal, PR #151 inline review comment 3214462743, 2026-05-10)
