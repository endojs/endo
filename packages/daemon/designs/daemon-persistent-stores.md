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
| daemon `store-controller.js` retention graph | The refcount/retention edges a store's remotable entries must join. |
| `synced-store` (`synced_store_entry`) | Precedent for a passable-payload SQLite table; a later phase may replicate stores across peers the same way. |
| `packages/cli` (`endo.js`, `message-parse.js`) | Host of the `mk*` constructors, the `endo map`/`endo set` verb groups, and the `@pet-name` key/value reference syntax. |
| `marshal-justin.js` (`@endo/marshal`) | The total, non-evaluating Justin decoder the CLI/WUI use to accept passable keys/values (`--justin`, `--out justin`). |
| SHON decoder | Shell-friendly Object Notation for `--shon`; **not yet in this repo** — a new dependency the human-surface vocabulary introduces (see Known Gaps). |
| `packages/space-*` (spaces WUI) | Host of the new **Store Space**; the File Explorer Space is the pattern for a capability-backed, direct-manipulation table. |

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
`addAll`/`clear`, and lazy iterators. Optional: multiplayer replication via the
synced-store substrate.

**Phase 5 — human surfaces (CLI + WUI).** The command vocabulary specified in
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

7. **`mk*` constructors flat; per-store verbs in a named group.** Constructors
   join the existing flat `mk*` family (`mkdir`/`mkhost`/`mkguest`/`mktmp`) so
   `mkmap`/`mkset` read as siblings. The ~10 interface methods per store go under
   `endo map <name> …` / `endo set <name> …` subcommand groups rather than flat
   top-level verbs — the flat namespace would collide (`get`, `remove`, the
   write-once `store`) and swamp `endo --help`. This introduces the CLI's first
   subcommand groups, a departure the method count justifies.

8. **Keys expressed via total, non-evaluating DSLs — never `eval`.** A key on a
   CLI or in a form is *data*, so it is accepted only through JSON, Justin, or
   SHON decoders (plus `@pet-name` for remotables), each of which is total
   (guaranteed to halt) and does not run user code. Raw source (as in
   `endo eval`) is deliberately disallowed for keys: it would let an untrusted
   key expression diverge or execute. This directly answers the review's
   requirement that keys be "a deterministically halting DSL for passable keys."

9. **Same verbs across CLI and WUI.** The Store Space uses the same words
   (`add`/`set`/`get`/`delete`/`snapshot`) and the same encoding selector as the
   CLI, so the mental model and documentation transfer between surfaces; the WUI
   is a direct-manipulation skin over the identical vocabulary, not a second one.

## Known Gaps and TODOs

- [ ] Phase 1 implementation and restart-persistence tests (closes #59).
- [ ] Decide whether `makeMapStore` accepts an options record (label, key
      shape) in v1 or defers all options to Phase 4.
- [ ] Confirm the marshal body+slots encoding used by the `marshal` formula is
      reusable verbatim for entry rows, or whether store entries need their own
      thin codec.
- [ ] Weak-reference GC semantics (Phase 3) against the retention graph.
- [ ] Vendor or depend on a **SHON** (Shell-friendly Object Notation) decoder for
      the `--shon` key/value encoding; not yet present in this repo. JSON,
      Justin, and `@pet-name` references need no new dependency.
- [ ] Confirm the CLI's first **subcommand groups** (`endo map`/`endo set`) are
      acceptable in the current Commander layout, or whether flat hyphenated
      verbs (e.g. `endo map-set`) are preferred for consistency with `send-value`.
- [ ] Decide the **default output encoding** for `get`/`keys`/`values`/`entries`
      (human Justin-ish render vs. strict `--out json`) and whether remotables
      render as `@pet-name` or as raw locators.
