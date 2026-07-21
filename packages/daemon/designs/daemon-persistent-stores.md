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
`MapStore` / `SetStore` / `WeakMapStore` / sorted-store interface types. A guest holds a store
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

The daemon implements the complete persistent collection family directly. It
does not wrap a directory and does not import `@agoric/store`. A single formula
type, **`collection-store`**, identifies every store; its formula record is
`{ type: 'collection-store', kind }`, where `kind` is one of `map`, `set`,
`weak-map`, `weak-set`, `sorted-map`, or `sorted-set`. The formula has no entry
snapshot. Entries are rows keyed by its formula number, so the same formula is
reformulated after restart and reconnects to the same collection.

```
formula-type.js:     add 'collection-store' to formulaTypes
formula-record.js:   validate { type: 'collection-store', kind }
manager-database.js: collection_store_entry and collection_store_weak_key tables
manager.js:          dispatch 'collection-store' to makeIdentifiedCollectionStore
src/collection-store.js: factories for all six guarded collection exos
```

`map` and `set` are strong stores. `weak-map` and `weak-set` are weak-key
stores. `sorted-map` and `sorted-set` are strong stores with an ordered-key
interface. The common formula type keeps lifecycle and cleanup uniform while
the `kind` selects the allowed methods and retention policy.

### Keys, values, and durable serialization

The first `MapStore` milestone accepts **scalar keys**, guarded by `M.scalar()`.
The next strong-map milestone broadens that guard to `M.key()`, including nested
passable keys and remotables at any depth. All later collection kinds use
`M.key()` unless their weak-key rule is narrower. A weak key must be a remotable
key: it is the formula identity of that remotable, rather than a JavaScript
weak-reference implementation detail, that gives the daemon an observable
durable collection event.

Keys and values are **passable**, so they are serialized with the daemon's
existing marshal machinery — the same body+slots encoding used by the `marshal`
formula (`formula-record.js`) and by `synced-store` entries. This is the
**body serialization** (a value *representation*), distinct from the separate
**rank encoding** (`key_rank`, § SQLite schema) that carries sort order; the two
roles are independent (see *Two encoding roles*, below):

- A strong-store **remotable key or value**, including a remotable nested inside
  an `M.key()` key, serializes to formula-id slots. The entry creates retention
  edges from the store to every referenced formula, so a strong store retains
  both keys and values. This reuses the existing formula refcount/retention
  graph, with per-entry add/remove accounting rather than only pet-store names.
- A weak-store key serializes to its formula id for identity and lookup but
  creates **no retention edge to that key**. A weak-map value remains strongly
  retained while its entry exists. The weak-key index lets formula collection
  find every affected entry; when the key formula is collected, collection
  atomically removes those rows and releases each entry's value edges. Thus a
  weak entry cannot keep its key alive, and no stale value edge survives the
  key's collection. Deleting an entry first removes its weak-key index and its
  value edges, so later collection has nothing to do.
- A **primitive** (number, string, bigint, boolean, null) serializes inline
  with no slots and no retention edge.

On restart, the manager reformulates the `collection-store` formula and
constructs the kind-specific exo. Entries are read from
`collection_store_entry` and unmarshalled on access. The graph also rebuilds
the strong entry edges and the weak-key collection index before guest traffic
is served.

#### Two encoding roles (body vs. rank), and the marshal -> CBOR option

A store entry carries a key and value under **two independent encodings**, and
keeping them separate is what makes the eventual serialization choice a
free variable:

- **Body serialization — a value representation.** `key_body`/`key_slots` and
  `value_body`/`value_slots` hold the *reconstructable* passable. Today this is
  the daemon's existing marshal body+slots (smallcaps) encoding. It is optimized
  for faithful, capability-aware round-trip (slots carry formula-id references),
  **not** for order: byte order of a marshal body has no relation to passable
  rank order, and nothing in the design relies on it having one.
- **Rank encoding — a sort key.** `key_rank` is produced by `@endo/marshal`
  `makeEncodePassable`, whose defining property is that the **lexicographic byte
  order of the encoding equals passable rank order**
  (`packages/marshal/src/encodePassable.js`). This is the *only* column sorted
  stores scan and order by; it exists precisely because the body encoding is not
  order-preserving.

Because order lives entirely in `key_rank`, a key **must** retain an
`encodePassable`-equivalent rank encoding even if its body representation
changes. Today the body is marshal; a later revision may use a
**CBOR-encoded passable** body without touching sort behaviour, indexes, or
scan queries, provided `key_rank` remains `makeEncodePassable` (or an
equivalent order-preserving codec). Only `key_body` / `value_body` change.
Values need no rank encoding and remain free to use any passable codec.

This directly answers the review question *"does CBOR-encoded passable preserve
passable order?"* — **it does not need to, and general CBOR does not.** CBOR
(RFC 8949), including its canonical/deterministic profile, is a compact
self-describing body format; its byte order does not track passable rank order
(canonical CBOR only sorts *map keys within a map* by encoded bytes — a different,
narrower guarantee). So a CBOR body would be an alternative **value
representation**, never a substitute for the `key_rank` sort key. If one instead
wanted the sort key *itself* to be CBOR bytes, general/canonical CBOR would be
unsuitable — an order-preserving encoding (`makeEncodePassable`, or a
purpose-built order-preserving CBOR profile) would still be required. The design
therefore keeps `key_rank = makeEncodePassable` fixed and treats the marshal->CBOR
choice as scoped to the body columns alone. Whether and when to actually adopt
CBOR bodies is a downstream endo serialization decision left to @kriskowal /
endo maintainers; this design only guarantees the switch is order-neutral.

### Interface

Each exo is guarded with `@endo/patterns` `M`. The family follows the familiar
`@agoric/store` method names and error semantics, but is daemon-native. The
strong stores expose the following surfaces (the initial `MapStore` has
`ScalarKeyShape`; after the full-key milestone it becomes `M.key()`):

```js
export const MapStoreInterface = M.interface('MapStore', {
  has:     M.callWhen(KeyShape).returns(M.boolean()),
  get:     M.callWhen(KeyShape).returns(M.any()),
  init:    M.callWhen(KeyShape, M.any()).returns(),
  set:     M.callWhen(KeyShape, M.any()).returns(),
  delete:  M.callWhen(KeyShape).returns(),
  getSize: M.callWhen().returns(M.number()),
  keys:    M.callWhen(M.opt(M.pattern())).returns(M.arrayOf(M.any())),
  values:  M.callWhen(M.opt(M.pattern())).returns(M.arrayOf(M.any())),
  entries: M.callWhen(M.opt(M.pattern())).returns(M.arrayOf(M.array())),
  snapshot: M.callWhen().returns(M.any()), // a passable CopyMap
});
```

`SetStore` replaces `init` and `set` with `add(key)`, and has no `get` or
`values`; it provides `has`, `delete`, `getSize`, `keys`, `entries` where an
entry is the key, and `snapshot` as a `CopySet`. `WeakMapStore` has
`has`/`get`/`init`/`set`/`delete`; `WeakSetStore` has `has`/`add`/`delete`.
Weak stores deliberately have no `getSize`, enumeration, or `snapshot`.

`SortedMapStore` and `SortedSetStore` have their corresponding strong-store
methods, always accept `M.key()` keys, and add bounded scans:

```js
keys(pattern = M.any(), bounds = undefined)
values(pattern = M.any(), bounds = undefined)
entries(pattern = M.any(), bounds = undefined)
```

`bounds` is a passable record of optional inclusive/exclusive `start` and `end`
keys. `pattern` is checked with `@endo/patterns`; its rank cover narrows the SQL
scan before exact matching. An omitted pattern means all keys. The final exact
pattern check is required because a rank cover can be a superset.

For all map-like kinds, semantics match `@agoric/store`:

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
diverge (the row write is the commit). Iteration methods return arrays rather
than live iterators so the CapTP boundary stays simple.

### SQLite schema and sorted-key index

All entry kinds use one entry table. `key_body`/`key_slots` and
`value_body`/`value_slots` are the existing durable marshal representation;
set entries have null value columns. `key_rank` is a canonical rank-order
encoding made with `@endo/marshal` `makeEncodePassable`, configured to encode
remotables by stable formula id. It is ASCII and compared with SQLite `BINARY`
collation. This is the same rank order used by `@endo/patterns` rank covers and
the sorted-store lineage in `@agoric/store`.

```sql
CREATE TABLE collection_store_entry (
  store_number TEXT NOT NULL,
  key_rank TEXT COLLATE BINARY NOT NULL,
  key_body TEXT NOT NULL,
  key_slots TEXT NOT NULL,
  value_body TEXT,
  value_slots TEXT,
  PRIMARY KEY (store_number, key_rank)
);
CREATE INDEX collection_store_entry_rank
  ON collection_store_entry (store_number, key_rank COLLATE BINARY);

CREATE TABLE collection_store_weak_key (
  key_formula_number TEXT NOT NULL,
  store_number TEXT NOT NULL,
  key_rank TEXT COLLATE BINARY NOT NULL,
  PRIMARY KEY (key_formula_number, store_number, key_rank)
);
CREATE INDEX collection_store_weak_key_lookup
  ON collection_store_weak_key (key_formula_number);
```

For `SortedMapStore` and `SortedSetStore`, `keys(pattern, bounds)` converts the
pattern with `getRankCover(pattern, encodePassable)`, intersects that cover with
the encoded bounds, and issues `WHERE store_number = ? AND key_rank >= ? AND
key_rank < ? ORDER BY key_rank`. The composite index makes a bounded scan
`O(log n + k)` for `k` returned candidates, rather than loading and sorting the
collection. `values` and `entries` use the same cursor. Exact pattern matching
filters false positives from a broad rank cover without changing ordering.

### Exposure to guests and hosts

A new agent method, mirroring the existing `makeDirectory` / `storeValue`
affordances on the guest/host interface:

```js
// on the Guest and Host interfaces (src/interfaces.js)
makeMapStore: M.callWhen(PetNameShape).returns(M.remotable('MapStore')),
makeSetStore: M.callWhen(PetNameShape).returns(M.remotable('SetStore')),
makeWeakMapStore: M.callWhen(PetNameShape).returns(M.remotable('WeakMapStore')),
makeWeakSetStore: M.callWhen(PetNameShape).returns(M.remotable('WeakSetStore')),
makeSortedMapStore: M.callWhen(PetNameShape).returns(M.remotable('SortedMapStore')),
makeSortedSetStore: M.callWhen(PetNameShape).returns(M.remotable('SortedSetStore')),
```

Each constructor follows the same sequence. `makeMapStore(petName)` is the
representative case:

1. formulates a fresh `collection-store` formula with the selected kind (new
   formula number),
2. binds the resulting store id to `petName` in the agent's pet store (so it is
   nameable, lookup-able, and survives restart like any other named cap), and
3. returns the live `MapStore` exo.

Re-looking-up the pet name after a restart returns a store backed by the same
`collection_store_entry` rows. Each variant must demonstrate that end-to-end
persistence before it lands.

### Relationship to `@agoric/store`

| Concern | `@agoric/store` | This design |
|---|---|---|
| Key/pattern vocabulary | `@endo/patterns` (`M`, keys) | same — `@endo/patterns` |
| Guarded object | exo | same — `@endo/exo` |
| Method surface | `MapStore` / `SetStore` / weak and sorted variants | **mirrors** the same method names/semantics |
| Durability substrate | `@agoric/vat-data` durable kinds / vatstore | **daemon formula + SQLite** |
| Constructor | `makeScalarMapStore(label, opts)` | `makeMapStore(petName)` over CapTP |

We match the *interface* so a `@agoric/store` user is immediately at home, while
the *implementation* is native to the daemon and adds no `@agoric/*` dependency.

### CLI and WUI command vocabulary

The `makeMapStore` method above is the *programmatic* surface (guest/host code
over CapTP). This section specifies the two *human* surfaces — the `endo` CLI
and the chat client's "spaces" web UI (**WUI**) — so a person can create and
drive a store without writing code, using verbs coherent with the vocabulary
the daemon already has. Two problems are specific to these surfaces: (a) a set
of appropriate, non-colliding verbs for each interface, and (b) how a human
types an *arbitrary passable key* on a command line or in a form.

#### Constructors (`mk*`)

The daemon already has an `mk*` constructor family — `mkdir`, `mkhost`,
`mkguest`, `mktmp` (`packages/cli/src/endo.js`), each taking `--name <petName>`
and `--as <agent>`. The store constructors join it, one flat verb per kind:

| Command | Creates | Guest/host method |
|---|---|---|
| `endo mkmap --name <n>`     | strong `MapStore`     | `makeMapStore` |
| `endo mkset --name <n>`     | strong `SetStore`     | `makeSetStore` |
| `endo mkweakmap --name <n>` | `WeakMapStore`        | `makeWeakMapStore` |
| `endo mkweakset --name <n>` | `WeakSetStore`        | `makeWeakSetStore` |
| `endo mksortedmap --name <n>` | `SortedMapStore`     | `makeSortedMapStore` |
| `endo mksortedset --name <n>` | `SortedSetStore`     | `makeSortedSetStore` |

The bound pet name is nameable / lookup-able / restart-surviving like any other
cap, exactly as `mkdir`'s directory is.

#### Per-store verbs

Each interface carries ~10 methods. Hanging all of them off the flat top level
would collide with existing verbs (`get`, `remove`, `list`, and in particular
the existing **write-once** `store` command — a distinct feature) and swamp
`endo --help`. So the mutation/query verbs live under a **command group named
for the store kind** — `endo map <name> <verb> …` and `endo set <name> <verb> …`
— which would be the CLI's first subcommand groups, a departure justified by the
method count. The constructors stay flat as `mk*` to match `mkdir`.

`MapStore` (`endo map <name> …`):

| Interface method | CLI verb |
|---|---|
| `init(key, value)` | `endo map <name> init <key> <value>` |
| `set(key, value)`  | `endo map <name> set <key> <value>` |
| `get(key)`         | `endo map <name> get <key>` |
| `has(key)`         | `endo map <name> has <key>` |
| `delete(key)`      | `endo map <name> delete <key>` (alias `rm`) |
| `getSize()`        | `endo map <name> size` |
| `keys()`           | `endo map <name> keys` |
| `values()`         | `endo map <name> values` |
| `entries()`        | `endo map <name> entries` |
| `snapshot()`       | `endo map <name> snapshot --name <copymap-name>` (binds a passable `CopyMap`, symmetric with the write-once `store`) |

`SetStore` (`endo set <name> …`) uses the same verbs with `add` in place of
`init`/`set`: `add <key>`, `has <key>`, `delete <key>`, `size`, `keys`,
`snapshot` (→ `CopySet`).

The **weak** variants (`endo weakmap …` / `endo weakset …`) share the mutating
verbs (`init`/`set`/`get`/`has`/`delete` or `add`/`has`/`delete`) but **omit the
enumeration verbs** (`keys`/`values`/`entries`/`size`/`snapshot`), because weak
stores are non-enumerable by design (Phase 3).

`endo sortedmap` and `endo sortedset` use the corresponding strong-store verbs.
Their `keys`, `values`, and `entries` commands accept the pattern encoding and
optional `--from` / `--to` bounds, which are converted to the same rank range
as the daemon API. They return key-rank order.

#### Expressing keys and values

The crux of the review: keys can be arbitrary passable data, not just strings, so
a CLI/form field needs a way to *write* a passable **and** a guarantee that the
decoder **halts** — never runs arbitrary code, never loops — so a hostile key
expression cannot hang the daemon or escape the sandbox. Every `<key>` and
`<value>` positional accepts a **typed encoding**, selected by a flag namespace
mirroring the encodings today's `store` command already offers (`--json`,
`--text`, `--bigint`, `--path`, `--stdin`):

- `--json <text>` — plain JSON; covers primitive and structured *data* keys via a
  total parser.
- `--justin <text>` — **Justin** (endo's `packages/marshal/src/marshal-justin.js`),
  the JS-expression superset marshal uses for passables. Extends JSON with
  `bigint`, `undefined`, symbols, and **remotable references via slots**, read by
  the existing total Justin reader — no `eval`.
- `--shon <text>` — **SHON** (Shell-friendly Object Notation): a quote-light
  surface for the same passable space, ergonomic to type in a shell or form. Not
  yet vendored in this repo; a dependency this vocabulary introduces (see Known
  Gaps).
- `--ref <pet-name>`, or a bare `@pet-name:edge` — a **remotable** key or value,
  resolved through the agent's name graph exactly like `send`'s embedded
  `@pet-name` references (`packages/cli/src/message-parse.js`). This is how you
  key a map on a *capability*.
- `--text` / `--stdin` / `--path` / `--bigint` — the same scalar shorthands
  `store` already offers, for the common cases. Default when no flag is given is
  `--text`, keeping the common `endo map m set alice @bob` readable.

**Deterministic halting is a hard requirement, not a nicety.** All three DSLs
(JSON, Justin, SHON) are *total, non-evaluating* decoders: they parse to passable
data without invoking user code, so a key expression can neither diverge nor
execute. This is exactly why the vocabulary must **not** accept raw `eval`-style
source for a key (unlike `endo eval`, whose purpose *is* to run code): a key is
*data*, decoded → `harden`ed → `M.scalar()`/`M.key()`-checked before it ever
touches the store. Output is symmetric: `get`/`keys`/`values`/`entries`/`snapshot`
render passables back in the same encodings (`--out json|justin|shon`, default a
human Justin-ish render), so round-tripping a key through the shell is lossless
for data and yields a `@pet-name` for remotables.

#### WUI (the "spaces" web UI)

The chat client's **spaces** (`packages/space-*`) are the WUI. A new **Store
Space** presents a live `MapStore`/`SetStore` as a table with the same verbs as
direct-manipulation actions, mirroring how the File Explorer Space
(`packages/space-file-explorer`) exposes "creating / renaming / removing
entries":

- **New Map / New Set / New Weak…** buttons ⇒ the `mk*` constructors.
- One row per entry, with **＋ Add entry** (`init`/`add`), inline **edit value**
  (`set`), **✕** (`delete`), a **size** badge, and a live-updating table fed by a
  `follow`-style subscription.
- **Snapshot** action ⇒ binds a `CopyMap`/`CopySet` under a new pet name — a value
  the user can then drag into another space.
- A shared **key/value editor** widget carrying the same encoding selector as the
  CLI (JSON / Justin / SHON / pick-a-capability), the capability picker resolving
  `@pet-name` from the space's inventory. Same total-decoder guarantee: the form
  **never evals**.

The web verbs and CLI verbs are intentionally the same words
(`add`/`set`/`get`/`delete`/`snapshot`) so documentation and mental model transfer
between the two surfaces.

## Dependencies

| Design / package | Relationship |
|---|---|
| `@endo/patterns` | Provides `M`, `Key` comparison, and `makeCopyMap`/`makeCopySet` for `snapshot()`. Reused, not modified. |
| `@endo/exo` | Provides `makeExo` for the guarded store object. Reused. |
| daemon `marshal` formula (`src/formula-record.js`) | The body+slots durable serialization we reuse for keys/values. |
| daemon formula graph and `store-controller.js` | The refcount/retention edges strong entries must join, plus the collection callback that drops weak-key entries. |
| `@endo/marshal` `makeEncodePassable` | Canonical rank-order encoding for every key and the indexed range scans of sorted stores. |
| `synced-store` (`synced_store_entry`) | Precedent for a passable-payload SQLite table; a later phase may replicate stores across peers the same way. |
| `packages/cli` (`endo.js`, `message-parse.js`) | Host of the `mk*` constructors, the `endo map`/`endo set` verb groups, and the `@pet-name` key/value reference syntax. |
| `marshal-justin.js` (`@endo/marshal`) | The total, non-evaluating Justin decoder the CLI/WUI use to accept passable keys/values (`--justin`, `--out justin`). |
| SHON decoder | **Deferred.** The authoritative sources are
  [kriskowal.com/shon](https://kriskowal.com/shon) and [kriskowal.com/yay](https://kriskowal.com/yay); post a scholar to ingest before implementation.
  See design decision 11. |
| `@endo/justin` | The total, non-evaluating Justin decoder (companion spec at
  [kriskowal.com/yay](https://kriskowal.com/yay)) the CLI/WUI use to accept passable keys/values
  (`--justin`, `--out justin`). |
| `packages/space-*` (spaces WUI) | Host of the new **Store Space**; the File Explorer Space is the pattern for a capability-backed, direct-manipulation table. |

## Phased Implementation

**Phase 1 — durable strong `MapStore`.** Land `collection-store` with `kind:
'map'`, its entry schema, `makeMapStore`, and scalar (`M.scalar()`) keys.
Prove all mutator/query throw conditions, strong retention for remotable keys
and values, and restart persistence. In the next incremental change in this
phase, broaden the same map to full `M.key()` keys, including nested remotables,
and add its restart-persistence coverage. This establishes the common codec,
formula cleanup, and strong edge accounting.

**Phase 2 — durable strong `SetStore`.** Add `kind: 'set'`, `makeSetStore`, and
the `add` / membership / enumeration / `CopySet` surface using the proven
strong-entry substrate. Include a restart-persistence test.

**Phase 3 — weak variants (`WeakMapStore` / `WeakSetStore`).** Add the two weak
kinds and the reverse weak-key index. Prove that an entry does not retain its
remotable key, that collecting the key removes the entry and releases a weak
map's retained value, and that restart reconstructs the weak index before
serving the store. Include restart-persistence tests while the key remains
live, plus formula-collection tests for entry removal.

This phase carries the family's **ERTP integration test** (per kriskowal/garden#59,
motivated by the ERTP mention in kriskowal/garden#58). An ERTP issuer is
canonically implemented over a `WeakMapStore` — the ledger that maps each purse
and payment (a remotable) to its `AmountMath` balance — so building an issuer/mint
on the daemon's `WeakMapStore` exercises the weak substrate end-to-end the way real
consumers do: keys held weakly by remotable identity, entries surviving a daemon
restart while the purse/payment remotables remain live, and ledger entries dropping
when a payment is collected. The integration test drives a minimal ERTP issuer kit
(mint → purse → deposit/withdraw/transfer) whose ledger is a daemon `WeakMapStore`,
asserting conservation of `Amount` across a create → mint → transfer → **restart** →
balances-intact sequence. This makes ERTP a first-class acceptance target for the
weak variants rather than a synthetic micro-test, and validates that the daemon's
`WeakMapStore` is a drop-in substrate for the primary real-world consumer of one.

**Phase 4 — sorted variants and range queries.** Add `SortedMapStore` and
`SortedSetStore`, `makeEncodePassable` key-rank encoding, the composite SQLite
index, and `keys(pattern, bounds)` / `values` / `entries` scans. Test arbitrary
`M.key()` ordering, pattern covers, inclusive/exclusive bounds, `O(log n + k)`
query-plan use, and restart persistence for each sorted variant.

**Phase 5 — parity polish.** `addAll`/`clear`, lazy iterators, and optional
multiplayer replication via the synced-store substrate.

**Phase 6 — human surfaces (CLI + WUI).** The command vocabulary specified in
*Design → CLI and WUI command vocabulary*: the `mk*` constructors, the
`endo map`/`endo set` (and weak) verb groups, the typed key/value encodings
(`--json`/`--justin`/`--shon`/`@pet-name`) over a total non-evaluating decoder,
and the chat client's **Store Space**. Can land incrementally alongside any of
Phases 1–4 (the CLI `map`/`set` verbs need only the methods a given phase has
shipped), but is called out as its own phase so the human-facing vocabulary is a
tracked deliverable rather than an afterthought. SHON support (`--shon`) is
gated on vendoring a SHON decoder (Known Gaps); JSON/Justin/`@pet-name` need no
new dependency.

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

4. **Scalar first, `M.key()` next.** Scalar keys make the first MapStore small
   and focused. Full passable key support follows on the same strong substrate,
   before the other collection variants, so the family does not permanently
   inherit a scalar-only limitation.

5. **`snapshot()` returns a `CopyMap`.** This bridges the mutable durable store
   to a passable value symmetric with the existing write-once `storeValue`, and
   reuses `@endo/patterns`' `makeCopyMap` so the result is pattern-matchable and
   CapTP-safe.

6. **Indexed rank scans for sorted stores.** `makeEncodePassable` produces the
   canonical rank order that pattern rank covers understand. Persisting it,
   rather than sorting marshalled bodies at read time, makes bounded scans an
   indexed SQLite operation over arbitrary passable keys.

7. **Arrays over live iterators in v1.** Keeps the CapTP boundary simple.

8. **`mk*` constructors flat; per-store verbs in a named group.** Constructors
   join the existing flat `mk*` family (`mkdir`/`mkhost`/`mkguest`/`mktmp`) so
   `mkmap`/`mkset` read as siblings. The ~10 interface methods per store go under
   `endo map <name> …` / `endo set <name> …` subcommand groups rather than flat
   top-level verbs — the flat namespace would collide (`get`, `remove`, the
   write-once `store`) and swamp `endo --help`. This introduces the CLI's first
   subcommand groups, a departure the method count justifies.

9. **Keys expressed via total, non-evaluating DSLs — never `eval`.** A key on a
   CLI or in a form is *data*, so it is accepted only through JSON, Justin, or
   SHON decoders (plus `@pet-name` for remotables), each of which is total
   (guaranteed to halt) and does not run user code. Raw source (as in
   `endo eval`) is deliberately disallowed for keys: it would let an untrusted
   key expression diverge or execute. This directly answers the review's
   requirement that keys be "a deterministically halting DSL for passable keys."

10. **Same verbs across CLI and WUI.** The Store Space uses the same words
   (`add`/`set`/`get`/`delete`/`snapshot`) and the same encoding selector as the
   CLI, so the mental model and documentation transfer between surfaces; the WUI
   is a direct-manipulation skin over the identical vocabulary, not a second one.

11. **Defer `--shon` until scholar ingests kriskowal.com/shon + kriskowal.com/yay.**
   Kriskowal posted that SHON and YAY (YET Another YAML) live at those URLs; post
   a scholar to ingest before implementing the `--shon` key/value encoding. This keeps
   the `--json`/`--justin`/`@pet-name` encodings implementable immediately with no new
   dependency, while deferring the SHON decoder until its spec is ingested.

12. **Body serialization and rank order are separate columns.** Sort order is
   carried solely by `key_rank` (`makeEncodePassable`, an order-preserving
   encoding); the `*_body`/`*_slots` columns are a value representation with no
   ordering role. This makes the value body a swap-out: the marshal body may
   later become a **CBOR-encoded passable** with no effect on ordering, indexes,
   or scans. A key still requires `key_rank = makeEncodePassable` or an
   equivalent order-preserving codec; values need no rank encoding. General /
   canonical CBOR is not order-preserving and is therefore never a candidate
   for `key_rank` itself. See § Two encoding roles. Whether to adopt CBOR bodies
   is a downstream endo
   serialization call (deferred to @kriskowal / endo maintainers).

## Known Gaps and TODOs

- [ ] Phase 1 implementation and restart-persistence tests (closes #59).
- [ ] **ERTP integration test** on the `WeakMapStore` (Phase 3): a minimal
      issuer/mint/purse kit whose ledger is a daemon `WeakMapStore`, asserting
      `Amount` conservation across create → mint → transfer → restart →
      balances-intact, and weak-key drop when a payment is collected
      (kriskowal/garden#59, motivated by the ERTP mention in #58).
- [ ] Confirm the exact formula-graph callback contract for collection of a
      weak key, including transactional ordering of row deletion and value-edge
      release.
- [ ] Confirm the stable formula-id encoder/decoder passed to
      `makeEncodePassable` for remotable keys and nested remotables.
- [ ] Confirm the marshal body+slots encoding used by the `marshal` formula is
      reusable verbatim for entry rows, or whether store entries need their own
      thin codec. Either way this is the **body** encoding only; `key_rank`
      remains `makeEncodePassable` (or an equivalent order-preserving codec; see
      § Two encoding roles, Design Decision 12), so a future marshal->CBOR body
      swap is order-neutral.
- [ ] **Defer SHON.** See design decision 11: wait for a scholar to ingest
      kriskowal.com/shon and kriskowal.com/yay before vendorizing or depending on a
      SHON decoder. The `--shon` key/value encoding is not yet present; JSON, Justin,
      and `@pet-name` references need no new dependency.
- [ ] Confirm the CLI's first **subcommand groups** (`endo map`/`endo set`) are
      acceptable in the current Commander layout, or whether flat hyphenated
      verbs (e.g. `endo map-set`) are preferred for consistency with `send-value`.
- [ ] Decide the **default output encoding** for `get`/`keys`/`values`/`entries`
      (human Justin-ish render vs. strict `--out json`) and whether remotables
      render as `@pet-name` or as raw locators.
