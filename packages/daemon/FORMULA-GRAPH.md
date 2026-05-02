# Formula Graph Design

The Endo daemon models all persistent state as a **formula graph**: a directed
graph of typed formulas linked by formula identifiers.  Every daemon capability
— hosts, guests, workers, pet stores, messages, promises, readable blobs, and
more — is a node in this graph.  The graph is the single source of truth for
what exists, how it was made, and what keeps it alive.

This document covers:

1. What the graph encodes (nodes, edges, identifiers, groups).
2. The operations that can be performed on it.
3. How concurrent, in-flight operations interact.
4. Garbage collection (formula collection) and its interplay with liveness and
   locking.

---

## 1  What the Graph Encodes

### 1.1  Nodes — Formulas

A **formula** is a JSON-serializable record that describes how to produce a live
value.  Every formula has a `type` field that selects its evaluator.  The full
set of formula types is maintained in `src/formula-type.js`:

```
channel          directory        endo             eval
guest            handle           host             invitation
keypair          known-peers-store least-authority  lookup
loopback-network mail-hub         mailbox-store    make-bundle
make-unconfined  marshal          message          peer
pet-inspector    pet-store        promise          readable-blob
resolver         worker
```

Some formulas are purely structural (e.g. `keypair` stores a public key),
while others are imperative recipes (e.g. `eval` carries source code, a
worker reference, and endowment references).

### 1.2  Identifiers

Every formula is identified by a **FormulaIdentifier**, a string of the form:

```
<FormulaNumber>:<NodeNumber>
```

Both `FormulaNumber` and `NodeNumber` are 64-character lowercase hex strings
(256 bits).  The `NodeNumber` is the daemon's Ed25519 public key, scoping the
identifier to a particular node.

Identifiers are parsed and validated by `src/formula-identifier.js`
(`parseId`, `formatId`, `assertValidId`).

### 1.3  Edges — Static Dependencies

Each formula embeds zero or more `FormulaIdentifier` references to other
formulas.  These are the **static dependency edges** of the graph.  The
function `extractDeps` in `daemon.js` enumerates them per formula type:

| Formula type        | Dependencies                                                        |
|---------------------|---------------------------------------------------------------------|
| `endo`              | networks, pins, peers, host, leastAuthority                         |
| `host`              | handle, hostHandle, keypair, worker, inspector, petStore, mailboxStore, mailHub, endo, networks, pins |
| `guest`             | handle, keypair, hostHandle, hostAgent, petStore, mailboxStore, mailHub, worker |
| `channel`           | handle, creatorAgent, messageStore, memberStore                     |
| `eval`              | worker, values[]                                                    |
| `marshal`           | slots[]                                                             |
| `message`           | from, to, ids[], promiseId?, resolverId?, valueId?                  |
| `handle`            | agent                                                               |
| `mail-hub`          | store                                                               |
| `promise`/`resolver`| store                                                               |
| `lookup`            | hub                                                                 |
| `make-unconfined`   | worker, powers                                                      |
| `make-bundle`       | worker, powers, bundle                                              |
| `peer`              | networks                                                            |
| `pet-inspector`     | petStore                                                            |
| `directory`         | petStore                                                            |
| `invitation`        | hostAgent, hostHandle                                               |
| others              | (none)                                                              |

Only *local* identifiers (whose node matches `localNodeNumber`) are tracked;
remote dependencies are outside the local GC domain.

### 1.4  Edges — Dynamic Pet Store Edges

Pet stores (`pet-store`, `mailbox-store`, `known-peers-store`) contain
name-to-identifier mappings that act as **dynamic edges**.  When a pet store
names a formula, the graph records an edge from the pet store to that formula.
These edges change at runtime as names are written, removed, or renamed.

The graph tracks pet store edges via `onPetStoreWrite`, `onPetStoreRemove`, and
`onPetStoreRemoveAll` in `src/graph.js`.

### 1.5  Groups — Union-Find

Certain formula pairs share a single identity and must be created and collected
atomically.  These are merged into **groups** via a union-find structure:

- **handle ↔ agent**: A `handle` formula references its `agent` (a `host` or
  `guest`), and vice-versa.  Both are unioned on creation.
- **promise ↔ resolver**: Paired through a shared pet store (`store`).  Once
  both halves are added to the graph, they are unioned.

The group representative is found by `findGroup(id)` with path compression.
All GC decisions operate at the group level — either every member of a group is
collected or none are.

### 1.6  Roots

Certain formulas are **permanent roots** — they are never collected:

- The `endo` bootstrap formula.
- The main worker.
- The known-peers store.
- The least-authority guest.
- All platform-special formulas (e.g. `APPS`).

Roots are registered with `formulaGraph.addRoot(id)` during daemon
initialization.

### 1.7  Persistence

Formulas are persisted as JSON files under
`{statePath}/formulas/{first2chars}/{remaining}.json`.  The persistence module
(`daemon-node-powers.js`) provides `writeFormula`, `readFormula`,
`deleteFormula`, and `listFormulas`.

An invariant of the system is **disk before graph**: the formula JSON must be
written to disk before the formula identifier enters the in-memory
`formulaForId` map or the dependency graph.  This ensures that if evaluation
fails, reincarnation can always read the formula back.

---

## 2  Operations

### 2.1  Preformulate (Bootstrap)

```js
preformulate(derivation, formula) → { id, formulaNumber }
```

Used once at daemon startup for formulas whose identity is deterministically
derived from the root entropy (endo, main worker, known-peers, least-authority,
platform specials).  Writes the formula to disk but does *not* register it in
the graph or create a controller — those happen later during
`seedFormulaGraphFromPersistence`.

### 2.2  Formulate (Create New Formula)

```js
formulate(formulaNumber, formula) → { id, value }
```

The primary creation operation:

1. **Persist** the formula to disk (`writeFormula`).
2. **Register** in the graph under `withFormulaGraphLock`:
   - Assert the formula does not already exist.
   - Add to `formulaForId`.
   - Call `formulaGraph.onFormulaAdded`.
3. **Create a controller** (`{ context, value }`) and register it in
   `controllerForId`.
4. **Evaluate** the formula by dispatching to the type-specific maker in the
   `makers` table.  The resulting value promise is wired to the controller.
5. **Return** `{ id, value }` where `value` is the controller's promise.

The controller must be created synchronously (in the same microtask) after the
graph registration so that any recursive `provide` call during evaluation can
find it.

### 2.3  Provide (Reincarnate or Reuse)

```js
provide(id, expectedType?) → Promise<value>
```

Resolves a formula identifier to its live value.  Delegates to
`provideController`:

```js
provideController(id) → Controller
```

If a controller already exists for `id`, it is returned immediately.  Otherwise
a new controller is created with a fresh promise kit.  The promise is resolved
with `evaluateFormulaForId(id, context)`:

- **Local formulas** — loads the formula from memory or disk
  (`getFormulaForId`), then calls `evaluateFormula`.
- **Remote formulas** — finds the peer for the target node, then calls
  `E(peer).provide(id)`.

`getFormulaForId` itself may trigger graph registration: if the formula is not
in `formulaForId`, it reads it from persistence and adds it to the graph under
the lock.

### 2.4  Cancel

```js
cancelValue(id, reason) → Promise<void>
```

Cancels a formula's incarnation:

1. Waits for any in-flight graph operation to finish
   (`formulaGraphJobs.enqueue()`).
2. Obtains the controller via `provideController`.
3. Calls `controller.context.cancel(reason)`.

Cancellation is **cascading**: `context.cancel` propagates to all dependents
registered via `thatDiesIfThisDies`, then executes `onCancel` hooks (e.g.
worker graceful shutdown).  The controller is removed from `controllerForId`.

### 2.5  Remove (Pet Name)

Removing a pet name from a pet store does not directly destroy the referenced
formula.  Instead, the wrapped pet store:

1. Calls `petStore.remove(petName)`.
2. Checks whether the formula has any remaining names in this store
   (`reverseIdentify`).
3. If no names remain, calls `formulaGraph.onPetStoreRemove(petStoreId, id)` to
   delete the dynamic edge.
4. Marks the graph dirty.

The formula may then become unreachable and be collected in the next
`collectIfDirty` pass.

### 2.6  Specific Formulate Functions

Higher-level formulate functions compose `formulate` with domain-specific setup:

| Function                  | Creates                                                  |
|---------------------------|----------------------------------------------------------|
| `formulateReadableBlob`   | Content-addressed blob formula                           |
| `formulateInvitation`     | Invitation linking host agent and handle                 |
| `formulatePromise`        | A pet-store + promise + resolver triple                  |
| `formulateMessage`        | A message formula with sender/recipient/payload          |
| `formulateMarshalValue`   | A marshal formula for arbitrary passable values          |
| `formulateEval`           | An eval formula with source, worker, endowments          |
| `formulateHost`           | A host agent and all its subsidiaries                    |
| `formulateGuest`          | A guest agent and all its subsidiaries                   |
| `formulateWorker`         | A worker formula                                         |
| `formulateChannel`        | A channel with handle, message store, member store       |
| `formulateNumberedHandle` | A handle formula (without incarnation, breaks cycles)    |

Most of these run under `withFormulaGraphLock` and accept deferred-task
callbacks that wire up pet names once identifiers are known.

### 2.7  Seed Graph from Persistence

On daemon restart, `seedFormulaGraphFromPersistence` reads all persisted
formulas from disk and:

1. Registers each in `formulaForId` and `formulaGraph.onFormulaAdded`.
2. Scans every pet-store-type formula for its entries, calling
   `formulaGraph.onPetStoreWrite` for each stored name.

This reconstructs the full dependency graph without incarnating any values;
incarnation is deferred until `provide` is called.

---

## 3  Concurrency and In-Flight Operations

### 3.1  The Formula Graph Lock

All mutations to the formula graph are serialized through a single async mutex:

```js
const formulaGraphJobs = makeSerialJobs();
```

`makeSerialJobs` (in `src/serial-jobs.js`) uses an `AsyncQueue` as a
single-token semaphore: `enqueue(asyncFn)` acquires the token, runs `asyncFn`,
and releases on completion.

The convenience wrapper `withFormulaGraphLock(asyncFn)` adds **re-entrancy
detection**: it tracks a depth counter (`formulaGraphLockDepth`) and, if the
lock is already held on the current call stack, runs `asyncFn` directly rather
than re-enqueueing (which would deadlock).

Operations serialized by the lock:

- **Formulation** — adding new formulas to `formulaForId` and
  `formulaGraph.onFormulaAdded`.
- **Provision** — loading formulas from persistence into the graph
  (`getFormulaForId`).
- **Pet store edge changes** — `onPetStoreWrite`, `onPetStoreRemove`.
- **Collection** — `collectIfDirty` (uses `formulaGraphJobs.enqueue`
  directly, bypassing the re-entrancy wrapper).

### 3.2  Why Collection Bypasses the Re-entrancy Wrapper

`collectIfDirty` deliberately uses `formulaGraphJobs.enqueue()` instead of
`withFormulaGraphLock()`.  This is because it is called from `finally` blocks
in `withCollection` wrappers on host methods.  If it used the re-entrancy
wrapper, it could falsely detect re-entrancy (from the depth counter being
incremented by an ancestor frame) and skip serialization, leading to races
between concurrent collection passes.  By going through the raw mutex, it
guarantees mutual exclusion with all other graph operations.

### 3.3  Controller Creation and Recursive Provide

When `formulate` or `provideController` creates a controller, it does so
**synchronously** — the controller (with its promise) is placed in
`controllerForId` before any `await`.  This is critical: the subsequent
`evaluateFormula` call will recursively `provide` dependencies, and those calls
must find the controller already registered to avoid creating duplicate
controllers or infinite loops.

### 3.4  Evaluation vs. Graph Registration

Formula evaluation (calling the type-specific maker) happens *outside* the
formula graph lock.  The lock is only held for the brief graph-mutation
operation (adding to `formulaForId` and `formulaGraph`).  Evaluation can be
long-running (e.g. spawning a worker process, making network requests) and must
not hold the lock.

### 3.5  The Provide Pattern

Many host methods follow a provide-or-create pattern:

```js
const existing = identify(petName);
if (existing !== undefined) {
  return provide(existing);
}
const { value, id } = await formulateFoo(...);
await petStore.write(petName, id);
return value;
```

This is not atomic with respect to concurrent callers — two callers could both
see `undefined` for the same pet name.  However, `formulate` asserts that the
formula does not already exist, and pet store writes are themselves serialized,
so at worst one caller will fail with an assertion error rather than creating a
duplicate.

### 3.6  Promise Resolution and the Resolver Queue

Each resolver has its own serial queue (`resolverJobs`), ensuring that
concurrent `resolveWithId` calls are processed one at a time.  This prevents
double-resolution: the first call writes the status to the pet store, and
subsequent calls see the existing status entry and return early.

### 3.7  Deferred Tasks

`makeDeferredTasks` (in `src/deferred-tasks.js`) is a pattern for accumulating
work that must execute after formula numbers are known but before formulation
completes.  A caller pushes task functions, then calls `execute(identifiers)`
with the generated identifiers.  This is used, for example, to write pet names
for newly-created formulas while still inside `withFormulaGraphLock`.

---

## 4  Garbage Collection (Formula Collection)

### 4.1  Overview

Formula collection is a **reference-counting sweep at the group level**.  The
graph maintains a `dirty` flag; when the graph has changed (formulas
added/removed, pet store edges changed), the next `collectIfDirty` call
performs a collection pass.  If the graph has not changed, it is a no-op.

### 4.2  The Collection Algorithm

`collectIfDirty` (in `daemon.js`) runs entirely under
`formulaGraphJobs.enqueue`, serialized with all other graph mutations:

1. **Build groups.**  Assign every known local formula to its union-find group
   representative.

2. **Build group-level dependency graph.**  For each static dep and each pet
   store edge, add an edge from the containing group to the dependency's group
   (skipping self-edges).

3. **Count incoming references** per group.

4. **Identify root groups.**  Union the permanent roots and transient roots
   into their groups and mark those groups as roots.

5. **Topological sweep.**  Start from groups with zero incoming references that
   are not roots.  For each such group, decrement the reference count of its
   dependencies.  If a dependency reaches zero and is not a root, enqueue it.
   All groups visited are **collected**.

6. **Cancel collected formulas.**  For each collected formula, call
   `controller.context.cancel(new Error('Collected formula'))`.  This cascades
   to dependents and runs disposal hooks.

7. **Drop live values.**  Remove each collected formula from `controllerForId`,
   `refForId`, and `idForRef`.

8. **Disconnect retainers.**  Call
   `residenceTracker.disconnectRetainersHolding(collectedIds)` to close CapTP
   connections and terminate workers that were exporting collected formulas.

9. **Remove from graph and formulaForId.**  Call
   `formulaGraph.onFormulaRemoved(id)` for each collected formula.  For pet
   store formulas, also call `onPetStoreRemoveAll` to remove their dynamic
   edges (this may trigger further collections in a subsequent pass).

10. **Delete persistence.**  Remove the formula JSON from disk.  For pet store
    formulas, delete the pet store data directory.

11. **Clear dirty flags.**  Mark the graph and transient roots as clean.

12. **Revive pins.**  After the enqueued sweep finishes, call
    `E(endoBootstrap).revivePins()` to re-incarnate any pinned formulas that
    survived collection (pins are a directory of formulas that should be kept
    alive across restarts).

### 4.3  What Keeps Formulas Alive

A formula is **reachable** if its group can be reached from a root group
through static dependency edges or pet store edges.  The sources of liveness
are:

| Mechanism              | Description                                                          |
|------------------------|----------------------------------------------------------------------|
| **Permanent roots**    | `formulaGraph.addRoot(id)` — endo, main worker, known-peers, etc.   |
| **Pet store names**    | Any formula named by a reachable pet store has a dynamic edge to it. |
| **Transient roots**    | `pinTransient(id)` — temporary GC protection during a command.      |
| **Static deps**        | A reachable formula keeps its dependencies reachable.                |
| **Union-find groups**  | Group members share reachability: if any member is reachable, all are.|

### 4.4  Transient Roots (Pinning)

A formula created during a command is not yet named by any pet store.  Without
protection, a concurrent `collectIfDirty` could sweep it before the command
writes a pet name.

**Transient roots** solve this:

```js
pinTransient(id);    // add to transient root set
// ... create formula, evaluate, assign pet name ...
unpinTransient(id);  // remove from transient root set
```

Pinning adds the formula to `transientRoots`; unpinning removes it.  Both set
`transientRootsDirty = true` so the next collection pass re-evaluates
reachability.

Pinning is used in `formulateMarshalValue`, `formulatePromise`,
`formulateMessage`, and indirectly by many host operations that create formulas
before naming them.

### 4.5  GC and Inflight Operations — Locking Interactions

Because GC runs under `formulaGraphJobs.enqueue`, it is fully serialized with:

- **Formulation**: A formula being added to the graph cannot be collected in
  the same pass, because `formulate` runs under `withFormulaGraphLock` and GC
  runs under `formulaGraphJobs.enqueue`.  They cannot overlap.

- **Provision (getFormulaForId)**: Loading a formula from disk and registering
  it in the graph happens under `withFormulaGraphLock`.  GC cannot run until
  this completes.

- **Pet store writes**: Writing a pet name (which adds a dynamic edge) runs
  under `withFormulaGraphLock`.  GC cannot observe a half-updated edge set.

- **Cancellation**: `cancelValue` first does `await formulaGraphJobs.enqueue()`
  (a no-op enqueue that waits for the lock), ensuring any in-flight
  formulation or collection finishes before the cancellation proceeds.

The key invariant is: **GC sees a consistent graph snapshot**.  No formula can
be half-registered, and no pet store edge can be half-written when GC runs.

### 4.6  The `withCollection` Wrapper

Host and guest methods that modify the graph are wrapped with
`withCollection`:

```js
const withCollection = fn => async (...args) => {
  try {
    return await fn(...args);
  } finally {
    await collectIfDirty();
  }
};
```

This ensures that after every user-facing operation (e.g. `remove`, `move`,
`evaluate`), the daemon checks whether any formulas have become unreachable and
collects them.

Certain methods are **excluded** from `withCollection`:

- `handle`, `reverseIdentify`, `approveEvaluation`, `endow`,
  `grantEvaluate`, `submit`, `sendValue`

These methods create formulas that are resolved asynchronously through promise
chains (`E.sendOnly(resolver).resolveWithId`).  The resolver has not yet
written the formula identifier to its pet store when the method returns.
Triggering collection at this point would find the just-created formula
unreachable and delete it.  These methods rely on the resolver's own
`collectIfDirty` call (or the caller's subsequent operation) to trigger
collection at the right time.

### 4.7  Promise Resolution and GC

Promise resolution has a careful ordering requirement to prevent premature
collection of the resolved value:

```js
// In makeResolver.resolveWithId:
await petStore.write(RESOLVED_VALUE_NAME, id);   // (1) dynamic edge first
await writeStatus({ status: 'fulfilled', ... }); // (2) then settle
```

Step (1) writes the resolved formula's identifier as a pet store entry named
`"value"`, creating a dynamic edge from the promise's store to the resolved
formula.  This makes the resolved formula reachable through the promise's
group.

Step (2) writes the status record, which triggers the promise to settle.
Settlement may cause `collectIfDirty` to run (via `withCollection` on the
consumer side).  Because the edge was created in step (1), the resolved formula
is still reachable even if the consumer has not yet named it.

### 4.8  Residence Tracking and CapTP

The residence tracker (`src/residence.js`) monitors which CapTP connections
hold references to which formulas:

- **Retain**: When a CapTP connection exports a value (`exportHook`), the
  residence tracker records that the connection's retainer holds the formula.
- **Release**: When an export slot is deleted (`deleteExport`), the hold is
  released.
- **Retainer close**: When a connection closes, all its holds are released.

During collection, `disconnectRetainersHolding(collectedIds)` iterates over
all retainers.  If a retainer (worker or connection) holds a reference to any
collected formula, the connection is closed and the worker is terminated.  This
prevents dangling references in CapTP from keeping ghost objects alive.

Note that residence tracking is informational for cleanup — it does not
contribute to reachability.  A formula referenced only by a CapTP export (but
not named in any pet store or depended on by a rooted formula) will still be
collected.

### 4.9  Cancellation Context and Dependency Cascading

The context system (`src/context.js`) provides cancellation cascading
independent of GC:

- `thisDiesIfThatDies(depId)` — registers "if my dependency is cancelled, I
  am cancelled too".  This creates a **runtime** dependency for cancellation
  propagation.
- `thatDiesIfThisDies(depId)` — the reverse: "if I am cancelled, cancel this
  dependent too".
- `onCancel(hook)` — registers a cleanup hook (e.g. worker shutdown).

When GC collects a formula, it calls `context.cancel`, which cascades to all
registered dependents.  This is how worker processes are gracefully shut down
when a host or guest that owns them is collected.

### 4.10  Formula Collection is Not Incremental

Each `collectIfDirty` call is a complete pass over the graph.  It rebuilds the
group structure, the group-level dependency graph, and reference counts from
scratch.  This is simple and correct but scales linearly with the number of
formulas.  The `dirty` flag prevents redundant passes when the graph has not
changed.

---

## 5  Lifecycle Summary

```
                  ┌─────────────┐
                  │  writeFormula│  (persist to disk)
                  └──────┬──────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  withFormulaGraphLock │
              │  • formulaForId.set  │
              │  • onFormulaAdded    │
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  Create controller   │  (synchronous)
              │  controllerForId.set │
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  evaluateFormula     │  (async, type-specific maker)
              │  → live value        │
              │  • idForRef.add      │
              │  • refForId.set      │
              └──────────┬───────────┘
                         │
                    (value used)
                         │
                         ▼
              ┌──────────────────────┐
              │  Pet name removed /  │
              │  no more references  │
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  collectIfDirty      │
              │  • cancel controller │
              │  • dropLiveValue     │
              │  • disconnect CapTP  │
              │  • onFormulaRemoved  │
              │  • deleteFormula     │
              └──────────────────────┘
```

---

## 6  Key Source Files

| File                      | Role                                                     |
|---------------------------|----------------------------------------------------------|
| `src/daemon.js`           | Core: formulate, provide, evaluate, collect, lock        |
| `src/graph.js`            | Formula graph: deps, pet store edges, union-find, roots  |
| `src/context.js`          | Cancellation contexts with cascading                     |
| `src/serial-jobs.js`      | Single-token async mutex                                 |
| `src/residence.js`        | CapTP retain/release tracking                            |
| `src/formula-identifier.js` | FormulaIdentifier parsing and validation              |
| `src/formula-type.js`     | Valid formula type set                                   |
| `src/deferred-tasks.js`   | Task accumulation for post-identifier wiring             |
| `src/pet-store.js`        | Pet store persistence (name → identifier mappings)       |
| `src/host.js`             | Host agent: withCollection, provide patterns             |
| `src/guest.js`            | Guest agent: pet sitter, special names                   |
