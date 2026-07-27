//! NPM registry table backed by SQLite.
//!
//! Maps `(package_name, version)` to CAS tree hashes, serving as
//! a local cache of npm registry metadata for minimal version
//! selection resolution.

use std::io;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension};

/// SQLite-backed registry table at `{state_path}/registry.sqlite`.
pub struct RegistryTable {
    conn: Connection,
}

/// A resolved package entry from the registry table.
#[derive(Debug, Clone)]
pub struct PackageEntry {
    pub name: String,
    pub version: String,
    pub hash: String,
    pub integrity: Option<String>,
    pub fetched_at: i64,
}

/// A cached package-metadata row (the registry's version-listing
/// document for one package).
#[derive(Debug, Clone)]
pub struct MetaEntry {
    pub name: String,
    pub fetched_at: i64,
}

impl RegistryTable {
    /// Open (or create) the registry database at the given path.
    pub fn open(db_path: &Path) -> io::Result<Self> {
        let conn = Connection::open(db_path).map_err(|e| {
            io::Error::new(io::ErrorKind::Other, format!("sqlite open: {e}"))
        })?;
        let table = RegistryTable { conn };
        table.create_tables()?;
        Ok(table)
    }

    /// Open an in-memory database (for testing).
    pub fn open_in_memory() -> io::Result<Self> {
        let conn = Connection::open_in_memory().map_err(|e| {
            io::Error::new(io::ErrorKind::Other, format!("sqlite: {e}"))
        })?;
        let table = RegistryTable { conn };
        table.create_tables()?;
        Ok(table)
    }

    fn create_tables(&self) -> io::Result<()> {
        self.conn
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS packages (
                    name TEXT NOT NULL,
                    version TEXT NOT NULL,
                    hash TEXT NOT NULL,
                    integrity TEXT,
                    fetched_at INTEGER NOT NULL,
                    PRIMARY KEY (name, version)
                );
                CREATE TABLE IF NOT EXISTS package_meta (
                    name TEXT PRIMARY KEY,
                    versions_json TEXT NOT NULL,
                    fetched_at INTEGER NOT NULL
                );",
            )
            .map_err(|e| io::Error::new(io::ErrorKind::Other, format!("create tables: {e}")))
    }

    /// Look up a specific package version.
    pub fn lookup(&self, name: &str, version: &str) -> io::Result<Option<PackageEntry>> {
        self.conn
            .query_row(
                "SELECT name, version, hash, integrity, fetched_at
                 FROM packages WHERE name = ?1 AND version = ?2",
                params![name, version],
                |row| {
                    Ok(PackageEntry {
                        name: row.get(0)?,
                        version: row.get(1)?,
                        hash: row.get(2)?,
                        integrity: row.get(3)?,
                        fetched_at: row.get(4)?,
                    })
                },
            )
            .optional()
            .map_err(|e| io::Error::new(io::ErrorKind::Other, format!("lookup: {e}")))
    }

    /// Insert or replace a package entry.
    pub fn insert(
        &self,
        name: &str,
        version: &str,
        hash: &str,
        integrity: Option<&str>,
    ) -> io::Result<()> {
        let now = unix_timestamp();
        self.conn
            .execute(
                "INSERT OR REPLACE INTO packages (name, version, hash, integrity, fetched_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![name, version, hash, integrity, now],
            )
            .map_err(|e| io::Error::new(io::ErrorKind::Other, format!("insert: {e}")))?;
        Ok(())
    }

    /// List all versions of a package in the table.
    pub fn list_versions(&self, name: &str) -> io::Result<Vec<PackageEntry>> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT name, version, hash, integrity, fetched_at
                 FROM packages WHERE name = ?1 ORDER BY version",
            )
            .map_err(|e| io::Error::new(io::ErrorKind::Other, format!("prepare: {e}")))?;

        let rows = stmt
            .query_map(params![name], |row| {
                Ok(PackageEntry {
                    name: row.get(0)?,
                    version: row.get(1)?,
                    hash: row.get(2)?,
                    integrity: row.get(3)?,
                    fetched_at: row.get(4)?,
                })
            })
            .map_err(|e| io::Error::new(io::ErrorKind::Other, format!("query: {e}")))?;

        let mut entries = Vec::new();
        for row in rows {
            entries.push(
                row.map_err(|e| io::Error::new(io::ErrorKind::Other, format!("row: {e}")))?,
            );
        }
        Ok(entries)
    }

    /// Get cached package metadata (version listing JSON).
    pub fn get_meta(&self, name: &str) -> io::Result<Option<String>> {
        self.conn
            .query_row(
                "SELECT versions_json FROM package_meta WHERE name = ?1",
                params![name],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| io::Error::new(io::ErrorKind::Other, format!("get_meta: {e}")))
    }

    /// Cache package metadata (version listing JSON).
    pub fn set_meta(&self, name: &str, versions_json: &str) -> io::Result<()> {
        let now = unix_timestamp();
        self.conn
            .execute(
                "INSERT OR REPLACE INTO package_meta (name, versions_json, fetched_at)
                 VALUES (?1, ?2, ?3)",
                params![name, versions_json, now],
            )
            .map_err(|e| io::Error::new(io::ErrorKind::Other, format!("set_meta: {e}")))?;
        Ok(())
    }

    /// Count total packages in the table.
    pub fn count(&self) -> io::Result<u64> {
        self.conn
            .query_row("SELECT COUNT(*) FROM packages", [], |row| row.get(0))
            .map_err(|e| io::Error::new(io::ErrorKind::Other, format!("count: {e}")))
    }

    /// List every package entry in the table, ordered by name then
    /// version (lexicographic display order, not semver order).
    pub fn list_packages(&self) -> io::Result<Vec<PackageEntry>> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT name, version, hash, integrity, fetched_at
                 FROM packages ORDER BY name, version",
            )
            .map_err(|e| io::Error::new(io::ErrorKind::Other, format!("prepare: {e}")))?;

        let rows = stmt
            .query_map([], |row| {
                Ok(PackageEntry {
                    name: row.get(0)?,
                    version: row.get(1)?,
                    hash: row.get(2)?,
                    integrity: row.get(3)?,
                    fetched_at: row.get(4)?,
                })
            })
            .map_err(|e| io::Error::new(io::ErrorKind::Other, format!("query: {e}")))?;

        let mut entries = Vec::new();
        for row in rows {
            entries.push(
                row.map_err(|e| io::Error::new(io::ErrorKind::Other, format!("row: {e}")))?,
            );
        }
        Ok(entries)
    }

    /// List the names and fetch times of every cached metadata row,
    /// ordered by name.
    pub fn list_meta(&self) -> io::Result<Vec<MetaEntry>> {
        let mut stmt = self
            .conn
            .prepare("SELECT name, fetched_at FROM package_meta ORDER BY name")
            .map_err(|e| io::Error::new(io::ErrorKind::Other, format!("prepare: {e}")))?;

        let rows = stmt
            .query_map([], |row| {
                Ok(MetaEntry {
                    name: row.get(0)?,
                    fetched_at: row.get(1)?,
                })
            })
            .map_err(|e| io::Error::new(io::ErrorKind::Other, format!("query: {e}")))?;

        let mut entries = Vec::new();
        for row in rows {
            entries.push(
                row.map_err(|e| io::Error::new(io::ErrorKind::Other, format!("row: {e}")))?,
            );
        }
        Ok(entries)
    }

    /// Delete a cached metadata row so the next resolution re-fetches
    /// the registry's version listing for `name`. Returns whether a
    /// row existed. Package rows and their CAS trees are untouched:
    /// fetched package contents are immutable and stay valid.
    pub fn delete_meta(&self, name: &str) -> io::Result<bool> {
        let changed = self
            .conn
            .execute("DELETE FROM package_meta WHERE name = ?1", params![name])
            .map_err(|e| io::Error::new(io::ErrorKind::Other, format!("delete_meta: {e}")))?;
        Ok(changed > 0)
    }
}

fn unix_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn insert_and_lookup() {
        let reg = RegistryTable::open_in_memory().unwrap();
        reg.insert("is-odd", "1.0.0", "sha256:abc123", Some("sha512-xyz"))
            .unwrap();

        let entry = reg.lookup("is-odd", "1.0.0").unwrap().unwrap();
        assert_eq!(entry.name, "is-odd");
        assert_eq!(entry.version, "1.0.0");
        assert_eq!(entry.hash, "sha256:abc123");
        assert_eq!(entry.integrity.as_deref(), Some("sha512-xyz"));
    }

    #[test]
    fn lookup_missing_returns_none() {
        let reg = RegistryTable::open_in_memory().unwrap();
        assert!(reg.lookup("nonexistent", "1.0.0").unwrap().is_none());
    }

    #[test]
    fn insert_replace_updates() {
        let reg = RegistryTable::open_in_memory().unwrap();
        reg.insert("foo", "1.0.0", "sha256:old", None).unwrap();
        reg.insert("foo", "1.0.0", "sha256:new", None).unwrap();

        let entry = reg.lookup("foo", "1.0.0").unwrap().unwrap();
        assert_eq!(entry.hash, "sha256:new");
    }

    #[test]
    fn list_versions_ordered() {
        let reg = RegistryTable::open_in_memory().unwrap();
        reg.insert("bar", "2.0.0", "sha256:v2", None).unwrap();
        reg.insert("bar", "1.0.0", "sha256:v1", None).unwrap();
        reg.insert("bar", "1.1.0", "sha256:v11", None).unwrap();

        let versions = reg.list_versions("bar").unwrap();
        assert_eq!(versions.len(), 3);
        assert_eq!(versions[0].version, "1.0.0");
        assert_eq!(versions[1].version, "1.1.0");
        assert_eq!(versions[2].version, "2.0.0");
    }

    #[test]
    fn meta_cache_round_trip() {
        let reg = RegistryTable::open_in_memory().unwrap();
        assert!(reg.get_meta("express").unwrap().is_none());

        let versions_json = r#"{"4.18.0":{},"4.17.1":{}}"#;
        reg.set_meta("express", versions_json).unwrap();

        let cached = reg.get_meta("express").unwrap().unwrap();
        assert_eq!(cached, versions_json);
    }

    #[test]
    fn meta_cache_updates() {
        let reg = RegistryTable::open_in_memory().unwrap();
        reg.set_meta("pkg", "v1").unwrap();
        reg.set_meta("pkg", "v2").unwrap();

        let cached = reg.get_meta("pkg").unwrap().unwrap();
        assert_eq!(cached, "v2");
    }

    #[test]
    fn count_packages() {
        let reg = RegistryTable::open_in_memory().unwrap();
        assert_eq!(reg.count().unwrap(), 0);

        reg.insert("a", "1.0.0", "h1", None).unwrap();
        reg.insert("b", "2.0.0", "h2", None).unwrap();
        assert_eq!(reg.count().unwrap(), 2);
    }

    #[test]
    fn list_packages_all_ordered() {
        let reg = RegistryTable::open_in_memory().unwrap();
        assert!(reg.list_packages().unwrap().is_empty());

        reg.insert("zeta", "1.0.0", "hz", None).unwrap();
        reg.insert("alpha", "2.0.0", "ha2", None).unwrap();
        reg.insert("alpha", "1.0.0", "ha1", None).unwrap();

        let all = reg.list_packages().unwrap();
        assert_eq!(all.len(), 3);
        assert_eq!((all[0].name.as_str(), all[0].version.as_str()), ("alpha", "1.0.0"));
        assert_eq!((all[1].name.as_str(), all[1].version.as_str()), ("alpha", "2.0.0"));
        assert_eq!((all[2].name.as_str(), all[2].version.as_str()), ("zeta", "1.0.0"));
    }

    #[test]
    fn list_meta_names_ordered() {
        let reg = RegistryTable::open_in_memory().unwrap();
        assert!(reg.list_meta().unwrap().is_empty());

        reg.set_meta("zeta", "{}").unwrap();
        reg.set_meta("alpha", "{}").unwrap();

        let metas = reg.list_meta().unwrap();
        assert_eq!(metas.len(), 2);
        assert_eq!(metas[0].name, "alpha");
        assert_eq!(metas[1].name, "zeta");
        assert!(metas[0].fetched_at > 0);
    }

    #[test]
    fn delete_meta_invalidates_only_meta() {
        let reg = RegistryTable::open_in_memory().unwrap();
        reg.set_meta("pkg", r#"{"1.0.0":{}}"#).unwrap();
        reg.insert("pkg", "1.0.0", "sha256:aaa", None).unwrap();

        assert!(reg.delete_meta("pkg").unwrap());
        assert!(reg.get_meta("pkg").unwrap().is_none());
        // A second delete finds nothing.
        assert!(!reg.delete_meta("pkg").unwrap());
        // The package row (and thus its CAS tree) survives.
        assert!(reg.lookup("pkg", "1.0.0").unwrap().is_some());
    }

    #[test]
    fn file_backed_persistence() {
        let tmp = tempfile::tempdir().unwrap();
        let db_path = tmp.path().join("registry.sqlite");

        // Create and populate.
        {
            let reg = RegistryTable::open(&db_path).unwrap();
            reg.insert("pkg", "1.0.0", "sha256:aaa", None).unwrap();
        }

        // Reopen and verify.
        {
            let reg = RegistryTable::open(&db_path).unwrap();
            let entry = reg.lookup("pkg", "1.0.0").unwrap().unwrap();
            assert_eq!(entry.hash, "sha256:aaa");
        }
    }
}
