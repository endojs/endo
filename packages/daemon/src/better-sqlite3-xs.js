// @ts-nocheck
/* eslint-disable no-underscore-dangle, max-classes-per-file,
   class-methods-use-this, no-undef -- this module is bundled
   into the XS daemon (no Node-style globalThis / class-style
   linting); the underscore-dunder convention is consistent with
   the rest of bus-daemon-rust-xs.js. */
// XS-side adapter that presents a `better-sqlite3`-compatible
// surface backed by the Rust supervisor's SQLite host functions
// (powers/sqlite.rs registered in xsnap, aliased to host* in
// host_aliases.js).
//
// The surface this module emulates is a strict subset of
// better-sqlite3, exactly the methods daemon-database.js uses:
//
//   const db = new Database(path);
//   db.pragma(stmt);
//   db.exec(sql);
//   const stmt = db.prepare(sql);
//   stmt.run(...args);   // -> { changes, lastInsertRowid }
//   stmt.get(...args);   // -> object | undefined
//   stmt.all(...args);   // -> object[]
//   db.close();
//
// Rusqlite returns INTEGER columns as i64; the JSON wire format
// tags them as `{"$bigint": "<digits>"}` so they round-trip
// without loss.  We project them back to plain numbers when they
// fit in a safe integer (matching better-sqlite3's default
// behaviour) and to BigInt otherwise.

/* global hostSqliteOpen, hostSqliteClose, hostSqliteExec,
   hostSqlitePrepare, hostSqliteStmtRun, hostSqliteStmtGet,
   hostSqliteStmtAll, hostSqliteStmtFinalize */

const isError = result =>
  typeof result === 'string' && result.startsWith('Error: ');

const throwIfError = result => {
  if (isError(result)) throw new Error(result.slice('Error: '.length));
  return result;
};

/**
 * Decode the FFI tag for an integer cell.  Rusqlite serialises
 * INTEGERs as `{"$bigint": "<digits>"}`; we materialise as a
 * Number when safe, BigInt otherwise.  Better-sqlite3 returns
 * Number by default, so the safe-integer projection keeps tests
 * comparing apples to apples.
 */
const decodeBigintTag = obj => {
  const s = obj.$bigint;
  // BigInt parses negative and positive decimal strings.
  const big = BigInt(s);
  // Number.MAX_SAFE_INTEGER / MIN_SAFE_INTEGER guard.
  if (
    big <= BigInt(Number.MAX_SAFE_INTEGER) &&
    big >= BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    return Number(big);
  }
  return big;
};

const decodeBytesTag = obj => {
  // The Rust side base64-encodes BLOB columns.  daemon-database.js
  // never reads BLOB columns today; if this changes we'll wire in
  // base64 decoding here.
  return obj.$bytes;
};

const decodeCell = v => {
  if (v === null) return null;
  if (typeof v === 'object') {
    if ('$bigint' in v) return decodeBigintTag(v);
    if ('$bytes' in v) return decodeBytesTag(v);
  }
  return v;
};

const decodeRow = row => {
  if (row === null || row === undefined) return undefined;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = decodeCell(v);
  }
  return out;
};

/**
 * Encode a JS value as a JSON-serialisable parameter recognised by
 * the Rust side (numbers, strings, bigint, Uint8Array).
 */
const encodeParam = v => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'bigint') return { $bigint: v.toString() };
  if (v instanceof Uint8Array) {
    // Base64 encode for transit.  Use globalThis.btoa if present
    // (XS provides it via @endo/base64 polyfill in ses_boot.js);
    // fall back to a minimal encoder otherwise.
    const bin = Array.from(v, b => String.fromCharCode(b)).join('');
    const b64 =
      typeof globalThis.btoa === 'function'
        ? globalThis.btoa(bin)
        : (() => {
            throw new Error('No base64 encoder available for Uint8Array');
          })();
    return { $bytes: b64 };
  }
  throw new TypeError(
    `Unsupported SQL parameter type: ${typeof v} (${String(v)})`,
  );
};

const encodeParams = args => args.map(encodeParam);

class XsStatement {
  constructor(stmtHandle) {
    this._handle = stmtHandle;
    this._finalized = false;
  }

  _params(args) {
    return JSON.stringify(encodeParams(args));
  }

  run(...args) {
    if (this._finalized) throw new Error('Statement is finalized');
    const result = throwIfError(
      hostSqliteStmtRun(this._handle, this._params(args)),
    );
    const parsed = JSON.parse(result);
    return {
      changes: decodeCell(parsed.changes),
      lastInsertRowid: decodeCell(parsed.lastInsertRowid),
    };
  }

  get(...args) {
    if (this._finalized) throw new Error('Statement is finalized');
    const result = throwIfError(
      hostSqliteStmtGet(this._handle, this._params(args)),
    );
    if (result === 'null') return undefined;
    return decodeRow(JSON.parse(result));
  }

  all(...args) {
    if (this._finalized) throw new Error('Statement is finalized');
    const result = throwIfError(
      hostSqliteStmtAll(this._handle, this._params(args)),
    );
    return JSON.parse(result).map(decodeRow);
  }

  finalize() {
    if (this._finalized) return;
    this._finalized = true;
    hostSqliteStmtFinalize(this._handle);
  }
}

class XsDatabase {
  constructor(path) {
    this._handle = throwIfError(hostSqliteOpen(path));
    this._closed = false;
  }

  prepare(sql) {
    if (this._closed) throw new Error('Database is closed');
    const stmtHandle = throwIfError(hostSqlitePrepare(this._handle, sql));
    return new XsStatement(stmtHandle);
  }

  exec(sql) {
    if (this._closed) throw new Error('Database is closed');
    const result = hostSqliteExec(this._handle, sql);
    if (isError(result)) throw new Error(result.slice('Error: '.length));
  }

  /**
   * better-sqlite3 supports `db.pragma('journal_mode = WAL')`
   * (returns rows) and `db.pragma('foreign_keys = ON')`
   * (no rows expected).  daemon-database.js uses both as
   * fire-and-forget — we model them as exec() calls with the
   * `PRAGMA ` prefix prepended.
   */
  pragma(stmt) {
    this.exec(`PRAGMA ${stmt};`);
  }

  close() {
    if (this._closed) return;
    this._closed = true;
    hostSqliteClose(this._handle);
  }
}

export default XsDatabase;
