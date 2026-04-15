//! SQLite host functions.
//!
//! Provides database access through handle-based APIs following the
//! same pattern as `DIR_MAP` / `FILE_MAP` / `HASHER_MAP`.
//!
//! JS calling convention:
//!   sqliteOpen(path) -> number (handle) or "Error: ..."
//!   sqliteClose(dbH) -> undefined
//!   sqliteExec(dbH, sql) -> undefined or "Error: ..."
//!   sqlitePrepare(dbH, sql) -> number (handle) or "Error: ..."
//!   sqliteStmtRun(stmtH, paramsJson) -> JSON {changes, lastInsertRowid}
//!   sqliteStmtGet(stmtH, paramsJson) -> JSON object, "null", or error
//!   sqliteStmtAll(stmtH, paramsJson) -> JSON array or error
//!   sqliteStmtColumns(stmtH) -> JSON array of {name, type}
//!   sqliteStmtFinalize(stmtH) -> undefined
//!
//! Type mapping (SQLite → FFI JSON → JS):
//!   NULL    → null         → null
//!   INTEGER → {$bigint: s} → bigint
//!   REAL    → number       → number
//!   TEXT    → string       → string
//!   BLOB    → {$bytes: b}  → Uint8Array (base64 in JSON)

use crate::ffi::*;
use crate::worker_io::{arg_str, set_result_string};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use rusqlite::{types::Value as SqlValue, Connection};
use serde_json::{json, Map, Value as JsonValue};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;

// ---------------------------------------------------------------------------
// Handle maps
// ---------------------------------------------------------------------------

static NEXT_DB_HANDLE: AtomicU32 = AtomicU32::new(1);
static DB_MAP: Mutex<Option<HashMap<u32, Connection>>> = Mutex::new(None);

static NEXT_STMT_HANDLE: AtomicU32 = AtomicU32::new(1);
static STMT_MAP: Mutex<Option<HashMap<u32, PreparedStmt>>> = Mutex::new(None);

struct PreparedStmt {
    db_handle: u32,
    sql: String,
}

fn get_db_map() -> std::sync::MutexGuard<'static, Option<HashMap<u32, Connection>>> {
    let mut guard = DB_MAP.lock().unwrap_or_else(|e| e.into_inner());
    if guard.is_none() {
        *guard = Some(HashMap::new());
    }
    guard
}

fn get_stmt_map() -> std::sync::MutexGuard<'static, Option<HashMap<u32, PreparedStmt>>> {
    let mut guard = STMT_MAP.lock().unwrap_or_else(|e| e.into_inner());
    if guard.is_none() {
        *guard = Some(HashMap::new());
    }
    guard
}

/// Convert a JSON parameter value to a rusqlite `Value`.
fn json_to_sql(v: &JsonValue) -> Result<SqlValue, String> {
    match v {
        JsonValue::Null => Ok(SqlValue::Null),
        JsonValue::Bool(b) => Ok(SqlValue::Integer(if *b { 1 } else { 0 })),
        JsonValue::Number(n) => {
            if let Some(i) = n.as_i64() {
                Ok(SqlValue::Integer(i))
            } else if let Some(f) = n.as_f64() {
                Ok(SqlValue::Real(f))
            } else {
                Err("Error: unsupported number value".to_string())
            }
        }
        JsonValue::String(s) => Ok(SqlValue::Text(s.clone())),
        JsonValue::Object(obj) => {
            if let Some(JsonValue::String(s)) = obj.get("$bigint") {
                let i: i64 = s
                    .parse()
                    .map_err(|_| format!("Error: invalid $bigint value: {}", s))?;
                Ok(SqlValue::Integer(i))
            } else if let Some(JsonValue::String(s)) = obj.get("$bytes") {
                let bytes = BASE64
                    .decode(s)
                    .map_err(|_| "Error: invalid $bytes base64".to_string())?;
                Ok(SqlValue::Blob(bytes))
            } else {
                Err("Error: unsupported object parameter".to_string())
            }
        }
        JsonValue::Array(_) => Err("Error: array parameters not supported".to_string()),
    }
}

/// Convert a rusqlite `Value` to a JSON value using FFI tags.
fn sql_to_json(v: SqlValue) -> JsonValue {
    match v {
        SqlValue::Null => JsonValue::Null,
        SqlValue::Integer(i) => json!({"$bigint": i.to_string()}),
        SqlValue::Real(f) => json!(f),
        SqlValue::Text(s) => JsonValue::String(s),
        SqlValue::Blob(b) => json!({"$bytes": BASE64.encode(&b)}),
    }
}

/// Parse JSON params string into a vec of rusqlite values.
/// Supports positional (JSON array) and named (JSON object) params.
fn parse_params(json_str: &str) -> Result<ParamSet, String> {
    let parsed: JsonValue =
        serde_json::from_str(json_str).map_err(|e| format!("Error: invalid params JSON: {}", e))?;
    match parsed {
        JsonValue::Null => Ok(ParamSet::Positional(vec![])),
        JsonValue::Array(arr) => {
            let mut vals = Vec::with_capacity(arr.len());
            for v in &arr {
                vals.push(json_to_sql(v)?);
            }
            Ok(ParamSet::Positional(vals))
        }
        JsonValue::Object(obj) => {
            let mut named = Vec::with_capacity(obj.len());
            for (k, v) in &obj {
                named.push((k.clone(), json_to_sql(v)?));
            }
            Ok(ParamSet::Named(named))
        }
        _ => Err("Error: params must be null, array, or object".to_string()),
    }
}

enum ParamSet {
    Positional(Vec<SqlValue>),
    Named(Vec<(String, SqlValue)>),
}

/// Execute a statement with parsed params and return the rusqlite statement result.
fn execute_stmt(
    conn: &Connection,
    sql: &str,
    params: &ParamSet,
) -> Result<usize, rusqlite::Error> {
    let mut stmt = conn.prepare(sql)?;
    match params {
        ParamSet::Positional(vals) => {
            let refs: Vec<&dyn rusqlite::types::ToSql> =
                vals.iter().map(|v| v as &dyn rusqlite::types::ToSql).collect();
            stmt.execute(refs.as_slice())
        }
        ParamSet::Named(vals) => {
            let pairs: Vec<(&str, &dyn rusqlite::types::ToSql)> = vals
                .iter()
                .map(|(k, v)| (k.as_str(), v as &dyn rusqlite::types::ToSql))
                .collect();
            stmt.execute(pairs.as_slice())
        }
    }
}

/// Query a single row.
fn query_get(
    conn: &Connection,
    sql: &str,
    params: &ParamSet,
) -> Result<Option<JsonValue>, String> {
    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| format!("Error: {}", e))?;
    let col_count = stmt.column_count();
    let col_names: Vec<String> = (0..col_count)
        .map(|i| stmt.column_name(i).unwrap_or("?").to_string())
        .collect();

    let result = match params {
        ParamSet::Positional(vals) => {
            let refs: Vec<&dyn rusqlite::types::ToSql> =
                vals.iter().map(|v| v as &dyn rusqlite::types::ToSql).collect();
            stmt.query_row(refs.as_slice(), |row| {
                let mut obj = Map::new();
                for (i, name) in col_names.iter().enumerate() {
                    let val: SqlValue = row.get(i)?;
                    obj.insert(name.clone(), sql_to_json(val));
                }
                Ok(JsonValue::Object(obj))
            })
        }
        ParamSet::Named(vals) => {
            let pairs: Vec<(&str, &dyn rusqlite::types::ToSql)> = vals
                .iter()
                .map(|(k, v)| (k.as_str(), v as &dyn rusqlite::types::ToSql))
                .collect();
            stmt.query_row(pairs.as_slice(), |row| {
                let mut obj = Map::new();
                for (i, name) in col_names.iter().enumerate() {
                    let val: SqlValue = row.get(i)?;
                    obj.insert(name.clone(), sql_to_json(val));
                }
                Ok(JsonValue::Object(obj))
            })
        }
    };

    match result {
        Ok(row) => Ok(Some(row)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("Error: {}", e)),
    }
}

/// Query all rows.
fn query_all(
    conn: &Connection,
    sql: &str,
    params: &ParamSet,
) -> Result<JsonValue, String> {
    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| format!("Error: {}", e))?;
    let col_count = stmt.column_count();
    let col_names: Vec<String> = (0..col_count)
        .map(|i| stmt.column_name(i).unwrap_or("?").to_string())
        .collect();

    let map_row = |row: &rusqlite::Row| -> rusqlite::Result<JsonValue> {
        let mut obj = Map::new();
        for (i, name) in col_names.iter().enumerate() {
            let val: SqlValue = row.get(i)?;
            obj.insert(name.clone(), sql_to_json(val));
        }
        Ok(JsonValue::Object(obj))
    };

    let rows_result = match params {
        ParamSet::Positional(vals) => {
            let refs: Vec<&dyn rusqlite::types::ToSql> =
                vals.iter().map(|v| v as &dyn rusqlite::types::ToSql).collect();
            stmt.query_map(refs.as_slice(), map_row)
        }
        ParamSet::Named(vals) => {
            let pairs: Vec<(&str, &dyn rusqlite::types::ToSql)> = vals
                .iter()
                .map(|(k, v)| (k.as_str(), v as &dyn rusqlite::types::ToSql))
                .collect();
            stmt.query_map(pairs.as_slice(), map_row)
        }
    };

    let rows_iter = rows_result.map_err(|e| format!("Error: {}", e))?;
    let mut rows = Vec::new();
    for row in rows_iter {
        rows.push(row.map_err(|e| format!("Error: {}", e))?);
    }
    Ok(JsonValue::Array(rows))
}

// ---------------------------------------------------------------------------
// Host functions
// ---------------------------------------------------------------------------

/// `sqliteOpen(path) -> number | "Error: ..."`
pub unsafe extern "C" fn host_sqlite_open(the: *mut XsMachine) {
    let path = arg_str(the, 0);
    let conn = if path == ":memory:" {
        Connection::open_in_memory()
    } else {
        Connection::open(path)
    };

    match conn {
        Ok(c) => {
            // Apply default pragmas.
            if let Err(e) = c.execute_batch(
                "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;",
            ) {
                set_result_string(the, &format!("Error: {}", e));
                return;
            }
            if let Err(e) = c.busy_timeout(std::time::Duration::from_millis(5000)) {
                set_result_string(the, &format!("Error: {}", e));
                return;
            }
            let handle = NEXT_DB_HANDLE.fetch_add(1, Ordering::SeqCst);
            let mut map = get_db_map();
            map.as_mut().unwrap().insert(handle, c);
            fxInteger(the, &mut (*the).scratch, handle as i32);
            *(*the).frame.add(1) = (*the).scratch;
        }
        Err(e) => {
            set_result_string(the, &format!("Error: {}", e));
        }
    }
}

/// `sqliteClose(dbH) -> undefined`
pub unsafe extern "C" fn host_sqlite_close(the: *mut XsMachine) {
    let handle_slot = (*the).frame.sub(2);
    let handle = fxToInteger(the, handle_slot) as u32;

    // Remove associated statements first.
    {
        let mut stmts = get_stmt_map();
        stmts.as_mut().unwrap().retain(|_, s| s.db_handle != handle);
    }
    // Then remove the connection.
    let mut dbs = get_db_map();
    dbs.as_mut().unwrap().remove(&handle);
}

/// `sqliteExec(dbH, sql) -> undefined | "Error: ..."`
pub unsafe extern "C" fn host_sqlite_exec(the: *mut XsMachine) {
    let handle_slot = (*the).frame.sub(2);
    let handle = fxToInteger(the, handle_slot) as u32;
    let sql = arg_str(the, 1);

    let map = get_db_map();
    match map.as_ref().unwrap().get(&handle) {
        Some(conn) => {
            if let Err(e) = conn.execute_batch(&sql) {
                set_result_string(the, &format!("Error: {}", e));
            }
        }
        None => {
            set_result_string(the, &format!("Error: invalid database handle {}", handle));
        }
    }
}

/// `sqlitePrepare(dbH, sql) -> number | "Error: ..."`
pub unsafe extern "C" fn host_sqlite_prepare(the: *mut XsMachine) {
    let handle_slot = (*the).frame.sub(2);
    let db_handle = fxToInteger(the, handle_slot) as u32;
    let sql = arg_str(the, 1);

    // Validate that the db handle exists.
    {
        let map = get_db_map();
        if !map.as_ref().unwrap().contains_key(&db_handle) {
            set_result_string(
                the,
                &format!("Error: invalid database handle {}", db_handle),
            );
            return;
        }
    }

    let stmt_handle = NEXT_STMT_HANDLE.fetch_add(1, Ordering::SeqCst);
    let mut stmts = get_stmt_map();
    stmts.as_mut().unwrap().insert(
        stmt_handle,
        PreparedStmt {
            db_handle,
            sql,
        },
    );
    fxInteger(the, &mut (*the).scratch, stmt_handle as i32);
    *(*the).frame.add(1) = (*the).scratch;
}

/// `sqliteStmtRun(stmtH, paramsJson) -> JSON | "Error: ..."`
pub unsafe extern "C" fn host_sqlite_stmt_run(the: *mut XsMachine) {
    let handle_slot = (*the).frame.sub(2);
    let stmt_handle = fxToInteger(the, handle_slot) as u32;
    let params_json = arg_str(the, 1);

    // Look up statement info.
    let (db_handle, sql) = {
        let stmts = get_stmt_map();
        match stmts.as_ref().unwrap().get(&stmt_handle) {
            Some(s) => (s.db_handle, s.sql.clone()),
            None => {
                set_result_string(
                    the,
                    &format!("Error: invalid statement handle {}", stmt_handle),
                );
                return;
            }
        }
    };

    let params = match parse_params(&params_json) {
        Ok(p) => p,
        Err(e) => {
            set_result_string(the, &e);
            return;
        }
    };

    let map = get_db_map();
    match map.as_ref().unwrap().get(&db_handle) {
        Some(conn) => match execute_stmt(conn, &sql, &params) {
            Ok(changes) => {
                let rowid = conn.last_insert_rowid();
                let result = format!(
                    "{{\"changes\":\"{}\",\"lastInsertRowid\":\"{}\"}}",
                    changes, rowid
                );
                set_result_string(the, &result);
            }
            Err(e) => {
                set_result_string(the, &format!("Error: {}", e));
            }
        },
        None => {
            set_result_string(the, &format!("Error: invalid database handle {}", db_handle));
        }
    }
}

/// `sqliteStmtGet(stmtH, paramsJson) -> JSON | "null" | "Error: ..."`
pub unsafe extern "C" fn host_sqlite_stmt_get(the: *mut XsMachine) {
    let handle_slot = (*the).frame.sub(2);
    let stmt_handle = fxToInteger(the, handle_slot) as u32;
    let params_json = arg_str(the, 1);

    let (db_handle, sql) = {
        let stmts = get_stmt_map();
        match stmts.as_ref().unwrap().get(&stmt_handle) {
            Some(s) => (s.db_handle, s.sql.clone()),
            None => {
                set_result_string(
                    the,
                    &format!("Error: invalid statement handle {}", stmt_handle),
                );
                return;
            }
        }
    };

    let params = match parse_params(&params_json) {
        Ok(p) => p,
        Err(e) => {
            set_result_string(the, &e);
            return;
        }
    };

    let map = get_db_map();
    match map.as_ref().unwrap().get(&db_handle) {
        Some(conn) => match query_get(conn, &sql, &params) {
            Ok(Some(row)) => {
                set_result_string(the, &row.to_string());
            }
            Ok(None) => {
                set_result_string(the, "null");
            }
            Err(e) => {
                set_result_string(the, &e);
            }
        },
        None => {
            set_result_string(the, &format!("Error: invalid database handle {}", db_handle));
        }
    }
}

/// `sqliteStmtAll(stmtH, paramsJson) -> JSON | "Error: ..."`
pub unsafe extern "C" fn host_sqlite_stmt_all(the: *mut XsMachine) {
    let handle_slot = (*the).frame.sub(2);
    let stmt_handle = fxToInteger(the, handle_slot) as u32;
    let params_json = arg_str(the, 1);

    let (db_handle, sql) = {
        let stmts = get_stmt_map();
        match stmts.as_ref().unwrap().get(&stmt_handle) {
            Some(s) => (s.db_handle, s.sql.clone()),
            None => {
                set_result_string(
                    the,
                    &format!("Error: invalid statement handle {}", stmt_handle),
                );
                return;
            }
        }
    };

    let params = match parse_params(&params_json) {
        Ok(p) => p,
        Err(e) => {
            set_result_string(the, &e);
            return;
        }
    };

    let map = get_db_map();
    match map.as_ref().unwrap().get(&db_handle) {
        Some(conn) => match query_all(conn, &sql, &params) {
            Ok(rows) => {
                set_result_string(the, &rows.to_string());
            }
            Err(e) => {
                set_result_string(the, &e);
            }
        },
        None => {
            set_result_string(the, &format!("Error: invalid database handle {}", db_handle));
        }
    }
}

/// `sqliteStmtColumns(stmtH) -> JSON | "Error: ..."`
pub unsafe extern "C" fn host_sqlite_stmt_columns(the: *mut XsMachine) {
    let handle_slot = (*the).frame.sub(2);
    let stmt_handle = fxToInteger(the, handle_slot) as u32;

    let (db_handle, sql) = {
        let stmts = get_stmt_map();
        match stmts.as_ref().unwrap().get(&stmt_handle) {
            Some(s) => (s.db_handle, s.sql.clone()),
            None => {
                set_result_string(
                    the,
                    &format!("Error: invalid statement handle {}", stmt_handle),
                );
                return;
            }
        }
    };

    let map = get_db_map();
    match map.as_ref().unwrap().get(&db_handle) {
        Some(conn) => match conn.prepare(&sql) {
            Ok(stmt) => {
                let mut cols = Vec::new();
                for i in 0..stmt.column_count() {
                    let name = stmt.column_name(i).unwrap_or("?");
                    // column_type() requires an executed statement;
                    // use the SQL-declared type via statement introspection.
                    // column_names() / column_name() are available pre-execution,
                    // but declared type requires iterating column metadata.
                    // For now, return null for type — the JS side doesn't
                    // strictly need it.
                    cols.push(json!({"name": name, "type": null}));
                }
                set_result_string(the, &JsonValue::Array(cols).to_string());
            }
            Err(e) => {
                set_result_string(the, &format!("Error: {}", e));
            }
        },
        None => {
            set_result_string(the, &format!("Error: invalid database handle {}", db_handle));
        }
    }
}

/// `sqliteStmtFinalize(stmtH) -> undefined`
pub unsafe extern "C" fn host_sqlite_stmt_finalize(the: *mut XsMachine) {
    let handle_slot = (*the).frame.sub(2);
    let stmt_handle = fxToInteger(the, handle_slot) as u32;

    let mut stmts = get_stmt_map();
    stmts.as_mut().unwrap().remove(&stmt_handle);
}

/// Register all SQLite host functions on the machine.
pub unsafe fn register(machine: &crate::Machine) {
    machine.define_function("sqliteOpen", host_sqlite_open, 1);
    machine.define_function("sqliteClose", host_sqlite_close, 1);
    machine.define_function("sqliteExec", host_sqlite_exec, 2);
    machine.define_function("sqlitePrepare", host_sqlite_prepare, 2);
    machine.define_function("sqliteStmtRun", host_sqlite_stmt_run, 2);
    machine.define_function("sqliteStmtGet", host_sqlite_stmt_get, 2);
    machine.define_function("sqliteStmtAll", host_sqlite_stmt_all, 2);
    machine.define_function("sqliteStmtColumns", host_sqlite_stmt_columns, 1);
    machine.define_function("sqliteStmtFinalize", host_sqlite_stmt_finalize, 1);
}
