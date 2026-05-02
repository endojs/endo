use std::collections::{HashMap, HashSet};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::RwLock;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

// ---------------------------------------------------------------------------
// Content types
// ---------------------------------------------------------------------------

/// Advisory content type stored in `.meta` sidecar.
#[derive(Clone, Debug, PartialEq)]
pub enum ContentType {
    Blob,
    Snapshot,
    Tree,
    Archive,
}

impl ContentType {
    pub fn as_str(&self) -> &'static str {
        match self {
            ContentType::Blob => "blob",
            ContentType::Snapshot => "snapshot",
            ContentType::Tree => "tree",
            ContentType::Archive => "archive",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "snapshot" => ContentType::Snapshot,
            "tree" => ContentType::Tree,
            "archive" => ContentType::Archive,
            _ => ContentType::Blob,
        }
    }
}

// ---------------------------------------------------------------------------
// Tree representation
// ---------------------------------------------------------------------------

/// A tree manifest in the CAS — maps names to child entries.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TreeManifest {
    pub entries: HashMap<String, TreeEntry>,
}

/// A single entry in a CAS tree.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TreeEntry {
    #[serde(rename = "type")]
    pub entry_type: String,
    pub hash: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
}

// ---------------------------------------------------------------------------
// ContentStore
// ---------------------------------------------------------------------------

/// SHA-256 content-addressed store backed by a flat directory.
///
/// Files are stored as `{dir}/{hex-sha256}`.
/// Optional `.meta` sidecars carry advisory type and ref count.
pub struct ContentStore {
    dir: PathBuf,
    /// In-memory ref count cache (flushed to `.meta` on release/retain).
    refs: RwLock<HashMap<String, u32>>,
}

impl ContentStore {
    /// Open (or create) a content store at `dir`.
    pub fn open(dir: &Path) -> io::Result<Self> {
        fs::create_dir_all(dir)?;
        Ok(ContentStore {
            dir: dir.to_path_buf(),
            refs: RwLock::new(HashMap::new()),
        })
    }

    /// Store bytes in the CAS and return the hex SHA-256 hash.
    pub fn store(&self, data: &[u8], content_type: &str) -> io::Result<String> {
        let hash = hex_sha256(data);
        let path = self.dir.join(&hash);
        if !path.exists() {
            // Write atomically: write to .tmp, then rename.
            let tmp = self.dir.join(format!("{hash}.tmp"));
            fs::write(&tmp, data)?;
            fs::rename(&tmp, &path)?;
        }
        // Write .meta if content type is not blob (default).
        if content_type != "blob" {
            self.write_meta(&hash, content_type, 0)?;
        }
        Ok(hash)
    }

    /// Fetch content by hex hash.
    pub fn fetch(&self, hash: &str) -> io::Result<Vec<u8>> {
        let path = self.dir.join(hash);
        fs::read(&path)
    }

    /// Check whether a hash exists in the store.
    pub fn has(&self, hash: &str) -> bool {
        self.dir.join(hash).exists()
    }

    /// Increment ref count for a hash.
    pub fn retain(&self, hash: &str) {
        let mut refs = self.refs.write().unwrap_or_else(|e| e.into_inner());
        let count = refs.entry(hash.to_string()).or_insert(0);
        *count += 1;
        // Best-effort flush to .meta.
        let _ = self.write_meta(hash, "blob", *count);
    }

    /// Decrement ref count for a hash.
    pub fn release(&self, hash: &str) {
        let mut refs = self.refs.write().unwrap_or_else(|e| e.into_inner());
        if let Some(count) = refs.get_mut(hash) {
            *count = count.saturating_sub(1);
            let _ = self.write_meta(hash, "blob", *count);
        }
    }

    /// Store a tree entry (JSON manifest) in the CAS.
    /// Returns the tree's own SHA-256 hash.
    pub fn store_tree(&self, tree_json: &[u8]) -> io::Result<String> {
        self.store(tree_json, "tree")
    }

    /// Read a tree entry and return its JSON bytes.
    pub fn fetch_tree(&self, hash: &str) -> io::Result<Vec<u8>> {
        self.fetch(hash)
    }

    /// Parse a tree manifest from the CAS.
    pub fn read_tree(&self, hash: &str) -> io::Result<TreeManifest> {
        let data = self.fetch(hash)?;
        serde_json::from_slice(&data).map_err(|e| {
            io::Error::new(io::ErrorKind::InvalidData, format!("invalid tree JSON: {e}"))
        })
    }

    /// List the names of entries in a tree.
    pub fn list_tree(&self, hash: &str) -> io::Result<Vec<String>> {
        let tree = self.read_tree(hash)?;
        let mut names: Vec<String> = tree.entries.keys().cloned().collect();
        names.sort();
        Ok(names)
    }

    /// Fetch a blob by traversing a tree path (e.g., `"lib/index.js"`).
    /// Returns the raw blob bytes.
    pub fn fetch_from_tree(&self, root_hash: &str, path: &str) -> io::Result<Vec<u8>> {
        let parts: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
        let mut current_hash = root_hash.to_string();
        for (i, part) in parts.iter().enumerate() {
            let tree = self.read_tree(&current_hash)?;
            let entry = tree.entries.get(*part).ok_or_else(|| {
                io::Error::new(
                    io::ErrorKind::NotFound,
                    format!("entry not found: {part}"),
                )
            })?;
            if i < parts.len() - 1 {
                // Intermediate path component — must be a tree.
                if entry.entry_type != "tree" {
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidData,
                        format!("{part} is not a tree"),
                    ));
                }
                current_hash = entry.hash.clone();
            } else {
                // Final component — fetch it (blob or tree).
                return self.fetch(&entry.hash);
            }
        }
        // Empty path — return the tree itself.
        self.fetch(&current_hash)
    }

    /// Return the directory path of the store.
    pub fn dir(&self) -> &Path {
        &self.dir
    }

    /// Run garbage collection. Deletes entries that:
    /// - Have zero ref count in the in-memory cache.
    /// - Are not in `live_roots`.
    /// - Are not transitively referenced by a live tree.
    ///
    /// Returns a report of what was collected.
    pub fn gc(&self, live_roots: &HashSet<String>) -> io::Result<GcReport> {
        // Build the full live set by walking trees from live_roots.
        let mut live = live_roots.clone();

        // Also include anything with refs > 0.
        {
            let refs = self.refs.read().unwrap_or_else(|e| e.into_inner());
            for (hash, count) in refs.iter() {
                if *count > 0 {
                    live.insert(hash.clone());
                }
            }
        }

        // Expand tree references: walk all live trees and mark children.
        let mut to_walk: Vec<String> = live.iter().cloned().collect();
        while let Some(hash) = to_walk.pop() {
            if let Ok(tree) = self.read_tree(&hash) {
                for entry in tree.entries.values() {
                    if live.insert(entry.hash.clone()) {
                        // Newly seen — walk if it might be a tree.
                        if entry.entry_type == "tree" {
                            to_walk.push(entry.hash.clone());
                        }
                    }
                }
            }
            // If read_tree fails, it's a blob — no children to walk.
        }

        // Sweep: iterate store directory, delete unreferenced entries.
        let mut freed_count = 0u64;
        let mut freed_bytes = 0u64;

        for entry in fs::read_dir(&self.dir)? {
            let entry = entry?;
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            // Skip .meta sidecars and .tmp files.
            if name_str.ends_with(".meta") || name_str.ends_with(".tmp") {
                continue;
            }
            if !live.contains(name_str.as_ref()) {
                let meta = entry.metadata()?;
                let size = meta.len();
                // Delete the blob and its meta sidecar.
                fs::remove_file(entry.path())?;
                let meta_path = self.dir.join(format!("{name_str}.meta"));
                let _ = fs::remove_file(&meta_path);
                freed_count += 1;
                freed_bytes += size;
                // Remove from in-memory refs.
                let mut refs = self.refs.write().unwrap_or_else(|e| e.into_inner());
                refs.remove(name_str.as_ref());
            }
        }

        Ok(GcReport {
            freed_count,
            freed_bytes,
        })
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    fn write_meta(&self, hash: &str, content_type: &str, ref_count: u32) -> io::Result<()> {
        let meta_path = self.dir.join(format!("{hash}.meta"));
        let json = format!(
            "{{\"type\":\"{content_type}\",\"refs\":{ref_count}}}"
        );
        fs::write(&meta_path, json.as_bytes())
    }
}

/// Report from a GC run.
#[derive(Debug)]
pub struct GcReport {
    pub freed_count: u64,
    pub freed_bytes: u64,
}

/// Compute hex-encoded SHA-256 of `data`.
fn hex_sha256(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    let result = hasher.finalize();
    hex::encode(result)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn store_fetch_roundtrip() {
        let tmp = tempfile::tempdir().unwrap();
        let cas = ContentStore::open(tmp.path()).unwrap();

        let data = b"hello, CAS";
        let hash = cas.store(data, "blob").unwrap();

        assert!(cas.has(&hash));
        assert_eq!(cas.fetch(&hash).unwrap(), data);
    }

    #[test]
    fn store_deduplicates() {
        let tmp = tempfile::tempdir().unwrap();
        let cas = ContentStore::open(tmp.path()).unwrap();

        let data = b"duplicate content";
        let h1 = cas.store(data, "blob").unwrap();
        let h2 = cas.store(data, "blob").unwrap();
        assert_eq!(h1, h2);
    }

    #[test]
    fn has_returns_false_for_missing() {
        let tmp = tempfile::tempdir().unwrap();
        let cas = ContentStore::open(tmp.path()).unwrap();
        assert!(!cas.has("0000000000000000000000000000000000000000000000000000000000000000"));
    }

    #[test]
    fn fetch_missing_returns_error() {
        let tmp = tempfile::tempdir().unwrap();
        let cas = ContentStore::open(tmp.path()).unwrap();
        assert!(cas.fetch("nonexistent").is_err());
    }

    #[test]
    fn store_with_content_type_writes_meta() {
        let tmp = tempfile::tempdir().unwrap();
        let cas = ContentStore::open(tmp.path()).unwrap();

        let data = b"snapshot data";
        let hash = cas.store(data, "snapshot").unwrap();

        let meta_path = tmp.path().join(format!("{hash}.meta"));
        assert!(meta_path.exists());
        let meta = fs::read_to_string(&meta_path).unwrap();
        assert!(meta.contains("\"type\":\"snapshot\""));
    }

    #[test]
    fn retain_release_updates_refs() {
        let tmp = tempfile::tempdir().unwrap();
        let cas = ContentStore::open(tmp.path()).unwrap();

        let hash = cas.store(b"ref counted", "blob").unwrap();
        cas.retain(&hash);
        cas.retain(&hash);

        let meta_path = tmp.path().join(format!("{hash}.meta"));
        let meta = fs::read_to_string(&meta_path).unwrap();
        assert!(meta.contains("\"refs\":2"));

        cas.release(&hash);
        let meta = fs::read_to_string(&meta_path).unwrap();
        assert!(meta.contains("\"refs\":1"));
    }

    #[test]
    fn store_tree_and_fetch() {
        let tmp = tempfile::tempdir().unwrap();
        let cas = ContentStore::open(tmp.path()).unwrap();

        // Store child blobs first.
        let blob_hash = cas.store(b"console.log('hello');", "blob").unwrap();

        let tree_json = format!(
            r#"{{"entries":{{"index.js":{{"type":"blob","hash":"{}","size":21}}}}}}"#,
            blob_hash
        );
        let tree_hash = cas.store_tree(tree_json.as_bytes()).unwrap();

        assert!(cas.has(&tree_hash));
        let fetched = cas.fetch_tree(&tree_hash).unwrap();
        assert_eq!(fetched, tree_json.as_bytes());

        // Verify meta says "tree".
        let meta_path = tmp.path().join(format!("{tree_hash}.meta"));
        let meta = fs::read_to_string(&meta_path).unwrap();
        assert!(meta.contains("\"type\":\"tree\""));
    }

    #[test]
    fn list_tree_entries() {
        let tmp = tempfile::tempdir().unwrap();
        let cas = ContentStore::open(tmp.path()).unwrap();

        let blob_hash = cas.store(b"content", "blob").unwrap();
        let tree = TreeManifest {
            entries: {
                let mut m = HashMap::new();
                m.insert("b.js".to_string(), TreeEntry {
                    entry_type: "blob".to_string(),
                    hash: blob_hash.clone(),
                    size: Some(7),
                });
                m.insert("a.js".to_string(), TreeEntry {
                    entry_type: "blob".to_string(),
                    hash: blob_hash,
                    size: Some(7),
                });
                m
            },
        };
        let tree_json = serde_json::to_vec(&tree).unwrap();
        let tree_hash = cas.store_tree(&tree_json).unwrap();

        let names = cas.list_tree(&tree_hash).unwrap();
        assert_eq!(names, vec!["a.js", "b.js"]);
    }

    #[test]
    fn fetch_from_tree_flat() {
        let tmp = tempfile::tempdir().unwrap();
        let cas = ContentStore::open(tmp.path()).unwrap();

        let src = b"export default 42;";
        let blob_hash = cas.store(src, "blob").unwrap();
        let tree = TreeManifest {
            entries: {
                let mut m = HashMap::new();
                m.insert("index.js".to_string(), TreeEntry {
                    entry_type: "blob".to_string(),
                    hash: blob_hash,
                    size: Some(src.len() as u64),
                });
                m
            },
        };
        let tree_json = serde_json::to_vec(&tree).unwrap();
        let root_hash = cas.store_tree(&tree_json).unwrap();

        let fetched = cas.fetch_from_tree(&root_hash, "index.js").unwrap();
        assert_eq!(fetched, src);
    }

    #[test]
    fn fetch_from_tree_nested() {
        let tmp = tempfile::tempdir().unwrap();
        let cas = ContentStore::open(tmp.path()).unwrap();

        // Create nested tree: root -> lib (tree) -> util.js (blob)
        let util_src = b"export const add = (a, b) => a + b;";
        let util_hash = cas.store(util_src, "blob").unwrap();

        let lib_tree = TreeManifest {
            entries: {
                let mut m = HashMap::new();
                m.insert("util.js".to_string(), TreeEntry {
                    entry_type: "blob".to_string(),
                    hash: util_hash,
                    size: Some(util_src.len() as u64),
                });
                m
            },
        };
        let lib_json = serde_json::to_vec(&lib_tree).unwrap();
        let lib_hash = cas.store_tree(&lib_json).unwrap();

        let root_tree = TreeManifest {
            entries: {
                let mut m = HashMap::new();
                m.insert("lib".to_string(), TreeEntry {
                    entry_type: "tree".to_string(),
                    hash: lib_hash,
                    size: None,
                });
                m
            },
        };
        let root_json = serde_json::to_vec(&root_tree).unwrap();
        let root_hash = cas.store_tree(&root_json).unwrap();

        let fetched = cas.fetch_from_tree(&root_hash, "lib/util.js").unwrap();
        assert_eq!(fetched, util_src);
    }

    #[test]
    fn fetch_from_tree_missing_entry() {
        let tmp = tempfile::tempdir().unwrap();
        let cas = ContentStore::open(tmp.path()).unwrap();

        let tree = TreeManifest {
            entries: HashMap::new(),
        };
        let tree_json = serde_json::to_vec(&tree).unwrap();
        let root_hash = cas.store_tree(&tree_json).unwrap();

        let result = cas.fetch_from_tree(&root_hash, "nonexistent.js");
        assert!(result.is_err());
    }

    #[test]
    fn gc_removes_unreferenced() {
        let tmp = tempfile::tempdir().unwrap();
        let cas = ContentStore::open(tmp.path()).unwrap();

        let keep_hash = cas.store(b"keep me", "blob").unwrap();
        let remove_hash = cas.store(b"remove me", "blob").unwrap();

        cas.retain(&keep_hash);

        let report = cas.gc(&HashSet::new()).unwrap();
        assert_eq!(report.freed_count, 1);
        assert!(cas.has(&keep_hash));
        assert!(!cas.has(&remove_hash));
    }

    #[test]
    fn gc_preserves_live_roots() {
        let tmp = tempfile::tempdir().unwrap();
        let cas = ContentStore::open(tmp.path()).unwrap();

        let h1 = cas.store(b"root 1", "blob").unwrap();
        let h2 = cas.store(b"root 2", "blob").unwrap();

        let mut live = HashSet::new();
        live.insert(h1.clone());
        live.insert(h2.clone());

        let report = cas.gc(&live).unwrap();
        assert_eq!(report.freed_count, 0);
        assert!(cas.has(&h1));
        assert!(cas.has(&h2));
    }

    #[test]
    fn gc_preserves_tree_children() {
        let tmp = tempfile::tempdir().unwrap();
        let cas = ContentStore::open(tmp.path()).unwrap();

        let blob_hash = cas.store(b"tree child", "blob").unwrap();
        let tree = TreeManifest {
            entries: {
                let mut m = HashMap::new();
                m.insert("child.js".to_string(), TreeEntry {
                    entry_type: "blob".to_string(),
                    hash: blob_hash.clone(),
                    size: Some(10),
                });
                m
            },
        };
        let tree_json = serde_json::to_vec(&tree).unwrap();
        let tree_hash = cas.store_tree(&tree_json).unwrap();
        let orphan = cas.store(b"orphan", "blob").unwrap();

        // Only the tree is a live root — its child should be preserved.
        let mut live = HashSet::new();
        live.insert(tree_hash.clone());

        let report = cas.gc(&live).unwrap();
        assert_eq!(report.freed_count, 1); // orphan removed
        assert!(cas.has(&tree_hash));
        assert!(cas.has(&blob_hash)); // child preserved
        assert!(!cas.has(&orphan));
    }

    #[test]
    fn structural_sharing() {
        let tmp = tempfile::tempdir().unwrap();
        let cas = ContentStore::open(tmp.path()).unwrap();

        // Two trees sharing the same blob.
        let shared_blob = cas.store(b"shared content", "blob").unwrap();

        let tree1 = TreeManifest {
            entries: {
                let mut m = HashMap::new();
                m.insert("shared.js".to_string(), TreeEntry {
                    entry_type: "blob".to_string(),
                    hash: shared_blob.clone(),
                    size: Some(14),
                });
                m
            },
        };
        let tree2 = TreeManifest {
            entries: {
                let mut m = HashMap::new();
                m.insert("also-shared.js".to_string(), TreeEntry {
                    entry_type: "blob".to_string(),
                    hash: shared_blob.clone(),
                    size: Some(14),
                });
                m
            },
        };

        let h1 = cas.store_tree(&serde_json::to_vec(&tree1).unwrap()).unwrap();
        let h2 = cas.store_tree(&serde_json::to_vec(&tree2).unwrap()).unwrap();

        // Trees have different hashes.
        assert_ne!(h1, h2);
        // But both reference the same blob.
        let b1 = cas.read_tree(&h1).unwrap().entries["shared.js"].hash.clone();
        let b2 = cas.read_tree(&h2).unwrap().entries["also-shared.js"].hash.clone();
        assert_eq!(b1, b2);
        assert_eq!(b1, shared_blob);
    }
}
