# Daemon Cross-Peer Garbage Collection

| | |
|---|---|
| **Created** | 2026-03-07 |
| **Updated** | 2026-04-29 |
| **Author** | Kris Kowal (prompted) |
| **Status** | **Complete** |
| **Code rev** | `5c83f4d8d9` (`llm` branch) |

## Status

The cross-peer GC gap described in this document is closed.
The shipped solution is a **streaming retention-set sync** behind every
remote handle, not the synchronized pet store / CRDT design originally
proposed in this document and prototyped in
[endo-but-for-bots#61](https://github.com/endojs/endo-but-for-bots/pull/61).

That PR has been superseded.
This revision documents what actually shipped.

### What shipped

- `packages/daemon/src/retention-accumulator.js` — pure batching primitive
  that consolidates `add(formulaNumber)` / `remove(formulaNumber)` events
  over a microtask window and yields `{ add: string[], remove: string[] }`
  deltas to subscribers.  The first delta is the snapshot
  (all adds, no removes); subsequent deltas are consolidated.
  Adds and removes within the same window cancel out so they never
  appear on the wire.
- `EndoGateway.followRetentionSet(peerNodeNumber)` —
  CapTP method on the local gateway that returns an async iterator of
  retention deltas, scoped to formulas issued by `peerNodeNumber`.
  Implementation:
  `packages/daemon/src/daemon.js:998` (`localGateway`).
- `formulaChangeTopic` — daemon-wide pub/sub fed from the formulator
  (`packages/daemon/src/daemon.js:2739` and
  `:2767`) and from the collector
  (`packages/daemon/src/daemon.js:645`).
  Each event names a formula number and the originating node.
- Outbound consumer — every daemon, on accepting an inbound peer
  (`localGreeter.hello`,
  `packages/daemon/src/daemon.js:1046`) and on dialing an outbound
  peer (`makePeer`,
  `packages/daemon/src/daemon.js:4316`),
  spawns a background task that calls `followRetentionSet` on the
  *remote* gateway.
  The task drains deltas for the lifetime of the connection.
- Persistence — SQLite table `retention(guest_public_key,
  retained_formula_number)` in
  `packages/daemon/src/daemon-database.js:87`.
  Operations: `writeRetention`, `deleteRetention`,
  `replaceRetention`, `listRetention`, `deleteAllRetention`
  (`packages/daemon/src/daemon-database.js:435-473`).
  The first delta is applied via `replaceRetention` (it is the full
  snapshot); subsequent deltas are applied by the per-entry write/delete
  primitives.
- Graph — `formulaGraph` carries a parallel in-memory map
  `retentionEdges: Map<agentId, Set<formulaId>>`
  (`packages/daemon/src/graph.js:69`) with `addRetention`,
  `removeRetention`, and `replaceRetention` operations
  (`packages/daemon/src/graph.js:662-710`).
  Retention edges participate in union-find groups, so the local
  collector treats remote-held formulas as live for the duration the
  remote peer holds them.
- Tests —
  `packages/daemon/test/retention-accumulator.test.js` (9 tests
  covering snapshot, empty snapshot, accumulation, cancellation in both
  orders, multi-flush, no-op flush, full cancellation across turns,
  snapshot-then-delta);
  `packages/daemon/test/invite-retention.test.js` (end-to-end peer
  invitation with retention-set propagation).

### Why the CRDT approach was abandoned

The CRDT-of-pet-stores design solved a *broader* problem than was
actually needed: a fully shared mutable namespace between two peers,
with offline progress on both sides and tombstone semantics that
survive partition.

The retention-set approach solves only the GC problem the design
section identified, and does so without:

- a new formula type,
- a new persistence layout,
- shared writability on the guest side,
- tombstone garbage collection,
- watermarks and acks on the wire,
- migration of the invitation/accept flow.

Each peer continues to own its own pet store.
The single new fact a daemon learns about its peer is the *set of
formula numbers from this peer that the peer is currently retaining
on our behalf* — i.e., the set of remote handles a peer has issued
to us that we still treat as live.
That set, kept in sync via consolidated deltas, is exactly what the
local collector needs to avoid prematurely collecting formulas we
have shared.

The capabilities the CRDT design promised but the retention-set
approach does not provide:

- **Bidirectional shared namespace.** The retention set is one-way:
  it tells us what *they* hold of *ours*.  There is no
  symmetric shared map of grants.
  Pet names and grants remain peer-local.
- **Offline progress on both sides.** Revocations from the host land
  immediately locally and propagate when the peer reconnects, exactly
  as in the CRDT design.  But the *guest side* (the holder) cannot
  unilaterally write into a shared structure while disconnected; the
  guest's pet store records the remote handle as a regular pet store
  entry.
- **Tombstone semantics with cross-peer convergence.** Not needed
  once the shared store is gone.

These were judged YAGNI for the GC requirement.
If a future feature genuinely requires a shared mutable namespace
between peers, the CRDT design in the version-history of this
document remains a viable starting point.

## What is the Problem Being Solved?

The Endo daemon's formula garbage collector only tracks **local**
formula dependencies.
When two daemons exchange handles through the invitation workflow,
each daemon writes a **remote** formula identifier into its own pet
store.
Because `graph.js`'s static dependency extraction filters by
`isLocalId`, those remote IDs create no edges in the local GC graph.
The remote handle is therefore invisible to the local collector:
the local daemon cannot keep its peer's formulas alive when the peer
still holds a reference to them, and it cannot learn that a remote
peer has dropped a handle.

This document describes how the implementation closes that gap.
Read § "What shipped" above for the structural summary; the rest of
this document explains the mechanism in detail.

## Design (as implemented)

### One-way retention set per peer

For each peer connection, each daemon maintains an authoritative set
of *its own* formula numbers that the peer is currently holding.
The peer is the *publisher* of this set.
The local daemon is the *subscriber*.

This inverts what an outsider might expect:
a daemon does not directly know which of its peer's formulas it holds
— it knows by introspecting its own graph.
What it doesn't know, and what the peer does, is which of *its own*
formulas the peer holds.
So the peer publishes the set, and the local daemon adapts its
collector to honor it.

The **agentId** for the peer (the local formula ID that incarnates
the peer's agent on this daemon) is the natural anchor for the
retention edges:
formulas that the peer keeps alive are reached transitively through
retention edges from the peer's local agent ID.

### Wire shape

A subscription returned by `EndoGateway.followRetentionSet(peerNodeNumber)`
is an async iterator of `RetentionDelta`:

```javascript
/**
 * @typedef {object} RetentionDelta
 * @property {string[]} add
 * @property {string[]} remove
 */
```

The first delta is the **snapshot** — every formula number for
`peerNodeNumber` that the publishing daemon currently has on disk,
in its `add` field, with an empty `remove` field.
Subsequent deltas are **incremental**: they describe net additions
and net removals since the last delta.

### Batching

A naive implementation would publish one delta per formula creation
or collection.
That's fine for correctness but produces a chatty stream — a
formulator that creates a handful of formulas in tight succession
(typical for `provideGuest`, which materializes a chain of dependent
formulas) would emit several deltas.

`makeRetentionAccumulator` consolidates events over a scheduling
window (a microtask by default; injectable for tests).

```javascript
const accumulator = makeRetentionAccumulator({ snapshot });
accumulator.add('formulaNumberA');
accumulator.remove('formulaNumberB');
accumulator.add('formulaNumberC');
// queueMicrotask flushes →
//   { add: ['formulaNumberA', 'formulaNumberC'], remove: ['formulaNumberB'] }
```

If a formula is added and then removed (or vice versa) within the
same window, the two events cancel and neither appears in the
emitted delta.
This is the property tested as "add then remove cancels out" and
"remove then add cancels out" in
`retention-accumulator.test.js`.

### Sources of `formulaChangeTopic` events

Two daemon paths feed the topic:

1. **Formulation.**
   `formulate` and `formulateLazy`
   (`daemon.js:2739`, `:2767`) publish
   `{ add: formulaNumber, node: nodeNumber }` *after* writing the
   formula JSON to disk and adding it to the in-memory graph.
   The node number is the *creator's* node number, not necessarily
   the local node.
2. **Collection.**
   The collector publishes `{ remove: formulaNumber, node: nodeNumber }`
   for each ID it sweeps
   (`daemon.js:645`).

`followRetentionSet(peerNodeNumber)` filters events to those whose
`node === peerNodeNumber`.

### Subscription lifecycle

When a CapTP session is established (either direction):

1. The receiving side calls `E(remoteGateway).followRetentionSet(localNodeNumber)`,
   asking the peer "tell me which of my formulas you are holding."
2. The peer's gateway snapshots its persistent retention set for the
   asking node via `persistencePowers.listFormulaNumbersByNode` and
   constructs an accumulator subscribed to the local
   `formulaChangeTopic`.
3. The first iterator value is the snapshot delta.
4. Subsequent iterator values are accumulated deltas.

On the subscriber side:

- The first delta is applied via `persistencePowers.replaceRetention`
  (snapshot semantics) and `formulaGraph.replaceRetention`.
- Subsequent deltas are applied per-entry via `writeRetention` /
  `deleteRetention` and `formulaGraph.addRetention` /
  `removeRetention`.
- Both updates happen under `withFormulaGraphLock` so the collector
  sees a consistent view.

The subscription runs for the lifetime of the CapTP connection.
On disconnect the subscription terminates; the persistent retention
set (the SQLite rows) remains on disk and is replaced on the next
connect by the snapshot from the peer.

### Persistence

The SQLite schema:

```sql
CREATE TABLE IF NOT EXISTS retention (
  guest_public_key TEXT NOT NULL,
  retained_formula_number TEXT NOT NULL,
  PRIMARY KEY (guest_public_key, retained_formula_number)
);
```

The `guest_public_key` column is the peer's identity — keyed by
public key rather than node number to be robust against
node-number rotations.
The `retained_formula_number` column is one of *our* formula
numbers that the peer holds.

The accompanying daemon API:

```javascript
writeRetention(guestPublicKey, formulaNumber);          // single add
deleteRetention(guestPublicKey, formulaNumber);          // single remove
listRetention(guestPublicKey);                           // snapshot read
replaceRetention(guestPublicKey, formulaNumbers);        // bulk replace
deleteAllRetention(guestPublicKey);                      // tear down
```

`replaceRetention` is the primitive used at session start to apply
the first delta atomically (within a transaction): all rows for the
peer are deleted, then the snapshot rows are inserted.

### Graph integration

`formulaGraph` carries a parallel in-memory structure
`retentionEdges: Map<agentId, Set<formulaId>>`.
These edges:

- participate in **union-find groups** alongside the formula's
  static dependencies, so retention pins entire dependency clusters
  rather than leaf formulas alone;
- are emitted as **labeled edges** with the label `'retention'` so
  the existing `getFormulaGraphSnapshot` / Chat formula inspector
  surfaces them visually;
- are gated behind the formula graph lock, so the collector cannot
  observe a half-applied delta.

The agent ID anchor is resolved from the peer's public key via
`persistencePowers.getAgentKey(remoteNodeId)`.
On a fresh connection, if the peer's agent has not yet been
incarnated locally (e.g., the very first peer interaction), the
delta is still persisted to disk; the graph edges are added on the
next delta after the agent is materialized.
This deferral is intentional: a daemon should not synthesize an
agent formula just because a peer announced retention.

### Crash and reconnect semantics

The retention table is the source of truth.
On daemon restart:

- The local SQLite retention rows survive.
- On the next connect, the peer sends a fresh snapshot.
- `replaceRetention` reconciles the local table to the peer's
  current view in one transaction.

This means the *peer* is authoritative for what it currently holds,
and an offline period of arbitrary length is reconciled correctly on
reconnect.
There is no need for vector clocks, watermarks, or acks — the
publisher just re-sends its current set.

If the peer's set has shrunk during the disconnection (the peer
collected some of our formulas while we were offline), the snapshot
informs us of that shrinkage and our collector can act on it.

If the local daemon collected a formula while the peer was offline
(unusual but possible if the peer's retention edge was the only
thing keeping it alive on disk — which it should not be, because
disconnected retention is preserved), the peer will request a
formula number we no longer have, and the existing CapTP error path
handles that as a stale reference.

### Revocation

Revocation is implicit: the peer drops its handle, the peer's
collector emits a `remove` for that formula's number, and the next
delta carries it.
On the local side, the retention row is deleted, the labeled edge
is removed, and the formula joins the next mark-and-sweep cycle of
the local collector.

The CRDT design's "tombstone bias on tie" rule has no analog here
because there is no concurrent write between peers — the retention
set is a one-way authoritative stream.
What is preserved is the property that *revocation cannot be
overridden by a concurrent grant*: there is no concurrent grant,
because the publisher of the retention set is also the only entity
that can issue handles for its own formulas.

## Comparison with the Original Design

| Aspect | CRDT design (rejected) | Retention-set sync (shipped) |
|---|---|---|
| New formula type | `synced-pet-store` | none |
| New on-disk format | per-store directory | one SQLite table |
| Direction | bidirectional | one-way per direction (each side subscribes to the other) |
| Wire payload | per-key Lamport-stamped LWW entry | flat list of formula numbers |
| Shared writability | yes (grantor adds, both delete) | no (each side owns its pet store) |
| Tombstones | yes, with watermark-gated GC | no (deletion is just "remove" in next delta) |
| Watermarks / acks | yes | no |
| Migration cost | rewires invitation/accept, pet-sitter, provideGuest | no migration (additive subscription) |
| Offline progress | grantor and grantee both | only the publisher (our collector still acts on local revocations) |
| Solves cross-peer GC | yes | yes |
| Solves shared namespace | yes | no, and we no longer need it |

## References

- `packages/daemon/src/retention-accumulator.js` —
  the pure batching primitive.
- `packages/daemon/src/daemon.js:998` —
  `EndoGateway.followRetentionSet` implementation.
- `packages/daemon/src/daemon.js:1046` —
  `localGreeter.hello` consumer (inbound peer).
- `packages/daemon/src/daemon.js:4316` —
  `makePeer` consumer (outbound peer).
- `packages/daemon/src/daemon.js:2739`, `:2767`, `:645` —
  `formulaChangeTopic` publishers.
- `packages/daemon/src/graph.js:69`, `:662-710` —
  `retentionEdges` and the `addRetention` / `removeRetention` /
  `replaceRetention` operations.
- `packages/daemon/src/daemon-database.js:87`,
  `:435-473` — SQLite retention table and CRUD.
- `packages/daemon/test/retention-accumulator.test.js` —
  unit tests for the accumulator.
- `packages/daemon/test/invite-retention.test.js` —
  end-to-end peer-invitation retention test.

## Prompt

> Please dispatch a subagent to propose a change that implements
> daemon-cross-peer-gc for our consideration. Generate a pull request
> and shepherd it through CI.

Then, after the proposal landed:

> Ah, on closer inspection, I believe that we satisfied the
> requirements for cross-peer retention but with a very different
> design than the one proposed for #61. Please inspect the daemon
> package, in particular its facility for syncing the retention set
> behind a remote handle. Please revise the design documents to
> reflect the implementation, noting that this replaces the CRDT
> approach, and mark that work as complete.
