# SQLite Persistence Migration

This document describes the migration from filesystem-based
persistence to SQLite for the Endo daemon.
It serves as a reference for implementing or migrating other
language implementations (e.g., Go/engo).

## Motivation

The daemon previously stored all state as individual files:
- One JSON file per formula (`statePath/formulas/AB/0001.json`)
- One file per pet name (`statePath/pet-store/AB/0001/myname`)
- One JSON file per synced store entry
  (`statePath/synced-pet-store/AB/0001/names/foo.json`)

This worked but had limitations:
- No transactional atomicity (formula writes were not even
  atomic — there was a TODO for write-then-rename)
- O(n) startup scan to rebuild the in-memory formula graph
- No efficient queries across stores (e.g., "what does persona
  B transitively retain?")
- Fragile ordering constraints ("disk before graph") to avoid
  inconsistency

SQLite resolves all of these with transactional writes,
indexed queries, and a single durable file.

## Database Location

The SQLite database is at `{statePath}/endo.sqlite`.
WAL mode is enabled for concurrent read performance.

## Schema (Version 1)

```sql
CREATE TABLE schema_version (
  version INTEGER NOT NULL
);

CREATE TABLE daemon_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE formula (
  number TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  body TEXT NOT NULL
);

CREATE TABLE pet_store_entry (
  store_number TEXT NOT NULL,
  store_type TEXT NOT NULL,
  name TEXT NOT NULL,
  formula_id TEXT NOT NULL,
  PRIMARY KEY (store_number, store_type, name)
);

CREATE TABLE synced_store_entry (
  store_number TEXT NOT NULL,
  name TEXT NOT NULL,
  locator TEXT,
  timestamp INTEGER NOT NULL,
  writer TEXT NOT NULL,
  PRIMARY KEY (store_number, name)
);

CREATE TABLE synced_store_meta (
  store_number TEXT PRIMARY KEY,
  local_clock INTEGER NOT NULL DEFAULT 0,
  remote_acked_clock INTEGER NOT NULL DEFAULT 0
);
```

## Table Descriptions

### `schema_version`

Single row containing the schema version integer.
Used for future schema migrations.

### `daemon_state`

Key-value store for daemon-level state.
Current keys:
- `root_nonce` — 64-char hex, the root entropy for deriving
  deterministic formula numbers.
- `public_key` — 64-char hex, Ed25519 public key (node ID).
- `private_key` — 64-char hex, Ed25519 private key seed.

Previously stored as `{statePath}/nonce` and
`{statePath}/keypair` files.

### `formula`

One row per formula.
- `number` — 64-char hex formula number
  (previously the `{head}{tail}` portion of the path
  `formulas/{head}/{tail}.json`).
- `type` — formula type string (e.g., `handle`, `host`,
  `guest`, `worker`, `pet-store`, etc.).
- `body` — full formula JSON, including the `type` field.

### `pet_store_entry`

Pet name to formula ID mappings.
- `store_number` — formula number of the pet store.
- `store_type` — one of `pet-store`, `mailbox-store`,
  `known-peers-store`.
- `name` — the pet name string.
- `formula_id` — the formula identifier
  (`{formulaNumber}:{nodeNumber}`).

Previously stored as individual files:
`{statePath}/{store_type}/{prefix}/{suffix}/{name}`
containing the formula ID as text.

### `synced_store_entry`

CRDT entries for synced (cross-daemon) pet stores.
- `store_number` — formula number of the synced store.
- `name` — the pet name string.
- `locator` — the locator URL string, or NULL for tombstones.
- `timestamp` — Lamport clock timestamp (integer).
- `writer` — node number of the peer that wrote this entry.

Previously stored as individual JSON files:
`{statePath}/synced-pet-store/{prefix}/{suffix}/names/{name}.json`

### `synced_store_meta`

Metadata for synced pet stores.
- `store_number` — formula number of the synced store.
- `local_clock` — current Lamport clock value.
- `remote_acked_clock` — highest clock value acknowledged by
  the remote peer (used for tombstone pruning).

Previously stored as:
`{statePath}/synced-pet-store/{prefix}/{suffix}/clock.json`

## Filesystem State That Remains

The **content store** (`{statePath}/store-sha256/`) remains
filesystem-based.
It stores content-addressed blobs (SHA256-keyed) used by
`ReadableTree` formulas.
Streaming binary data is better served by filesystem I/O than
SQLite blobs.

Worker state (`{statePath}/worker/`) and ephemeral state
(`{ephemeralStatePath}/`) also remain filesystem-based.

## In-Memory Architecture

The daemon still maintains in-memory data structures for
fast lookups and pub/sub:
- `formulaForId: Map<FormulaIdentifier, Formula>` — loaded
  on demand from SQLite, not pre-loaded at startup.
- Pet store bidirectional multimaps — loaded from SQLite when
  a store is instantiated.
- Synced store state maps — loaded from SQLite when a synced
  store is instantiated.

SQLite is the source of truth for persistence. The in-memory
structures are caches that are populated lazily and kept in
sync by writing through to SQLite on every mutation.

## Implementation Notes for Other Languages

### Node.js (`better-sqlite3`)

The Node.js implementation uses `better-sqlite3`, a native
SQLite binding that provides a synchronous API.
All operations are synchronous, wrapped in async functions
to maintain the existing interface.

### Go

For a Go implementation:
- Use `modernc.org/sqlite` (pure Go) or `github.com/mattn/go-sqlite3`
  (CGo).
- The schema is standard SQL — use the exact DDL above.
- Open the database with WAL mode for concurrent reads.
- Prepare statements once and reuse them.
- The migration logic reads the same filesystem layout
  described above.

### Key Invariants

1. **Formula writes must be durable before the formula ID
   enters the in-memory graph.** With SQLite, a successful
   INSERT guarantees durability (WAL mode with default
   synchronous=FULL).

2. **Pet store mutations must update both SQLite and the
   in-memory multimap.** The in-memory map is the fast path
   for reads; SQLite is the durable backing store.

3. **Synced store CRDT merge rules are unchanged.** The
   merge algorithm (higher timestamp wins, tombstone bias on
   tie, lexicographic writer tiebreaker) is application logic,
   not storage logic. SQLite just persists the result.

4. **Content store stays filesystem-based.** Do not move
   SHA256-addressed blobs into SQLite.
