# Retention Paths Inspector

| | |
|---|---|
| **Created** | 2026-04-30 |
| **Updated** | 2026-05-19 |
| **Author** | Kris Kowal (prompted) |
| **Status** | In Progress |

## Status

Phase 1 (host snapshot API + `endo paths` CLI) is forwarded under
the bot as
[PR #284](https://github.com/endojs/endo-but-for-bots/pull/284)
(open).
Not yet merged to `llm`; the public `listRetentionPaths` /
`followRetentionPaths` host methods are not exposed on
`packages/daemon/src/host.js` or `mail.js` as of 2026-05-19.
The underlying `listRetentionPaths(targetId)` function in
`packages/daemon/src/graph.js` is still private to the GC, matching
the pre-implementation status quo described below.
Verification per maintainer hint of "believe merged" turned up the
open PR rather than a merged change.

## What is the Problem Being Solved?

The daemon already computes retention paths in
`packages/daemon/src/graph.js:748` (`listRetentionPaths`),
but that function is private to the GC and is not exposed to the host,
the CLI, or the Chat UI.
Users cannot ask the question "why is this value still alive, and what
would I have to delete or cancel to release it?"
This is the missing observability for cross-peer GC
(`daemon-cross-peer-gc.md`), the workers panel
(`workers-panel.md`), and the formula inspector
(`formula-inspector.md`).

We want:

1. A daemon API on the **host** (not the guest) that returns every
   retention path to a target locator, in a notation that distinguishes
   pet-name edges in pet stores from internal formula-to-formula edges.
2. The same daemon API as a **subscription** so the Chat UI can react to
   formulations and collections without polling, with a release
   handshake matching `followNameChanges` / `followLocatorNameChanges`
   / `followMessages`.
3. A CLI verb (`endo paths <name-or-locator>`) that prints the paths in
   that distinguishing notation.
4. A button on every value in Chat that opens a panel of retained
   paths, with affordances to delete a pet name on a path and to
   disincarnate or reincarnate the target value.

This doc factors the work apart from the formula inspector and the
workers panel; the components below are intentionally reusable.

## Status of Overlapping Designs

This design **partially supersedes** two existing designs by extracting
a shared retention-path component out of each:

| Design | Overlap | Resolution |
|---|---|---|
| `formula-inspector` (Not Started) | Mentions "Provide a facility for revealing every retention path in the formula graph for identified formulas" as a one-line aside. | The retention-path facility moves here; `formula-inspector` remains responsible for *non-retention* metadata (formula type, fields, source, etc.). The two compose: the inspector panel in Chat embeds the paths panel below the formula fields. |
| `workers-panel` (Not Started) | Has a "Pet Name Retention Paths" subsection with a proposed `E(agent).retentionPath(petName)` API returning a flat array. | The workers panel keeps its event-loop-latency sparkline and tenant list, but imports the paths viewer from this design rather than defining its own. The flat-array API in `workers-panel.md` is replaced by the richer `RetentionPath[]` shape defined here. |

`daemon-cross-peer-gc` (Complete) supplies one of the *kinds* of edges
this design surfaces: `retention` edges from a peer's local agent ID
to formulas that peer is keeping alive.
This design does not change the cross-peer mechanism; it just renders
those edges.

## Design

### Notation: paths and segments

Reuse `graph.js:12`'s existing types,
exported here for consumers:

```typescript
type RetentionPathSegment = {
  /** Members of the same union-find group as the segment's anchor. */
  groupMembers: FormulaIdentifier[];
  /** The group representative on the *upstream* side of this edge.
   * Absent on the root segment. */
  referencedBy?: FormulaIdentifier;
  /** Edge labels from `referencedBy` into this group.
   * Distinguishes pet-name edges (`"pet:<name>"`) from internal links
   * (`"worker"`, `"handle"`, `"hub"`, `"powers"`, `"slot0"`, etc.) and
   * cross-peer retention edges (`"retention"`). */
  labels?: string[];
  /** Present on the topmost segment if the group is a GC root
   * (e.g. `endo`, `known-peers-store`). */
  type?: 'root';
};

type RetentionPath = RetentionPathSegment[];
```

The leaf segment is the target group; subsequent segments walk
*upstream* toward a root.
This matches `listRetentionPaths` already.

### Edge-label conventions

`graph.js` already records labels on `addLabeledEdge`.
The labels we expose:

| Label form | Meaning | Source |
|---|---|---|
| `pet:<name>` | The upstream's pet store contains the literal pet name `<name>` mapping to a formula in this group. | `onPetStoreWrite` paths |
| `<field>` (e.g. `worker`, `handle`, `petStore`, `hub`, `powers`, `slot0`, `bundle`, `agent`, `mailbox`, `mailHub`, `inspector`, `endo`, `networks`, `pins`) | A static formula-field reference. | `extractLabeledDeps` in `daemon.js:476` |
| `retention` | A cross-peer retention edge: the upstream agent's peer is holding this formula. | `formulaGraph.addRetention` |
| `transient` | A short-lived pin held by an in-flight host operation. | `transientRoots` |

The `pet:` prefix is the central point of the user's request: the CLI
and UI must distinguish *human-facing names* from *internal links*.
The prefix is unambiguous because pet names never start with `:`.

### Daemon surface (host-only)

Two new methods on `EndoHost` (and on the corresponding `Mail`
interface used by the host wrapper):

```typescript
interface EndoHost {
  /**
   * Snapshot every retention path from a GC root to the target.
   * Locator is in the same string form as `locate()`.
   */
  listRetentionPaths(
    locator: string,
  ): Promise<RetentionPath[]>;

  /**
   * Stream retention-path snapshots for the target.  The first delta
   * is the current snapshot; subsequent deltas are emitted whenever
   * the set of paths changes (formulation, collection, pet-store
   * write, pet-store remove, retention-edge add/remove, peer
   * connect/disconnect).
   *
   * The returned reference is a far reference to an
   * `AsyncIterableIterator<RetentionPathDelta>`.  Drop the reference
   * to release the subscription, exactly as with
   * `followNameChanges` / `followLocatorNameChanges`.
   */
  followRetentionPaths(
    locator: string,
  ): Promise<FarRef<AsyncIterableIterator<RetentionPathDelta>>>;
}

type RetentionPathDelta =
  | { snapshot: RetentionPath[] }
  | { added: RetentionPath[]; removed: RetentionPath[] };
```

The first delta is always a `snapshot`.
Subsequent deltas are diffs.
A diff over a path uses *path equality* (deep equal on the segments'
group representatives and labels) — not pointer identity.
If the target locator becomes invalid (the formula has been
collected), the iterator yields `{ snapshot: [] }` and ends.

#### Why host-only

Guests must not be able to enumerate paths through capabilities they
do not own.
A guest's `listRetentionPaths(myLocator)` would reveal the host's
internal naming, peer relationships, and which other guests share
common roots.
The methods are added to:

- `MailInterface` and the `Host` exo's surface
  (`packages/daemon/src/interfaces.js:101-176`)
- The `EndoHost` Far facet (`host.js:1014-1077`)

…and **not** to `EndoGuest` or to the gateway.
The CapTP `provide` boundary has no exposure to these methods.

#### Subscription release

Match `followLocatorNameChanges`'s pattern at
`host.js:1227`:
the host returns `makeIteratorRef(iterator)`, the consumer holds a
far reference, and dropping the reference (or letting the CapTP
session collect it) terminates the underlying generator.
Implementation of the producer uses `formulaChangeTopic` from
`daemon.js:445` plus a new
`petStoreChangeTopic` (or a re-use of the existing per-store change
topics — TBD in implementation; the spec is independent).

#### Daemon plumbing

`graph.js:748` already returns the snapshot.
What's missing:

1. A `formulaGraphChangeTopic` (or extension of `formulaChangeTopic`
   to carry edge-add / edge-remove events) that lets us know *when*
   to recompute.
2. A debouncing wrapper that recomputes paths once per microtask
   batch — analogous to `retention-accumulator.js`.
   A burst of formulations should produce a single delta.
3. Diffing the new snapshot against the last-emitted snapshot to
   produce `{ added, removed }` deltas.
   Path equality is structural over `[referencedBy, labels[],
   groupMembers[]]`.

### CLI: `endo paths`

```
endo paths <name-or-locator> [--locator] [--json]
```

- Without flags, accepts a pet name (or `petname/path`) and resolves
  it via the host's `identify` to a locator before calling
  `listRetentionPaths`.
- `--locator` interprets the argument as an already-encoded locator.
- Default output is human-readable, one path per block, segments
  newline-separated, with `pet:<name>` rendered as `<name>` in *bold*
  and field labels rendered as `→<field>` in italics.
  Each segment line shows the group's primary type (e.g. `pet-store`,
  `eval`, `handle`).
- `--json` emits the raw `RetentionPath[]` for scripting.

Example output (without `--json`):

```
$ endo paths shared-file
Path 1 (rooted at endo):
  endo (root)
    →pins
  pins (pet-store)
    "shared-file"
  shared-file (eval)

Path 2 (rooted at known-peers-store):
  known-peers-store (root)
    →peer
  bob (peer)
    retention
  shared-file (eval)
```

The first path is human-named (the user's own pin).
The second is a cross-peer retention edge from Bob's agent.
The user can see at a glance that *if I unpin "shared-file" but
disconnect from Bob, the value still survives via Bob's retention*.

### Chat UI

#### Reveal button on every value

Each rendered value (in inbox, inventory, transcript, value modal)
gains a "paths" affordance — a small chain-link icon next to the
existing value chip.
Clicking it opens the **Paths panel**.

#### Paths panel

A floating panel anchored to the value, listing every path with the
same notation as the CLI:

- Pet-name segments render as a clickable chip with the bold pet name
  and the parent store's label.
- Field-edge segments render as a small grey arrow `→<field>` between
  segment chips.
- The leaf segment (the target value) is highlighted.
- Above each path: a per-path **"Delete pet name on this path"**
  button, enabled only if the path contains at least one
  `pet:<name>` edge in a store the host can write.
  Clicking it shows a confirmation listing the names that would be
  removed (one per `pet:` edge along the path).
- Below the path list: a single **"Disincarnate"** / **"Reincarnate"**
  toggle for the target value itself (see below).

The panel subscribes via `followRetentionPaths(locator)` and updates
in place.
Closing the panel drops the far reference, releasing the
subscription.

#### Disincarnate / reincarnate

These are existing daemon affordances, surfaced in the panel:

- **Disincarnate**: equivalent to `cancelValue(targetId, reason)`
  (`daemon.js:2858`), which drops
  the in-memory exo and aborts ongoing work for that ID without
  removing the formula JSON.
  The next access reincarnates from disk.
  Useful for clearing a stuck eval or making a worker rehydrate its
  agent.
- **Reincarnate**: equivalent to `provide(targetId)` followed by
  re-attaching to any existing subscriptions.
  Surfaced as a button only when the target is currently in a
  not-incarnated state (the panel polls or watches an
  incarnation-state event for this).

Both operations are gated to the **host** facet — not exposed to
guests.
The panel's `Disincarnate` button is hidden if the targeted formula
is not host-owned (e.g., when the target is the host's own agent —
disincarnating that would lock the user out).

#### "Delete pet name" semantics

The existing `host.remove(...namePath)` removes a single pet name
from a single pet store.
The Chat UI's per-path delete button calls `host.remove(...)` once
per `pet:<name>` segment on the selected path, in path order from
root to leaf.
The subscription will emit a delta as soon as each removal is
visible to the GC graph; the panel shows the path crossing out and
disappearing reactively.

### Reactive update surface

The paths panel is the most demanding consumer because a single
formulation can shift many paths at once.
The shipping requirements:

- `followRetentionPaths(locator)` must coalesce updates in a
  microtask window so a `provideGuest` (which incarnates a chain of
  ~7 dependent formulas) yields *one* delta, not seven.
  Use the same accumulator pattern as
  `retention-accumulator.js`.
- The first delta must arrive promptly even if there are no changes
  yet (it's the snapshot).
- The producer holds no strong reference to the consumer; dropping
  the far reference lets the iterator generator return on the next
  poll.

### Security

| Concern | Mitigation |
|---|---|
| Guests learning host structure | Methods are on host/mail interfaces only; not in CapTP-exposed gateway. |
| Cross-peer revelation | Retention edges from peers expose the peer's *agent ID*, which is already a host-known fact (it's in `known-peers-store`). The peer's *pet names* are never exposed — only the local node's edges, of which the peer's edge is one. |
| Disincarnating critical formulas | The UI suppresses the button for `endo`, `host-agent`, the user's own agent, and any other formula on a deny-list maintained by the host. |
| Pet-name removal cascades | Confirmation modal lists every name on the path before commit. |

## Affected Packages

- `packages/daemon` — new methods on `EndoHost` / `Mail`, new
  topic for graph-edge events, microtask-coalesced wrapper for
  `listRetentionPaths`, export of `RetentionPath` types.
- `packages/cli` — new `endo paths` command.
- `packages/chat` — paths affordance + paths panel; integrates with
  the existing inventory-component, inbox-component, value-modal,
  and (eventually) the formula-inspector panel.

## Test Plan

- **Daemon unit:** `listRetentionPaths` already has coverage; add
  cases for the `pet:<name>` label normalization and for paths
  containing `retention` edges (cross-peer).
- **Daemon integration:** Two-daemon test that establishes a peer,
  exchanges a value, and asserts that `listRetentionPaths` from the
  receiving host's perspective shows both the local pet-store path
  and the remote-peer-retention path.
- **Subscription:** Subscribe, formulate a chain, observe one
  coalesced delta; release the subscription and assert the producer
  generator returns.
- **CLI:** Smoke test of `endo paths` against a fixture daemon.
- **Chat:** Existing chat-test-coverage fixtures; add
  panel-open/close, delete-pet-name, disincarnate/reincarnate.

## Phased Implementation

### Phase 1: Daemon snapshot API

- Export `RetentionPath` / `RetentionPathSegment` types from
  `@endo/daemon`.
- Add `EndoHost.listRetentionPaths(locator)` plumbing through
  `graph.js`.
- Normalize labels: pet-store edges emit `pet:<name>`, others stay
  as field names.
- Unit + two-daemon integration test.

### Phase 2: Subscription API

- Add `formulaGraphChangeTopic` (or extend the existing
  `formulaChangeTopic` to carry edge events).
- Implement `followRetentionPaths(locator)` with microtask
  coalescing.
- Subscription-release test.

### Phase 3: CLI

- `endo paths <name-or-locator>` command with default + `--json`
  rendering.

### Phase 4: Chat panel — read-only

- Paths affordance on values.
- Panel that subscribes and renders paths reactively.

### Phase 5: Chat panel — write affordances

- "Delete pet name on this path" with confirmation.
- "Disincarnate" / "Reincarnate" toggle on the target.

### Phase 6: Inspector + workers-panel integration

- The formula-inspector panel embeds the paths viewer.
- The workers-panel "Pet Name Retention Paths" subsection imports
  the same component.

## Dependencies

| Design | Relationship |
|---|---|
| `daemon-cross-peer-gc` (Complete) | Supplies the `retention` edge kind that this surface renders. |
| `formula-inspector` (Not Started) | Embeds the paths panel; remains responsible for non-retention metadata. |
| `workers-panel` (Not Started) | Imports the paths panel; flat-array API replaced by `RetentionPath[]`. |
| `chat-components` (Complete) | Paths panel is a new chat-components-style component. |

## Design Decisions

1. **Host-only, not guest.** Surface elevation. A guest knowing how
   the host names things is a leak.
2. **`pet:<name>` label prefix instead of a separate field.**
   Keeps `RetentionPathSegment` flat; the prefix is unambiguous and
   trivially parsed by both CLI and UI.
3. **Subscription-release via dropped far reference**, matching
   existing `follow*` methods.
   Avoids an explicit `unsubscribe` method.
4. **Microtask-coalesced deltas**, mirroring
   `retention-accumulator`.
   A `provideGuest` should produce *one* delta.
5. **Disincarnate/reincarnate are existing daemon operations**,
   merely surfaced in the UI.
   We are not introducing a new lifecycle verb.
6. **Locator (not pet-name) as the API key.**
   Pet names are ambiguous (the same name can live in multiple
   stores); locators are unique.
   The CLI accepts both for ergonomic reasons but resolves the
   pet name to a locator before calling the daemon.

## Known Gaps and TODOs

- [ ] Decide whether `formulaChangeTopic` should be extended to
      carry edge events, or a sibling `formulaGraphChangeTopic`
      should be added.
- [ ] Confirm that path equality over group members is the right
      stable-key for diffing — or whether we should hash the
      labeled path.
- [ ] Decide how to render labels for `union` group composition
      (groupMembers > 1) in the CLI and UI.
- [ ] Spec the deny-list for disincarnation; possibly encode as
      `disincarnationPolicy` on the host with sensible defaults.
- [ ] Integration test for the case where a pet name removal
      produces a cycle break (group composition changes).

## Prompt

> Please propose a new design doc in designs/*.md. I would like
> daemon hosts, not guests, to be able to list the retention paths
> for a particular locator. The list should include every path,
> including petnames in petstores and internal links to formulas.
> The CLI should have a command for listing these paths in a
> notation that distinguishes petnames from formula links. The Chat
> web UI should provide a button on each value that reveals the
> list of all retained values, and affordances for deleting petnames
> along those paths, and a button for disincarnating or
> reincarnating any particular value. The list should update
> reactively, implying a followRetainedPathsList method to
> subscribe to a string (and release that subscription from the
> consumer side, as with other follow methods).
>
> These proposed changes may overlap an existing design. Consider
> factoring those designs into constituent components.
