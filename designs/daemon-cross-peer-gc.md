# Daemon Cross-Peer Garbage Collection

| | |
|---|---|
| **Created** | 2026-03-07 |
| **Updated** | 2026-03-07 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |
| **Code rev** | `543c2829f` (`llm` branch) |

## What is the Problem Being Solved?

The Endo daemon's formula garbage collector only tracks **local** formula
dependencies.  When two daemons exchange handles through the invitation
workflow, each daemon writes a **remote** formula identifier into its own pet
store.  Because `graph.js` filters dependencies with
`extractDeps(formula).filter(isLocalId)` (line 116), those remote IDs create
no edges in the local GC graph.  The remote handle is therefore invisible to
the collector: it cannot keep remote formulas alive, and it cannot learn that a
remote peer has revoked a capability.

The invitation and acceptance flow creates a relationship between two peers
(host and guest) but does not model that relationship as a durable, shared
data structure.  Each side independently writes a single remote handle ID into
its own pet store.  There is no synchronization, no revocation propagation,
and no way for either side to make progress (grant or revoke capabilities)
while the other peer is offline.

This design proposes a **synchronized pet store** backed by a CRDT that
closes the cross-peer GC gap, enables revocation propagation, and allows
offline progress.

## Current Invitation and Acceptance Workflow

### Invitation Creation (Host Side)

When Alice (the host) calls `invite(guestName)`:

1. `host.js:624-646` -- `invite()` creates a `DeferredTasks` that will write
   the invitation formula ID into Alice's pet store under `guestName`.
2. `daemon.js:2356-2386` -- `formulateInvitation()` generates a random formula
   number, executes the deferred task (persisting the invitation ID under
   `guestName` in Alice's pet store), and calls `formulate()` to persist and
   incarnate the invitation.
3. The `InvitationFormula` (types.d.ts:138-143) records:
   - `hostAgent` -- Alice's host agent formula ID
   - `hostHandle` -- Alice's handle formula ID
   - `guestName` -- the pet name Alice chose
4. `daemon.js:3366-3427` -- `makeInvitation()` incarnates the formula into an
   `Invitation` exo with two methods:
   - `locate()` -- returns a shareable `endo://` URL encoding Alice's node
     number, the invitation formula number, Alice's handle number, and her
     network addresses.
   - `accept(guestHandleLocator)` -- called remotely by the accepting peer.

### Acceptance (Guest Side)

When Bob (the guest) calls `accept(invitationLocator, guestName)`:

1. `host.js:652-702` -- Bob's host parses the invitation URL, extracting
   Alice's node number, invitation number, handle number, and addresses.
2. Bob calls `addPeerInfo()` to register Alice as a known peer (line 677).
3. Bob constructs Alice's handle as a remote formula ID:
   `guestHandleId = formatId({ number: remoteHandleNumber, node: nodeNumber })`
   (line 679-682).
4. Bob constructs a locator for his own handle and calls
   `E(invitation).accept(handleLocator)` over CapTP (line 699-700).
5. Bob writes `guestHandleId` (a **remote** ID pointing to Alice's handle)
   into his own pet store under `guestName` (line 701).

### Acceptance (Host Side, via Remote `accept()` Call)

When Alice's invitation receives Bob's `accept()`:

1. `daemon.js:3386-3424` -- The invitation parses Bob's handle locator to
   extract his node number, handle number, and addresses.
2. Alice registers Bob as a known peer via `addPeerInfo()` (line 3408).
3. Alice cancels the invitation's context so it cannot be redeemed again
   (line 3414-3416).  There is a TODO on line 3410-3412 noting uncertainty
   about whether this cancellation is sufficient.
4. Alice writes Bob's handle as a remote formula ID into her pet store under
   `guestName` (line 3418-3421).

## Formula Retention Graph After Acceptance

The following diagram shows the formulas that exist on each daemon after a
successful invitation acceptance.  Edges are annotated as **strong** (tracked
by the local GC graph, prevents collection) or **weak** (not tracked, ignored
by the collector).

```
ALICE'S DAEMON (Host)                        BOB'S DAEMON (Guest)
================================             ================================

  [endo] <-- permanent root                   [endo] <-- permanent root
    |                                            |
    v strong                                     v strong
  [host-agent A]                               [host-agent B]
    |                                            |
    |-> [handle A]         <-- union group       |-> [handle B]     <-- union
    |-> [keypair A]        <-- strong            |-> [keypair B]    <-- strong
    |-> [pet-store A]      <-- strong            |-> [pet-store B]  <-- strong
    |      |                                     |      |
    |      |  "bob"                              |      |  "alice"
    |      |    |                                |      |    |
    |      |    v                                |      |    v
    |      |  [handle B                          |      |  [handle A
    |      |   @bob-node:bob-number]             |      |   @alice-node:alice-number]
    |      |       |                             |      |       |
    |      |       |  WEAK -- remote ID,         |      |       |  WEAK -- remote ID,
    |      |       |  filtered by isLocalId      |      |       |  filtered by isLocalId
    |      |       v                             |      |       v
    |      |   (no local formula)                |      |   (no local formula)
    |      |                                     |      |
    |-> [mailbox-store A]  <-- strong            |-> [mailbox-store B]
    |-> [mail-hub A]       <-- strong            |-> [mail-hub B]
    |-> [worker A]         <-- strong            |-> [worker B]
    '-> [inspector A]      <-- strong            '-> [inspector B]

  [known-peers-store] <-- permanent root       [known-peers-store] <-- perm root
    |                                            |
    |  "bob-node-number"                         |  "alice-node-number"
    v                                            v
  [peer B]              <-- strong             [peer A]              <-- strong
    '-> [networks-dir]                           '-> [networks-dir]
```

### Key Observations

1. **Pet store entries for remote handles are weak references.**  Alice's
   `pet-store A` contains the name `"bob"` pointing to
   `handle-B@bob-node:bob-number`.  This ID is remote, so `graph.js:116`
   filters it out.  The pet store edge (`onPetStoreWrite`) is recorded, but
   during collection (`daemon.js:650-659`) the remote ID is not in `localIds`
   and the edge is silently skipped (line 654: `if (localIds.has(id))`).

2. **Remote handles create no local formula.**  There is no local formula
   file for `handle-B@bob-node:bob-number` on Alice's daemon.  When Alice
   accesses it, `evaluateFormulaForId` (daemon.js:2200-2208) detects the
   remote node, looks up the peer, and delegates via `E(peer).provide(id)`.

3. **The peer formula is the only local anchor.**  The `[peer B]` formula in
   Alice's known-peers-store is a permanent root (the known-peers-store itself
   is a root).  The peer keeps the CapTP connection alive, but it has no
   structural relationship to the pet name `"bob"` in Alice's pet store.

4. **No revocation propagation.**  If Alice removes `"bob"` from her pet
   store, this has no effect on Bob's daemon.  Bob still holds `"alice"` in
   his pet store.  Conversely, if Bob removes `"alice"`, Alice is unaware.
   Neither daemon can distinguish between "the peer revoked my access" and
   "the peer is simply offline."

## The Design Gap

### No Shared Notion of Guest/Host Pet Store

When Alice invites Bob, the intent is to create a relationship where:
- Alice can grant capabilities to Bob by writing names into a shared space.
- Alice can revoke capabilities by removing names.
- Bob can see what Alice has granted and can manage his own aliases.
- Either party can terminate the relationship.

The current implementation does not model this.  Each daemon writes a single
remote handle ID into its own local pet store.  There is no shared pet store
or synchronization protocol.  The guest's pet store and the host's pet store
are entirely independent local data structures.

### Revocation is Unilateral and Invisible

Alice can remove `"bob"` from her pet store.  This removes the local name
but does not:
- Notify Bob that his access has been revoked.
- Prevent Bob from continuing to use capabilities he already holds (formula
  IDs he has written into his own pet store).
- Cause any formula collection on Bob's daemon.

Similarly, Bob can remove `"alice"` from his pet store without Alice knowing.

### Garbage Collection Cannot Cross Peer Boundaries

The collector operates strictly within one daemon.  It cannot:
- Determine whether a remote peer still holds a reference to a local formula.
- Signal to a remote peer that a local formula has been collected.
- Use a remote peer's liveness as a condition for local retention.

The `residenceTracker` (residence.js) tracks which CapTP connections export
which formulas, and disconnects connections that hold collected formulas
(daemon.js:750).  But this is reactive, not preventive -- it severs
connections after local collection, rather than coordinating collection
across peers.

### Progress Without Active Sessions

A host must be able to revoke a guest's capabilities even when the guest is
offline.  A guest must be able to observe revocation when it reconnects.
The current design cannot express this because there is no persistent shared
state between peers.

## Design

### Synchronized Pet Store via CRDT

Introduce a new formula type, `synced-pet-store`, that represents one half of
an **entangled pair** of pet stores shared between two peers.  Each peer holds
a local replica.  The replicas synchronize whenever a CapTP session is active
between the peers, and may diverge when disconnected.  A CRDT merge function
guarantees convergence without conflict.

```
ALICE'S DAEMON                               BOB'S DAEMON
================================             ================================

  [host-agent A]                               [host-agent B]
    |                                            |
    |-> [synced-pet-store A->B] <-- strong       |-> [synced-pet-store B<-A] <-- strong
    |      |  local replica                      |      |  local replica
    |      |  (Alice is GRANTOR)                 |      |  (Bob is GRANTEE)
    |      |                                     |      |
    |      |<------ sync over CapTP ------>      |      |
    |      |                                     |      |
```

Each `synced-pet-store` has a **role**: `grantor` (the host who grants
capabilities) or `grantee` (the guest who receives them).  The role
determines write permissions and the semantics of conflict resolution.

### CRDT Data Model

The synchronized pet store is a **map CRDT** from pet name (string key) to a
value that is either a formula locator or a tombstone.  Each entry carries a
Lamport timestamp and the node ID of the writer.

```typescript
type SyncedEntry = {
  /** The formula locator, or null if deleted/revoked. */
  locator: string | null;
  /** Lamport timestamp: incremented on every local write. */
  timestamp: number;
  /** Node number of the peer that wrote this entry. */
  writer: NodeNumber;
};

type SyncedPetStoreState = Map<PetName, SyncedEntry>;
```

#### Merge Rules

For each key present in either replica:

1. **Higher timestamp wins.**  If one entry has a strictly higher timestamp
   than the other, it is the winner.

2. **Tombstone bias on tie.**  If both entries have the same timestamp, the
   one with `locator: null` (deletion/revocation) wins.  This ensures that
   revocation is respected even under concurrent writes.

3. **Node-ID tiebreaker.**  If both entries have the same timestamp and the
   same null/non-null status, the entry from the lexicographically greater
   node ID wins.  This is an arbitrary but deterministic tiebreaker for the
   rare case of simultaneous non-conflicting writes.

These rules make the merge function:
- **Commutative**: `merge(A, B) = merge(B, A)`
- **Associative**: `merge(merge(A, B), C) = merge(A, merge(B, C))`
- **Idempotent**: `merge(A, A) = A`

This is a **Last-Writer-Wins Register** (LWW-Register) per key, composed
into a map, with a tombstone bias -- a well-known CRDT construction
(Shapiro et al., "A Comprehensive Study of Convergent and Commutative
Replicated Data Types," INRIA RR-7506, 2011, Section 3.2.2).

#### Why Tombstone Bias

In the Endo capability model, **deletion is revocation**.  If Alice deletes a
name from the synced store, she is revoking Bob's access to that capability.
If Bob concurrently writes the same name (perhaps renaming something), Alice's
revocation must still take effect.  Tombstone bias guarantees this: a delete
at timestamp T beats a write at timestamp T.

This is a deliberate policy choice that prioritizes security (revocation
cannot be overridden by a concurrent grant) over availability.

### Roles and Write Permissions

| Operation | Grantor (Host) | Grantee (Guest) |
|---|---|---|
| Write a new name | Yes | No |
| Delete a name (revoke) | Yes | Yes |
| Rename (move) | Grantor-side only | Grantee-side alias only |
| Read / list / lookup | Yes | Yes |

- **Only the grantor can introduce new capabilities** into the synced store.
  The grantee can see them and use them, but cannot add new names.  This
  preserves the principle of least authority: the host controls what the guest
  can access.

- **Either party can delete.**  The grantor deletes to revoke.  The grantee
  deletes to disclaim (voluntarily give up a capability).  Both are permanent
  -- a deleted entry becomes a tombstone that survives reconnection.

- The grantee may maintain a **local alias map** (a regular `pet-store`
  overlaid via `makePetSitter`) that maps grantee-chosen names to entries in
  the synced store.  This lets the guest use its own naming conventions
  without modifying the shared state.

### Synchronization Protocol

When a CapTP session is established between two peers that share a
`synced-pet-store` pair:

1. **Initial sync.**  Each side sends its full `SyncedPetStoreState` (or a
   digest/delta if an optimization is implemented later).
2. **Merge.**  Each side merges the received state with its local state using
   the merge function.  Both replicas converge to the same result.
3. **Ongoing sync.**  While the session is active, each local write is
   immediately sent to the peer as a delta (a single `SyncedEntry`).  The
   peer merges it on receipt.
4. **Disconnection.**  When the session ends, each side continues operating
   on its local replica.  Writes accumulate locally and are reconciled on the
   next session.

### Formula Type

```typescript
type SyncedPetStoreFormula = {
  type: 'synced-pet-store';
  /** The peer this store is shared with. */
  peer: FormulaIdentifier;       // local peer formula ID
  /** Role of this replica. */
  role: 'grantor' | 'grantee';
  /** The formula number of the paired store on the remote peer. */
  remoteStoreNumber: FormulaNumber;
  /** Underlying local storage (a pet-store formula for persistence). */
  store: FormulaIdentifier;
};
```

The `synced-pet-store` depends on `peer` and `store`, both local IDs, so the
GC graph tracks them as strong edges.

### Retention Semantics

#### Local Root (Strong)

Each `synced-pet-store` is referenced by the local agent (host or guest) that
participates in the relationship.  This is a strong local reference:

- Alice's `host-agent` formula includes `syncedStores: [synced-pet-store-A->B]`
  in its dependency list, or the synced store ID is written into Alice's own
  (non-synced) pet store.
- Bob's `host-agent` formula similarly holds a strong reference to
  `synced-pet-store-B<-A`.

As long as the agent is alive, the synced store is alive, and every formula
named in the synced store is alive (via pet store edges in the GC graph).

#### Remote Root (Weak, with Convergent State)

The remote peer's replica is **not** a GC root on the local daemon.  But the
CRDT state encodes the remote peer's intent:

- If the remote peer deletes a name, the tombstone propagates on the next
  sync and the local replica removes the name.  This removes the pet store
  edge, potentially making the formula collectible locally.
- If the local daemon deletes a name, the tombstone propagates to the remote
  peer on the next sync.

This means revocation **does not require an active session** -- it takes
effect locally immediately and propagates to the peer eventually.

#### Revoking the Entire Relationship

To revoke a guest entirely, the host:

1. Deletes all names in the synced store (each becomes a tombstone).
2. Removes the synced store ID from its own agent's references.
3. The synced store, now unreferenced, is collected by the local GC.
4. On the next sync attempt, the peer discovers the store is gone (the peer
   formula may be cancelled, or the CapTP session fails to negotiate the
   store).  The grantee's replica can then be marked as defunct and collected.

### Revised Invitation Flow

#### Invitation Creation

Same as current: Alice creates an `InvitationFormula` and writes it to her
pet store under `guestName`.

#### Acceptance

1. Bob calls `E(invitation).accept(handleLocator)` as today.
2. **New:** Alice's `accept()` handler creates a `synced-pet-store` pair:
   - Formulates `synced-pet-store` with `role: 'grantor'` locally.
   - Returns the formula number of Alice's synced store to Bob (as part of
     the acceptance response).
3. **New:** Bob's `accept()` handler formulates a `synced-pet-store` with
   `role: 'grantee'` and `remoteStoreNumber` pointing to Alice's store.
4. Alice writes Bob's handle into the **synced** store (not her regular pet
   store).
5. Bob writes Alice's handle into the **synced** store (or into his local
   alias overlay).

#### Revised Retention Graph

```
ALICE'S DAEMON                               BOB'S DAEMON
================================             ================================

  [endo] <-- permanent root                   [endo] <-- permanent root
    |                                            |
    v strong                                     v strong
  [host-agent A]                               [host-agent B]
    |                                            |
    |-> [synced-pet-store A->B]  <-- strong      |-> [synced-pet-store B<-A]  <-- strong
    |      |                                     |      |
    |      |  (CRDT replica, role=grantor)       |      |  (CRDT replica, role=grantee)
    |      |                                     |      |
    |      |  "bob" -> handle-B locator          |      |  "bob" -> handle-B locator
    |      |  "shared-file" -> eval-X locator    |      |  "shared-file" -> eval-X locator
    |      |                                     |      |
    |      |<--- sync deltas over CapTP --->     |      |
    |      |                                     |      |
    |      |  pet-store edges (strong, local):   |      |  pet-store edges (strong, local):
    |      |  ->[local-eval-X] if locator is     |      |  ->[peer-A] (to resolve remote
    |      |    local; otherwise via peer         |      |     locators via E(peer).provide)
    |      |                                     |      |
    |-> [pet-store A] (Alice's own names)        |-> [pet-store B] (Bob's own names)
    |      |                                     |      |
    |      |  "bob-channel" -> synced-store A->B |      |  "alice-channel" -> synced-store B<-A
    |      |  (strong local ref to synced store) |      |  (strong local ref to synced store)
    |      |                                     |      |
    |-> [handle A]                               |-> [handle B]
    |-> [keypair A]                              |-> [keypair B]
    ...                                          ...

  [known-peers-store] <-- permanent root       [known-peers-store] <-- perm root
    |                                            |
    v                                            v
  [peer B] <-- strong                          [peer A] <-- strong
```

### Resolving Locators in the Synced Store

The synced store holds **locators** (strings) rather than raw formula IDs.
A locator encodes the node number, formula number, and formula type (see
`locator.js:10-35`).  When the local daemon needs to resolve a locator from
the synced store:

- If the locator's node is local, it resolves to a local formula via
  `provide()`.
- If the locator's node is remote, it resolves via the peer formula, exactly
  as `evaluateFormulaForId` does today (daemon.js:2200-2208).

Storing locators rather than raw formula IDs has two advantages:
1. The CRDT merge operates on self-describing values that both peers can
   interpret independently.
2. The type hint in the locator allows the local daemon to validate the
   formula before providing it.

## Tombstone Garbage Collection

### Stable Sync Watermark

Tombstones must be retained until both replicas have observed them.  Without
this guarantee, a stale replica that has not yet seen a deletion could
re-introduce the deleted name on the next sync, effectively reversing a
revocation.  Once both sides have acknowledged a tombstone, it is safe to
prune.

Each replica maintains a **local clock** (the Lamport timestamp from the CRDT
data model, incremented on every local write) and a **remote acknowledged
clock** -- the highest local clock value that the remote peer has confirmed
it has observed.

```typescript
type SyncedPetStoreMetadata = {
  /** This replica's Lamport clock (monotonically increasing). */
  localClock: number;
  /** The highest localClock value the remote peer has acknowledged. */
  remoteAckedClock: number;
};
```

During a sync session:

1. **On connect**, each side sends its full state (or delta) along with its
   current `localClock`.
2. **On receipt**, each side merges the incoming state, then sends back an
   **ack** message containing the sender's `localClock` value from step 1.
3. **On ack receipt**, the sender updates `remoteAckedClock` to the acked
   value.

After this exchange, each side knows: "the remote peer has seen every entry
I wrote at or before timestamp `remoteAckedClock`."

During ongoing sync (while the session is active), each delta message carries
the writer's current `localClock`, and the receiver immediately acks it.
This keeps `remoteAckedClock` close to real-time.

### Pruning Condition

A tombstone for key K with timestamp T is **safe to prune** when:

> `T <= remoteAckedClock`

This is because a tombstone at timestamp T can only exist locally if the
local replica has already merged it (either the local node wrote it, or it
arrived in a sync and was merged).  The only remaining question is whether
the *remote* side has seen it, which `remoteAckedClock >= T` answers.

### Pruning Procedure

Tombstone pruning runs as a local maintenance step after each successful
sync round-trip (i.e., after receiving an ack).  It does not require any
additional network messages.

```
function pruneTombstones(state, remoteAckedClock):
    for each (key, entry) in state:
        if entry.locator === null              // is a tombstone
           && entry.timestamp <= remoteAckedClock:
            state.delete(key)
            // Remove the tombstone file from disk
            persistence.deleteSyncedEntry(key)
```

### Safety Argument

**Claim:** A pruned tombstone cannot cause a deleted name to reappear.

**Proof sketch:**

- A tombstone for key K at timestamp T is only pruned when
  `remoteAckedClock >= T`.
- This means the remote replica has merged all entries up to and including
  timestamp T, so it holds the tombstone (or a later entry) for K.
- For the deleted name to reappear, a subsequent sync would need to deliver
  an entry for K with `locator !== null` and a timestamp greater than T.
- Only the grantor can write new (non-tombstone) entries.  A new write at
  timestamp T' > T is a deliberate re-grant -- a new capability introduction,
  not a resurrection of the old one.  This is correct behavior.
- A stale replica cannot produce such an entry because its clock is behind
  the current clock, and the merge rule requires a strictly higher timestamp
  to override a tombstone.
- Therefore, pruning a tombstone after mutual acknowledgment cannot cause an
  unintended name resurrection.

### Interaction with Relationship Termination

When the host revokes the entire relationship, all entries become tombstones
and the synced store is eventually collected.  Tombstone pruning is moot in
this case -- the entire store (including its disk directory) is deleted by the
formula collector.

If the relationship is not terminated but many names are revoked over time,
tombstone pruning keeps the store compact.  In the worst case (peer is
permanently offline), tombstones accumulate indefinitely, but the practical
bound is the total number of names ever written, which is small for a
single peer relationship.

### Persistence of Watermarks

`localClock` and `remoteAckedClock` are persisted alongside the synced store
state (in a metadata file within the store's disk directory).  On daemon
restart, the replica resumes from its persisted clocks.  Since the remote
peer's ack is durable on the local side, tombstone pruning decisions survive
restarts -- no tombstone is pruned until the local daemon has persisted the
`remoteAckedClock` that justifies it.

## Implementation Considerations

### Persistence Format

#### Directory Layout

Each `synced-pet-store` is backed by a directory on disk, laid out
analogously to the current `pet-store` (one directory per store, one file
per entry).  The directory lives under the daemon's state path, sharded by
the first two hex characters of the formula number:

```
state/
  synced-pet-store/
    ab/
      cdef0123…/            ← one synced store instance
        names/               ← pet name entries (one file per name)
          alice.json
          shared-file.json
        clock.json           ← sync watermark metadata
```

This mirrors the `pet-store` layout in `pet-store.js:17-24` where the
directory path is `{statePath}/{formulaType}/{prefix}/{suffix}`.  The
`names/` subdirectory isolates pet name files from store metadata,
so that `clock.json` (and any future metadata files) can be named
plainly without risk of collision as the pet name grammar evolves.

#### Entry File Format

Each entry file contains a single JSON object with the `SyncedEntry`
fields:

```json
{
  "locator": "endo://abc123…/handle:def456…",
  "timestamp": 7,
  "writer": "abc123…"
}
```

A tombstone has `locator: null`:

```json
{
  "locator": null,
  "timestamp": 9,
  "writer": "abc123…"
}
```

The file name is the pet name (matching the `pet-store` convention where
each pet name is a file in the directory).  The `.json` extension
distinguishes synced entries from plain pet store entries (which are
bare text files) and allows the metadata file to coexist in the same
directory without ambiguity.

#### Metadata File

The `clock.json` file (in the store root, alongside but outside the
`names/` subdirectory) stores the sync watermark clocks:

```json
{
  "localClock": 9,
  "remoteAckedClock": 5
}
```

Because `clock.json` lives in the store root and entry files live under
`names/`, there is no namespace collision regardless of how the pet name
grammar evolves.

#### Atomic Writes

The current `pet-store` writes entries with `fs.promises.writeFile`, which
is **not** atomic -- a crash mid-write can leave a truncated or empty file.
The content store (`daemon-node-powers.js:400-423`) already demonstrates the
correct pattern: write to a temporary file, then `fs.promises.rename` to
the final path.  POSIX `rename(2)` is atomic with respect to crash: after
the call returns, the new file is durable; if the process is killed before
`rename` completes, the old file (or no file) remains at the target path.

The synced pet store **must** use write-then-rename for all entry and
metadata writes:

```
async function atomicWriteJSON(filePowers, targetDir, fileName, value):
    temporaryPath = filePowers.joinPath(targetDir, `.tmp.${randomHex()}`)
    finalPath = filePowers.joinPath(targetDir, fileName)
    await filePowers.writeFileText(temporaryPath, JSON.stringify(value) + '\n')
    await filePowers.renamePath(temporaryPath, finalPath)
```

Entry writes pass the `names/` subdirectory as `targetDir`; metadata
writes pass the store root.  On startup, any `.tmp.*` files in either
directory are stale incomplete writes and are deleted unconditionally.

#### Recovery After Crash

Because each entry is independently atomic, the store is always in a
consistent state after a crash:

- **Crash during entry write:** The temporary file exists but the rename
  has not completed.  The old entry (or no entry) is at the final path.
  On startup, the stale temporary is cleaned up.  The entry retains its
  pre-crash value, which is correct -- the write simply did not happen.

- **Crash during metadata write:** Same reasoning.  The clocks revert to
  their pre-crash values.  This may cause the replica to re-send entries
  the peer has already seen (because `remoteAckedClock` is behind), but
  the CRDT merge is idempotent, so re-sending is harmless.

- **Crash between entry write and metadata write:** The entry is durable
  but `localClock` has not advanced.  On reconnect, the entry will be
  sent again (idempotent).  The clock will advance on the next local
  write.

There is no window where a crash can produce an inconsistent store
(entry present but logically deleted, or vice versa).  The worst case
is redundant sync traffic on the next session, which the CRDT absorbs.

#### Why Not a Write-Ahead Log

A write-ahead log (WAL) or append-only transcript would require
compaction to bound disk usage and a replay step on startup to
reconstruct in-memory state.  The per-file approach avoids both:

- **No compaction needed.**  Each file is the current state of one key.
  There is no historical data to compact.  Tombstone pruning (Section
  "Tombstone Garbage Collection") deletes the file outright.

- **No replay needed.**  On startup, the store reads the directory listing
  and parses each entry file, exactly as the current `pet-store` does
  (`pet-store.js:103-110`).  The cost is one `readdir` plus one
  `readFile` per entry, which is bounded by the number of active names
  in the relationship (typically tens, at most hundreds).

- **No ordering concerns.**  A WAL requires entries to be applied in
  order.  The per-file approach makes each key independent -- there is
  no cross-key ordering invariant on disk.

The tradeoff is that a burst of writes to many keys produces many
individual `rename` syscalls rather than a single `fsync` of an
appended log.  For the expected workload (infrequent writes, small
number of keys per peer relationship), this is acceptable.  If a future
workload requires bulk writes (e.g., importing hundreds of names at
once), the write path can batch entries into a single temporary
directory and rename the directory, but this optimization is not needed
initially.

#### Filesystem Ordering and `fsync`

On Linux with ext4 (the common deployment target), `rename(2)` is
metadata-atomic but not necessarily durable until the directory entry is
fsynced.  For maximum durability, the write path should:

1. `fsync` the temporary file's file descriptor before closing.
2. `rename` the temporary to the final path.
3. `fsync` the parent directory's file descriptor.

Step 3 ensures the directory entry update is durable.  Without it, a
power loss after `rename` but before the directory is flushed could lose
the rename on ext4 (though the file data is safe).

In practice, the daemon's `writeJobs` queue (`daemon-node-powers.js:196-201`)
serializes writes, so a subsequent write to the same store will implicitly
flush earlier directory updates.  The explicit `fsync` is a defense-in-depth
measure for the case where the daemon crashes immediately after a single
write with no subsequent I/O.

The `filePowers` interface should be extended with an `fsyncPath` method
(wrapping `fs.fdatasyncSync` or `fs.fsync`) to support this.  The existing
`writeFileText` and `renamePath` methods remain unchanged; the synced pet
store calls `fsyncPath` as an additional step.

### Integration with Existing GC

The `synced-pet-store` participates in the formula graph as a pet store:
- `onPetStoreWrite(syncedStoreId, localFormulaId)` when a locator resolves
  to a local formula.
- `onPetStoreRemove(syncedStoreId, localFormulaId)` when a tombstone arrives
  for that name.

Remote locators do not create pet store edges (consistent with the current
`isLocalId` filter), but the **peer** formula is a dependency of the
`synced-pet-store` formula, keeping the peer alive as long as the
relationship exists.

### Interaction with `makePetSitter`

The grantee's agent can overlay `makePetSitter` on top of the synced store,
just as it overlays special names today (guest.js:69-82).  This preserves
the `@self`, `@host`, `@agent`, `@keypair`, and `@mail` special names while
delegating regular name resolution to the synced store.

### Migration Path

Existing single-daemon deployments do not use cross-peer references and are
unaffected.  For new peer relationships:

1. The invitation `accept()` handler creates the synced store pair.
2. Existing `petStore.write(guestName, guestHandleId)` calls are replaced
   with writes to the synced store.
3. The `provideGuest` / `introduceNamesToAgent` flow writes introduced names
   into the synced store instead of the guest's local pet store.

## References

All line numbers and code citations refer to commit `543c2829f` on the
`llm` branch.

- `packages/daemon/src/graph.js` -- Formula dependency graph and GC
  infrastructure.  Line 116: `extractDeps(formula).filter(isLocalId)`.
- `packages/daemon/src/daemon.js:324-403` -- `extractDeps()`: static
  dependency extraction per formula type.
- `packages/daemon/src/daemon.js:405` -- `isLocalId`: determines whether a
  formula ID belongs to the local node.
- `packages/daemon/src/daemon.js:604-800` -- `collectIfDirty()`: the full
  mark-and-sweep collection algorithm.
- `packages/daemon/src/daemon.js:2200-2208` -- `evaluateFormulaForId()`:
  remote formula delegation via peer.
- `packages/daemon/src/daemon.js:3366-3427` -- `makeInvitation()`: invitation
  incarnation, `locate()` and `accept()` methods.
- `packages/daemon/src/daemon.js:2356-2386` -- `formulateInvitation()`:
  invitation formula creation.
- `packages/daemon/src/host.js:624-646` -- `invite()`: host-side invitation
  entry point.
- `packages/daemon/src/host.js:652-702` -- `accept()`: guest-side acceptance
  entry point.
- `packages/daemon/src/host.js:443-456` -- `introduceNamesToAgent()`:
  capability granting via pet name mapping.
- `packages/daemon/src/pet-store.js:124-148` -- `write()`: pet store
  persistence.
- `packages/daemon/src/pet-sitter.js:15-126` -- `makePetSitter()`: special
  name overlay.
- `packages/daemon/src/guest.js:69-82` -- Guest special name setup.
- `packages/daemon/src/residence.js` -- Residence tracker for CapTP
  connection retention.
- `packages/daemon/src/remote-control.js` -- Peer connection state machine.
- `packages/daemon/src/formula-identifier.js:65-97` -- `parseId()`/
  `formatId()`: formula ID encoding with node numbers.
- Shapiro, M., Preguica, N., Baquero, C., Zawirski, M. (2011). "A
  Comprehensive Study of Convergent and Commutative Replicated Data Types."
  INRIA Research Report RR-7506.  Section 3.2.2 describes LWW-Register.
  https://inria.hal.science/inria-00555588
