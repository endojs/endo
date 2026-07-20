# Persistent Stores in the Endo Pet Daemon

| | |
|---|---|
| **Created** | 2026-07-20 |
| **Author** | dckc (prompted) |
| **Status** | Not Started |
| **Source** | Extracted from kriskowal/garden#59 |

## Status

Not started. This document answers the question raised in kriskowal/garden#59
— *"Does the endo pet daemon support the `@agoric/store` interfaces?"* — with
**No, not today**, and specifies the work to add them.

## What is the Problem Being Solved?

`@agoric/store` (in `agoric-sdk`) provides the mutable, incrementally-updatable
collection abstractions that Agoric contract and vat code rely on:
`makeScalarMapStore`, `makeScalarSetStore`, `makeScalarWeakMapStore`, and their
`MapStore` / `SetStore` / `WeakMapStore` interface types. A guest holds a store
capability and calls `init` / `set` / `get` / `delete` / `has` incrementally;
the collection is durable, so it survives a restart of the hosting vat.

The endo pet daemon has **no equivalent**. What it has today:

- **Persistence substrate.** Every capability is defined by a *formula* — a
  small JSON record with a `type` and typed references — persisted in a SQLite
  database (`${statePath}/endo.sqlite`, `src/manager-database.js`) plus a
  content-addressed blob store (`packages/daemon-cas`). Objects are re-derived
  ("formulated") from their formulas on restart.
- **Name maps, not value stores.** The `pet-store` family (`src/pet-store.js`;
  the `pet_store_entry` table) is a **string-name → formula-id** directory.
  `directory` / `NameHub` (`src/directory.js`) is the guest-facing wrapper. The
  `synced-store` layer (`synced_store_entry`) replicates name→locator maps
  across peers. None of these is a general passable-key → passable-value store.
- **Write-once value snapshots.** `storeValue(value, petName)` (`src/guest.js`,
  `formulateMarshalValue`) serializes a passable `value` into an **immutable**
  `marshal` formula and binds it to a pet name. There is no way to mutate a
  stored collection in place; you can only replace the whole snapshot under a
  new name.
- **No `@agoric/store`, `@agoric/zone`, `vatstore`, or durable-kind
  machinery** anywhere in `packages/daemon` (dependency set:
  `packages/daemon/package.json` — `@endo/exo` and `@endo/patterns`, no
  `@agoric/*`). The exo objects the daemon builds are *transient*: re-created
  from formulas on each restart. Durability lives entirely in the
  formula/SQLite/CAS layers.

So a guest that wants "a Map I can `set` keys on and that is still there after
the daemon restarts" has no primitive to reach for. That is the gap.

### Why endo has the ingredients but not the dish

`@agoric/store` is a **downstream consumer** of `@endo/patterns`. Endo already
ships the *foundation*:

- `@endo/patterns` — the `M` pattern/guard vocabulary, `Key` comparison
  (`compareKeys`, `keyEQ`), and the **immutable, passable** copy-collections
  `makeCopyMap` / `makeCopySet` / `makeCopyBag` (`src/keys/checkKey.js`).
- `@endo/exo` — `makeExo` / `defineExoClass` for guarded remotable objects.

What endo does **not** ship is the *mutable persistent* collection layer that
`@agoric/store` adds on top (`makeScalarMapStore` et al.). The daemon
deliberately does not depend on `@agoric/store` (it avoids `@agoric/*`
altogether), so we cannot simply import it; and `@agoric/store`'s durability is
built on `@agoric/vat-data` durable kinds / the vatstore, a substrate the
daemon does not have. We therefore build a **daemon-native** store: the same
*API shape* as `@agoric/store` (so the mental model transfers) over the
daemon's *own* durability substrate (formula + SQLite), reusing `@endo/patterns`
for keys/patterns and `@endo/exo` for the guarded object.

## Design

### Shape of the capability

A new formula type, **`map-store`**, plus (in later phases) **`set-store`** and
weak variants. A `map-store` formula is minimal — it records only the store's
identity and kind; the entries live in a dedicated SQLite table keyed by the
store's formula number. This mirrors exactly how `pet-store`, `mailbox-store`,
`known-peers-store`, and `synced-store` were each added: a formula type + a
table + a factory the manager dispatches to.

```
formula-type.js:   add 'map-store' (and later 'set-store') to formulaTypes
formula-record.js: schema for the map-store formula record { type, ... }
manager-database.js: new table
    map_store_entry(store_number, key_body, key_slots, value_body, value_slots)
    PRIMARY KEY (store_number, key_body)
manager.js:        dispatch 'map-store' → makeIdentifiedMapStore(number, ...)
src/map-store.js:  the persistent MapStore exo factory (new file)
```

### Keys, values, and durable serialization

`@agoric/store`'s *scalar* stores restrict keys to **scalar keys** (primitives
and remotables — anything with no nested structure), which keeps key comparison
cheap and, crucially for us, keeps the *stored key* a small, stable byte string.
We adopt the same restriction for v1 (`M.scalar()` guard on keys); structured
keys (`M.key()`) are a later phase.

Keys and values are **passable**, so they are serialized with the daemon's
existing marshal machinery — the same body+slots encoding used by the `marshal`
formula (`formula-record.js`) and by `synced-store` entries:

- A **remotable** key or value serializes to a slot that is a **formula id**;
  storing it therefore creates a **retention edge** from the store to that
  formula, so the referenced capability is not garbage-collected while the
  store holds it. This reuses the existing retention/refcount graph
  (`src/store-controller.js` already does exactly this bookkeeping for pet
  stores via `onPetStoreWrite` / `onPetStoreRemove`).
- A **primitive** (number, string, bigint, boolean, null) serializes inline
  with no slots and no retention edge.

On restart, the manager reformulates the `map-store` formula and constructs the
exo; entries are read back from `map_store_entry` (eagerly for small stores, or
lazily row-by-row — see Design Decision 4) and unmarshalled on access.

### Interface

The exo presents the `@agoric/store` **`MapStore` method surface**, guarded with
`@endo/patterns` `M` in a `map-store` interface, so the API a guest sees matches
what they already know from Agoric:

```js
export const MapStoreInterface = M.interface('MapStore', {
  has:     M.callWhen(ScalarKeyShape).returns(M.boolean()),
  get:     M.callWhen(ScalarKeyShape).returns(M.any()),
  init:    M.callWhen(ScalarKeyShape, M.any()).returns(),
  set:     M.callWhen(ScalarKeyShape, M.any()).returns(),
  delete:  M.callWhen(ScalarKeyShape).returns(),
  getSize: M.callWhen().returns(M.number()),
  keys:    M.callWhen().returns(M.arrayOf(M.any())),
  values:  M.callWhen().returns(M.arrayOf(M.any())),
  entries: M.callWhen().returns(M.arrayOf(M.array())),
  snapshot: M.callWhen().returns(M.any()), // a passable CopyMap
});
```

Semantics match `@agoric/store` exactly:

- `init(key, value)` — throws if `key` already present.
- `set(key, value)` — throws if `key` absent.
- `get(key)` — throws if `key` absent.
- `delete(key)` — throws if `key` absent.
- `has(key)` — never throws.
- `snapshot()` — returns a hardened, passable `CopyMap` (`makeCopyMap`) that can
  cross CapTP and be pattern-matched, giving a durable-store → passable-value
  bridge symmetric with the existing write-once `storeValue`.

Every mutating method **writes through to SQLite in the same turn** before
resolving, so a crash between the in-memory update and the row write cannot
diverge (the row write *is* the commit). Iteration methods return arrays rather
than live iterators so the CapTP boundary stays simple in v1 (`@agoric/store`'s
lazy iterators are a later ergonomic upgrade).

### Exposure to guests and hosts

A new agent method, mirroring the existing `makeDirectory` / `storeValue`
affordances on the guest/host interface:

```js
// on the Guest and Host interfaces (src/interfaces.js)
makeMapStore: M.callWhen(PetNameShape /* , options */).returns(M.remotable('MapStore')),
```

`makeMapStore(petName)`:

1. formulates a fresh `map-store` formula (new formula number),
2. binds the resulting store id to `petName` in the agent's pet store (so it is
   nameable, lookup-able, and survives restart like any other named cap), and
3. returns the live `MapStore` exo.

Re-looking-up the pet name after a restart returns a store backed by the same
`map_store_entry` rows — persistence demonstrated end to end.

### Relationship to `@agoric/store`

| Concern | `@agoric/store` | This design |
|---|---|---|
| Key/pattern vocabulary | `@endo/patterns` (`M`, keys) | same — `@endo/patterns` |
| Guarded object | exo | same — `@endo/exo` |
| Method surface | `MapStore` / `SetStore` / `WeakMapStore` | **mirrors** the same method names/semantics |
| Durability substrate | `@agoric/vat-data` durable kinds / vatstore | **daemon formula + SQLite** |
| Constructor | `makeScalarMapStore(label, opts)` | `makeMapStore(petName)` over CapTP |

We match the *interface* so a `@agoric/store` user is immediately at home, while
the *implementation* is native to the daemon and adds no `@agoric/*` dependency.

## Dependencies

| Design / package | Relationship |
|---|---|
| `@endo/patterns` | Provides `M`, `Key` comparison, and `makeCopyMap`/`makeCopySet` for `snapshot()`. Reused, not modified. |
| `@endo/exo` | Provides `makeExo` for the guarded store object. Reused. |
| daemon `marshal` formula (`src/formula-record.js`) | The body+slots durable serialization we reuse for keys/values. |
| daemon `store-controller.js` retention graph | The refcount/retention edges a store's remotable entries must join. |
| `synced-store` (`synced_store_entry`) | Precedent for a passable-payload SQLite table; a later phase may replicate stores across peers the same way. |

## Phased Implementation

**Phase 1 — durable strong `MapStore` (scalar keys).**
`map-store` formula type + `map_store_entry` table + `src/map-store.js` exo +
`makeMapStore` on guest/host + retention edges for remotable entries. Tests:
`init`/`set`/`get`/`delete`/`has`/`getSize`/`keys`/`values`/`entries`/`snapshot`
semantics (including the throw-conditions), CapTP round-trip of a remotable
value, and **restart persistence** (create → set → restart daemon → still
there; `test/endo.test.js` is the established home for restart-survival tests).
This phase is the deliverable that closes issue #59.

**Phase 2 — durable strong `SetStore`.** `set-store` formula type +
`set_store_entry` table + `add`/`delete`/`has`/`getSize`/`keys`/`snapshot`
(→ `CopySet`). Small delta on Phase 1.

**Phase 3 — weak variants (`WeakMapStore` / `WeakSetStore`).** No enumeration;
a key that is a remotable does **not** create a retention edge (weak reference
semantics), so the entry is reaped when the key formula is collected. This
interacts with the GC graph and is deliberately deferred until Phase 1's
retention semantics are proven.

**Phase 4 — parity polish.** Structured keys (`M.key()` beyond `M.scalar()`),
key/value pattern arguments to `keys`/`values`/`entries`/`getSize`,
`addAll`/`clear`, and lazy iterators. Optional: expose the store on the CLI
(`endo store …`) and multiplayer replication via the synced-store substrate.

## Design Decisions

1. **Formula type + SQLite table, not `@agoric/store`.** The daemon avoids
   `@agoric/*` and has no vatstore/durable-kind substrate, so importing
   `@agoric/store` is not an option. Adding a formula type + table is the
   daemon's own, well-trodden extension point (pet-store, mailbox-store,
   known-peers-store, synced-store were all added this way), and it plugs
   directly into the existing retention/GC graph.

2. **Mirror the `@agoric/store` API, not the implementation.** Matching method
   names and semantics gives immediate familiarity and a clean future path to
   an adapter, without inheriting the vat-data machinery.

3. **Write-through on every mutation.** The SQLite row write is the commit
   point; there is no separate flush, so a crash cannot leave memory and disk
   diverged. Cost is one small write per mutation — acceptable, and identical
   to how pet-store mutations already persist.

4. **Scalar keys and eager small-store load in v1.** Scalar keys keep the
   stored key a stable byte string and match `makeScalarMapStore`. Small stores
   load eagerly on formulation; a size threshold switching to lazy row reads is
   a Phase 4 optimization, not a v1 requirement.

5. **`snapshot()` returns a `CopyMap`.** This bridges the mutable durable store
   to a passable value symmetric with the existing write-once `storeValue`, and
   reuses `@endo/patterns`' `makeCopyMap` so the result is pattern-matchable and
   CapTP-safe.

6. **Arrays over live iterators in v1.** Keeps the CapTP boundary simple;
   `@agoric/store`'s lazy, pattern-filtered iterators are a Phase 4 ergonomic
   upgrade.

## Known Gaps and TODOs

- [ ] Phase 1 implementation and restart-persistence tests (closes #59).
- [ ] Decide whether `makeMapStore` accepts an options record (label, key
      shape) in v1 or defers all options to Phase 4.
- [ ] Confirm the marshal body+slots encoding used by the `marshal` formula is
      reusable verbatim for entry rows, or whether store entries need their own
      thin codec.
- [ ] Weak-reference GC semantics (Phase 3) against the retention graph.
