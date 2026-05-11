# SQLite Host Methods for Endo Rust (XS)

| | |
|---|---|
| **Created** | 2026-04-14 |
| **Updated** | 2026-04-16 |
| **Author** | Kris Kowal (prompted) |
| **Status** | **Complete** |
| **Supersedes** | designs/daemon-endor-sqlite.md |

## Status

All phases implemented.

- `rust/endo/xsnap/src/powers/sqlite.rs` — 9 host functions,
  `DB_MAP` / `STMT_MAP` handle maps, `$bigint` / `$bytes` FFI
  encoding, WAL-mode defaults.
- `rust/endo/xsnap/src/powers/mod.rs` — `pub mod sqlite`
- `rust/endo/xsnap/src/lib.rs` — `powers::sqlite::register()`
  called in power registration; `powers::sqlite::CALLBACKS`
  included in the snapshot callback table.
- `rust/endo/xsnap/Cargo.toml` — `rusqlite` with `bundled`
  feature.
- `rust/endo/xsnap/src/host_aliases.js` — 9 sqlite alias
  entries.
- `packages/daemon/src/bus-daemon-rust-xs-powers.js` —
  `makeXsSqlitePowers()` with `encodeValue` / `decodeValue` /
  `decodeRow` helpers.
- 14 unit tests covering open/close, exec, prepare, run, get,
  all, columns, finalize, bigint round-trip, blob round-trip,
  null values, named params, transactions, and cleanup on close.

## Motivation

The Endo daemon's formula graph, pet stores, and content store
currently use flat files and directories for persistence.
SQLite offers ACID transactions, indexed queries, and WAL-mode
concurrency that would benefit the formula graph and future
structured-storage needs (e.g., FTS for agent memory, event logs).

The Node.js daemon can use the built-in `node:sqlite` module
(v22+, `DatabaseSync` / `StatementSync`).
The XS daemon running inside the Rust host has no such module and
must expose SQLite through Rust host functions, following the same
handle-based pattern used for filesystem (`DIR_MAP`, `FILE_MAP`)
and cryptography (`HASHER_MAP`).

This design adds a `powers/sqlite.rs` module to the `xsnap` crate
and a JS wrapper (`makeXsSqlitePowers`) that presents an API
aligned with `node:sqlite` so that daemon code can use either
backend interchangeably.

## Type Mapping

The key constraint is that all values returned by the SQLite
bindings must be passable — expressible by Endo's marshalling.

| SQLite type | JS type | Notes |
|-------------|---------|-------|
| NULL | `null` | |
| INTEGER | `bigint` | Always bigint, even for small values |
| REAL | `number` | JS float64 |
| TEXT | `string` | |
| BLOB | `Uint8Array` | Binary data |

### Implications

- **INTEGER is always bigint.**
  Unlike `node:sqlite`'s opt-in `setReadBigInts`, the XS bindings
  always return `bigint` for INTEGER columns.
  This avoids silent precision loss for values beyond 2^53 and
  removes the need for a per-statement mode flag.
- **BLOB is Uint8Array, not a JSON sentinel.**
  There is no `$blob` encoding, no smallcaps, no fancy JSON
  encoding of any kind in the user-facing API.
  The JS wrapper presents clean `Uint8Array` values to callers.
- All five JS types (`null`, `bigint`, `number`, `string`,
  `Uint8Array`) are passable values that Endo's marshalling can
  handle.

## Architecture

### Handle maps

Two global handle maps, matching the existing `DIR_MAP` /
`FILE_MAP` / `HASHER_MAP` pattern:

```rust
// rust/endo/xsnap/src/powers/sqlite.rs

static NEXT_DB_HANDLE: AtomicU32 = AtomicU32::new(1);
static DB_MAP: Mutex<Option<HashMap<u32, Connection>>>
    = Mutex::new(None);

static NEXT_STMT_HANDLE: AtomicU32 = AtomicU32::new(1);
static STMT_MAP: Mutex<Option<HashMap<u32, PreparedStmt>>>
    = Mutex::new(None);
```

### Statement lifetime

`rusqlite::Statement` borrows from `Connection`
(`&'conn Connection`), so storing both in separate static maps
creates a self-referential borrow that Rust rejects.

Solution: `STMT_MAP` stores the SQL text and owning db handle,
not a live `Statement`.
Each `run` / `get` / `all` call locks `DB_MAP`, gets the
`Connection`, calls `conn.prepare(&sql)`, executes, and drops the
`Statement`.
SQLite internally caches prepared-statement bytecode, so the
re-prepare cost is negligible for the daemon's metadata workload.

```rust
struct PreparedStmt {
    db_handle: u32,
    sql: String,
}
```

Lock ordering: always lock `STMT_MAP` first (to extract
`db_handle` and `sql`), drop that lock, then lock `DB_MAP`.
Never hold both locks simultaneously.

### FFI serialization

Since XS host calls pass strings, values cross the FFI boundary
as JSON.
This is internal plumbing — the JS wrapper presents clean typed
values to callers.

#### Parameters (JS → Rust)

- **Positional**: JSON array — `'[1, "hello", null]'`
- **Named**: JSON object — `'{"$name": "hello", "$id": 1}'`
- **Empty**: `'null'` or `'[]'`

Typed values that JSON cannot represent natively use tagged
encodings in the FFI envelope:

| JS type | FFI JSON encoding | Rust conversion |
|---------|-------------------|-----------------|
| `null` | `null` | NULL |
| `boolean` | `true` / `false` | INTEGER (1 / 0) |
| `number` | number | REAL |
| `string` | string | TEXT |
| `bigint` | `{"$bigint": "123"}` | INTEGER |
| `Uint8Array` | `{"$bytes": "<base64>"}` | BLOB |

The `$bigint` and `$bytes` tags are internal to the FFI layer.
The JS `encodeParams` helper converts `bigint` and `Uint8Array`
values before calling the host function; the Rust side decodes
them.

#### Results (Rust → JS)

Rows are returned as JSON strings from Rust to JS.

- `stmtGet` → single JSON object or `"null"`
- `stmtAll` → JSON array of objects
- `stmtRun` → `'{"changes": "<bigint>", "lastInsertRowid": "<bigint>"}'`

| SQLite type | FFI JSON encoding | JS wrapper conversion |
|-------------|-------------------|-----------------------|
| NULL | `null` | `null` |
| INTEGER | `{"$bigint": "<string>"}` | `BigInt(value)` |
| REAL | number | `number` (passthrough) |
| TEXT | string | `string` (passthrough) |
| BLOB | `{"$bytes": "<base64>"}` | `Uint8Array` via base64 decode |

The JS wrapper's `decodeRow` helper walks each row object and
converts tagged values back to native `bigint` and `Uint8Array`.

### Database open defaults

`sqliteOpen(path)` applies these pragmas automatically:

- `PRAGMA journal_mode=WAL;` — concurrent read performance
- `PRAGMA foreign_keys=ON;`
- `busy_timeout(5000)` — 5 s busy wait

Path `":memory:"` opens an in-memory database.

## Host functions

9 functions, registered in `powers/sqlite.rs`:

| Rust function | Registration name | argc | JS signature | Return |
|---|---|---|---|---|
| `host_sqlite_open` | `sqliteOpen` | 1 | `sqliteOpen(path)` | handle (number) or `"Error: ..."` |
| `host_sqlite_close` | `sqliteClose` | 1 | `sqliteClose(dbH)` | undefined |
| `host_sqlite_exec` | `sqliteExec` | 2 | `sqliteExec(dbH, sql)` | undefined or `"Error: ..."` |
| `host_sqlite_prepare` | `sqlitePrepare` | 2 | `sqlitePrepare(dbH, sql)` | handle (number) or `"Error: ..."` |
| `host_sqlite_stmt_run` | `sqliteStmtRun` | 2 | `sqliteStmtRun(stmtH, paramsJson)` | JSON `{changes, lastInsertRowid}` |
| `host_sqlite_stmt_get` | `sqliteStmtGet` | 2 | `sqliteStmtGet(stmtH, paramsJson)` | JSON object, `"null"`, or error |
| `host_sqlite_stmt_all` | `sqliteStmtAll` | 2 | `sqliteStmtAll(stmtH, paramsJson)` | JSON array or error |
| `host_sqlite_stmt_columns` | `sqliteStmtColumns` | 1 | `sqliteStmtColumns(stmtH)` | JSON array of `{name, type}` |
| `host_sqlite_stmt_finalize` | `sqliteStmtFinalize` | 1 | `sqliteStmtFinalize(stmtH)` | undefined |

Registration follows the existing pattern:

```rust
pub unsafe fn register(machine: &crate::Machine) {
    machine.define_function("sqliteOpen", host_sqlite_open, 1);
    machine.define_function("sqliteClose", host_sqlite_close, 1);
    machine.define_function("sqliteExec", host_sqlite_exec, 2);
    machine.define_function("sqlitePrepare", host_sqlite_prepare, 2);
    machine.define_function("sqliteStmtRun", host_sqlite_stmt_run, 2);
    machine.define_function("sqliteStmtGet", host_sqlite_stmt_get, 2);
    machine.define_function("sqliteStmtAll", host_sqlite_stmt_all, 2);
    machine.define_function(
        "sqliteStmtColumns", host_sqlite_stmt_columns, 1,
    );
    machine.define_function(
        "sqliteStmtFinalize", host_sqlite_stmt_finalize, 1,
    );
}
```

### Cleanup on database close

`sqliteClose` scans `STMT_MAP` and removes all entries whose
`db_handle` matches the closing database, preventing dangling
statement handles.

```rust
fn host_sqlite_close(the: *mut XsMachine) {
    let handle = /* read arg 0 as u32 */;
    // Remove associated statements first
    let mut stmts = get_stmt_map();
    stmts.retain(|_, s| s.db_handle != handle);
    drop(stmts);
    // Then remove the connection
    let mut dbs = get_db_map();
    dbs.remove(&handle);
}
```

## Host alias mappings

Added to `rust/endo/xsnap/src/host_aliases.js`:

```js
// powers/sqlite.rs
hostSqliteOpen: 'sqliteOpen',
hostSqliteClose: 'sqliteClose',
hostSqliteExec: 'sqliteExec',
hostSqlitePrepare: 'sqlitePrepare',
hostSqliteStmtRun: 'sqliteStmtRun',
hostSqliteStmtGet: 'sqliteStmtGet',
hostSqliteStmtAll: 'sqliteStmtAll',
hostSqliteStmtColumns: 'sqliteStmtColumns',
hostSqliteStmtFinalize: 'sqliteStmtFinalize',
```

## JS wrapper

`makeXsSqlitePowers()` in
`packages/daemon/src/bus-daemon-rust-xs-powers.js`, following the
`makeXsFilePowers()` / `makeXsCryptoPowers()` pattern.

The API is synchronous, matching `node:sqlite`'s `DatabaseSync` /
`StatementSync` — XS host calls are inherently synchronous.

```js
/* global hostSqliteOpen, hostSqliteClose, hostSqliteExec,
   hostSqlitePrepare, hostSqliteStmtRun, hostSqliteStmtGet,
   hostSqliteStmtAll, hostSqliteStmtColumns,
   hostSqliteStmtFinalize, harden, TextEncoder, TextDecoder */

/** Base64 encode a Uint8Array for FFI transport. */
const toBase64 = bytes => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

/** Base64 decode a string to Uint8Array. */
const fromBase64 = str => {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

/**
 * Encode a JS param value for FFI JSON transport.
 * Converts bigint → {$bigint: string} and
 * Uint8Array → {$bytes: base64}.
 */
const encodeValue = value => {
  if (typeof value === 'bigint') {
    return { $bigint: String(value) };
  }
  if (value instanceof Uint8Array) {
    return { $bytes: toBase64(value) };
  }
  return value;
};

/**
 * Decode a FFI JSON result value back to JS.
 * Converts {$bigint: string} → bigint and
 * {$bytes: base64} → Uint8Array.
 */
const decodeValue = value => {
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  ) {
    if ('$bigint' in value) {
      return BigInt(value.$bigint);
    }
    if ('$bytes' in value) {
      return fromBase64(value.$bytes);
    }
  }
  return value;
};

/** Decode all values in a row object. */
const decodeRow = row => {
  if (row === null) {
    return null;
  }
  const result = {};
  for (const key of Object.keys(row)) {
    result[key] = decodeValue(row[key]);
  }
  return harden(result);
};

export const makeXsSqlitePowers = () => {
  const openDatabase = path => {
    const dbHandle = hostSqliteOpen(path);
    if (
      typeof dbHandle === 'string' &&
      dbHandle.startsWith('Error: ')
    ) {
      throw new Error(dbHandle.slice(7));
    }
    let isOpen = true;

    const close = () => {
      if (isOpen) {
        hostSqliteClose(dbHandle);
        isOpen = false;
      }
    };

    const exec = sql => {
      const result = hostSqliteExec(dbHandle, sql);
      if (
        typeof result === 'string' &&
        result.startsWith('Error: ')
      ) {
        throw new Error(result.slice(7));
      }
    };

    const prepare = sql => {
      const stmtHandle = hostSqlitePrepare(dbHandle, sql);
      if (
        typeof stmtHandle === 'string' &&
        stmtHandle.startsWith('Error: ')
      ) {
        throw new Error(stmtHandle.slice(7));
      }

      const encodeParams = args => {
        if (
          args.length === 1 &&
          typeof args[0] === 'object' &&
          args[0] !== null &&
          !Array.isArray(args[0]) &&
          !(args[0] instanceof Uint8Array)
        ) {
          // Named parameters — encode each value
          const obj = args[0];
          const encoded = {};
          for (const key of Object.keys(obj)) {
            encoded[key] = encodeValue(obj[key]);
          }
          return JSON.stringify(encoded);
        }
        return JSON.stringify(args.map(encodeValue));
      };

      const assertOk = result => {
        if (
          typeof result === 'string' &&
          result.startsWith('Error: ')
        ) {
          throw new Error(result.slice(7));
        }
      };

      const run = (...params) => {
        const result = hostSqliteStmtRun(
          stmtHandle,
          encodeParams(params),
        );
        assertOk(result);
        const parsed = JSON.parse(result);
        return harden({
          changes: BigInt(parsed.changes),
          lastInsertRowid: BigInt(parsed.lastInsertRowid),
        });
      };

      const get = (...params) => {
        const result = hostSqliteStmtGet(
          stmtHandle,
          encodeParams(params),
        );
        assertOk(result);
        const parsed = JSON.parse(result);
        if (parsed === null) {
          return undefined;
        }
        return decodeRow(parsed);
      };

      const all = (...params) => {
        const result = hostSqliteStmtAll(
          stmtHandle,
          encodeParams(params),
        );
        assertOk(result);
        const parsed = JSON.parse(result);
        return harden(parsed.map(decodeRow));
      };

      const columns = () => {
        const result = hostSqliteStmtColumns(stmtHandle);
        assertOk(result);
        return harden(JSON.parse(result));
      };

      const finalize = () => {
        hostSqliteStmtFinalize(stmtHandle);
      };

      return harden({ run, get, all, columns, finalize });
    };

    return harden({
      close,
      exec,
      prepare,
      get open() {
        return isOpen;
      },
    });
  };

  return harden({ openDatabase });
};
harden(makeXsSqlitePowers);
```

## TypeScript types

Added to `packages/daemon/src/types.d.ts`:

```typescript
export type SqliteValue =
  | null
  | bigint
  | number
  | string
  | Uint8Array;

export type SqliteParams =
  | SqliteValue[]
  | [Record<string, SqliteValue>];

export type StatementSync = {
  run(...params: SqliteParams): {
    changes: bigint;
    lastInsertRowid: bigint;
  };
  get(
    ...params: SqliteParams
  ): Record<string, SqliteValue> | undefined;
  all(
    ...params: SqliteParams
  ): Array<Record<string, SqliteValue>>;
  columns(): Array<{ name: string; type: string | null }>;
  finalize(): void;
};

export type DatabaseSync = {
  close(): void;
  exec(sql: string): void;
  prepare(sql: string): StatementSync;
  readonly open: boolean;
};

export type SqlitePowers = {
  openDatabase(path: string): DatabaseSync;
};
```

## Transactions

No special host functions needed.
Transactions use `exec()` directly:

```js
db.exec('BEGIN');
try {
  // ... operations ...
  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
  throw e;
}
```

This matches `node:sqlite` which also controls transactions via
`exec`.

## Cargo dependency

Add to `rust/endo/xsnap/Cargo.toml`:

```toml
rusqlite = { version = "0.31", features = ["bundled"] }
```

The `bundled` feature compiles SQLite from C source, eliminating
system library dependencies.
Adds ~2 MB to the binary and ~30 s to the first build (cached
thereafter).

`serde_json` and `base64` are already dependencies.

## Omitted from v1

These can be added as follow-up work:

- **`iterate()`** — would need a cursor handle and a third map.
  The daemon can use `all()` for small result sets or page with
  `LIMIT`/`OFFSET`.
- **User-defined functions** (`db.function(name, fn)`) — requires
  calling back into JS from Rust, which is complex with XS FFI.
- **`setAllowBareNamedParameters`** — use `$` / `:` / `@`
  prefix convention.

## Files to create or modify

| File | Change |
|---|---|
| `rust/endo/xsnap/src/powers/sqlite.rs` | **New.** DB_MAP, STMT_MAP, 9 host functions, JSON param/row conversion with `$bigint`/`$bytes` tags, `register()`. |
| `rust/endo/xsnap/src/powers/mod.rs` | Add `pub mod sqlite;` |
| `rust/endo/xsnap/src/lib.rs` | Add `powers::sqlite::register(self);` in power registration |
| `rust/endo/xsnap/Cargo.toml` | Add `rusqlite` dependency |
| `rust/endo/xsnap/src/host_aliases.js` | Add 9 sqlite alias entries |
| `packages/daemon/src/bus-daemon-rust-xs-powers.js` | Add `makeXsSqlitePowers()` factory and export |
| `packages/daemon/src/types.d.ts` | Add `SqlitePowers`, `DatabaseSync`, `StatementSync` types |

## Implementation phases

1. Add `rusqlite` to `Cargo.toml`, verify compilation with
   `bundled` feature. **(done)**
2. Create `powers/sqlite.rs` with `DB_MAP`,
   `sqliteOpen` / `sqliteClose` / `sqliteExec`.
   Wire into `mod.rs` and `lib.rs`.
   Smoke-test: open in-memory db, exec `CREATE TABLE`, close.
   **(done)**
3. Add `sqlitePrepare` and statement functions
   (`stmtRun`, `stmtGet`, `stmtAll`, `stmtColumns`,
   `stmtFinalize`).
   Implement `$bigint` and `$bytes` encoding/decoding in the
   Rust JSON conversion layer. **(done)**
4. Add host aliases to `host_aliases.js`. **(done)**
5. Build JS `makeXsSqlitePowers()` wrapper with `encodeValue` /
   `decodeValue` / `decodeRow` helpers.
   Add types to `types.d.ts`. **(done)**
6. Integration test: open in-memory db, create table, insert rows
   with bigint and Uint8Array values, select, verify round-trip
   through XS with correct types. **(done)**

## Design decisions

1. **INTEGER always returns bigint.**
   Avoids silent precision loss and removes the need for a
   `setReadBigInts` mode flag.
   XS supports BigInt natively.
2. **BLOB returns Uint8Array, not a JSON sentinel.**
   The user-facing API has no `$blob` or smallcaps encoding.
   Binary data is presented as `Uint8Array` to callers.
3. **Internal FFI uses `$bigint` / `$bytes` tags in JSON.**
   JSON cannot represent bigint or binary natively.
   The tags are confined to the FFI layer — the JS wrapper
   converts them to/from native types.
   This is simpler than constructing XS typed arrays from Rust
   via low-level slot manipulation.
4. **Re-prepare instead of caching `Statement`.**
   Avoids the self-referential borrow problem.
   SQLite's internal bytecode cache makes re-prepare cheap.
5. **WAL mode by default.**
   Critical for concurrent read performance when the daemon
   evaluates formulas while GC scans the graph.
6. **Synchronous JS API.**
   Matches `node:sqlite`'s `DatabaseSync` and the XS host
   function calling convention (all host calls are synchronous).
7. **Explicit `finalize()` instead of GC.**
   XS host handles require explicit cleanup.
   `close()` also cleans up all associated statements.
8. **`run()` returns `{changes: bigint, lastInsertRowid: bigint}`.**
   Consistent with the "INTEGER is always bigint" rule.
   `lastInsertRowid` can exceed 2^53 for large tables.
9. **9 functions, not more.**
   Covers the CRUD surface needed for daemon storage.
   `iterate` and UDFs are deferred until needed.

## Prompt

> We are going to need endor to support host methods for sqlite
> database handles.
> Please propose a design in designs for Rust+XS endor support
> for sqlite.
> Research the Node.js API.
>
> Revised: All INTEGER → bigint, all REAL → number, BLOB →
> Uint8Array, no $blob sentinels or smallcaps.
> Values must be passable (Endo marshallable).
