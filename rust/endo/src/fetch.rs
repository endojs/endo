//! NPM package fetching: registry metadata, tarball download,
//! integrity verification, and CAS extraction.
//!
//! This module bridges the npm registry to the local CAS and the
//! [`RegistryTable`].
//! Given a package name and a specific version, [`fetch_package`]:
//!
//! 1. Looks up the package's version metadata from the npm registry
//!    (cached in `package_meta`).
//! 2. Selects the version's `dist.tarball` URL and `dist.integrity`.
//! 3. Downloads the gzipped tarball.
//! 4. Verifies the SHA-512 integrity against the downloaded bytes.
//! 5. Extracts the tarball into the CAS (stripping the leading
//!    `package/` directory that npm wraps every tarball in).
//! 6. Writes a tree manifest pointing at the extracted files and
//!    stores it as the package's tree.
//! 7. Records `(name, version, tree_hash, integrity)` in the
//!    registry table.
//!
//! The HTTP client is [`ureq`], chosen for its small dependency
//! footprint and blocking interface.
//! The registry fetch is a short-lived synchronous operation; the
//! caller is expected to schedule it onto a worker thread if it
//! needs to interleave with an async runtime.

use std::collections::HashMap;
use std::io::{self, Read};

use base64::Engine;
use flate2::read::GzDecoder;
use serde::Deserialize;
use sha2::{Digest, Sha512};
use tar::Archive;

use crate::cas::{ContentStore, TreeEntry, TreeManifest};
use crate::registry::RegistryTable;

/// Default npm registry URL.
pub const DEFAULT_REGISTRY: &str = "https://registry.npmjs.org/";

/// User-Agent string used for registry requests.
pub const USER_AGENT: &str = concat!("endor/", env!("CARGO_PKG_VERSION"));

/// Subset of the npm registry's per-version document that this
/// module consumes.
///
/// The registry returns many more fields per version; we only need
/// `dist`.
#[derive(Debug, Deserialize)]
struct VersionDoc {
    dist: Dist,
}

#[derive(Debug, Deserialize)]
struct Dist {
    tarball: String,
    /// Subresource-integrity string, e.g. `sha512-<base64>`.
    integrity: Option<String>,
    /// Legacy SHA-1 hex shasum field, fallback when `integrity` is
    /// absent on very old packages.
    #[allow(dead_code)]
    shasum: Option<String>,
}

/// Top-level npm-registry response.
#[derive(Debug, Deserialize)]
struct PackageMeta {
    versions: HashMap<String, VersionDoc>,
}

/// Successful outcome of [`fetch_package`].
#[derive(Debug, Clone)]
pub struct FetchResult {
    pub name: String,
    pub version: String,
    /// The hex SHA-256 tree hash of the extracted package in the
    /// CAS.
    pub tree_hash: String,
    /// The integrity string the registry advertised, recorded for
    /// audit.
    pub integrity: Option<String>,
}

/// Errors that can arise during a package fetch.
#[derive(Debug)]
pub enum FetchError {
    /// Network or HTTP error talking to the registry.
    Http(String),
    /// The registry returned malformed or unexpected JSON.
    BadMetadata(String),
    /// The requested version is not present in the registry's
    /// metadata for this package.
    VersionMissing { name: String, version: String },
    /// The downloaded tarball failed its integrity check.
    IntegrityMismatch {
        expected: String,
        actual: String,
    },
    /// The integrity string the registry returned was not in the
    /// recognised SRI form we support (e.g. `sha512-<base64>`).
    UnsupportedIntegrity(String),
    /// Tarball extraction or CAS write failed.
    Io(io::Error),
}

impl std::fmt::Display for FetchError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FetchError::Http(msg) => write!(f, "http: {msg}"),
            FetchError::BadMetadata(msg) => write!(f, "bad metadata: {msg}"),
            FetchError::VersionMissing { name, version } => {
                write!(f, "version not in registry: {name}@{version}")
            }
            FetchError::IntegrityMismatch { expected, actual } => write!(
                f,
                "integrity mismatch: expected {expected}, got {actual}"
            ),
            FetchError::UnsupportedIntegrity(s) => {
                write!(f, "unsupported integrity form: {s}")
            }
            FetchError::Io(e) => write!(f, "io: {e}"),
        }
    }
}

impl std::error::Error for FetchError {}

impl From<io::Error> for FetchError {
    fn from(e: io::Error) -> Self {
        FetchError::Io(e)
    }
}

/// Abstraction over the HTTP layer so tests can substitute an
/// in-memory transport.
///
/// The two methods correspond to the two registry interactions:
/// fetching the per-package metadata JSON and fetching the tarball
/// bytes.
pub trait HttpClient {
    /// GET the package metadata JSON (e.g.
    /// `https://registry.npmjs.org/is-odd`).
    fn get_metadata(&self, url: &str) -> Result<Vec<u8>, FetchError>;
    /// GET the tarball bytes (e.g.
    /// `https://registry.npmjs.org/is-odd/-/is-odd-3.0.1.tgz`).
    fn get_tarball(&self, url: &str) -> Result<Vec<u8>, FetchError>;
}

/// Default HTTP client backed by [`ureq`].
pub struct UreqClient {
    agent: ureq::Agent,
}

impl UreqClient {
    pub fn new() -> Self {
        let agent = ureq::AgentBuilder::new()
            .user_agent(USER_AGENT)
            .build();
        UreqClient { agent }
    }
}

impl Default for UreqClient {
    fn default() -> Self {
        UreqClient::new()
    }
}

impl HttpClient for UreqClient {
    fn get_metadata(&self, url: &str) -> Result<Vec<u8>, FetchError> {
        let mut body = Vec::new();
        self.agent
            .get(url)
            .set("accept", "application/json")
            .call()
            .map_err(|e| FetchError::Http(format!("metadata GET {url}: {e}")))?
            .into_reader()
            .read_to_end(&mut body)
            .map_err(|e| FetchError::Http(format!("metadata read {url}: {e}")))?;
        Ok(body)
    }

    fn get_tarball(&self, url: &str) -> Result<Vec<u8>, FetchError> {
        let mut body = Vec::new();
        self.agent
            .get(url)
            .call()
            .map_err(|e| FetchError::Http(format!("tarball GET {url}: {e}")))?
            .into_reader()
            .read_to_end(&mut body)
            .map_err(|e| FetchError::Http(format!("tarball read {url}: {e}")))?;
        Ok(body)
    }
}

/// Fetch the package metadata document, consulting the
/// `package_meta` cache first.
///
/// On a cache miss, fetches from `{registry_url}{name}`, caches the
/// raw JSON in the `package_meta` table, then returns it.
///
/// The returned bytes are the raw JSON body of the registry's
/// per-package document.
pub fn fetch_metadata_cached<H: HttpClient>(
    http: &H,
    registry_table: &RegistryTable,
    registry_url: &str,
    name: &str,
) -> Result<Vec<u8>, FetchError> {
    if let Some(cached) = registry_table
        .get_meta(name)
        .map_err(FetchError::Io)?
    {
        return Ok(cached.into_bytes());
    }
    let url = format!("{}{}", normalize_registry_url(registry_url), name);
    let body = http.get_metadata(&url)?;
    let body_str = std::str::from_utf8(&body)
        .map_err(|e| FetchError::BadMetadata(format!("non-utf8 body: {e}")))?;
    registry_table
        .set_meta(name, body_str)
        .map_err(FetchError::Io)?;
    Ok(body)
}

/// Fetch a single (name, version) pair.
///
/// Steps:
///
/// 1. Look up `(name, version)` in the registry table.  If present,
///    return early.
/// 2. Fetch (or load from cache) the package metadata.
/// 3. Select the version's `dist.tarball` and `dist.integrity`.
/// 4. Download the tarball, verify integrity, extract to CAS.
/// 5. Insert `(name, version, tree_hash, integrity)` into the
///    registry table.
pub fn fetch_package<H: HttpClient>(
    http: &H,
    cas: &ContentStore,
    registry_table: &RegistryTable,
    registry_url: &str,
    name: &str,
    version: &str,
) -> Result<FetchResult, FetchError> {
    // Fast path: already in the registry table.
    if let Some(entry) = registry_table.lookup(name, version).map_err(FetchError::Io)? {
        return Ok(FetchResult {
            name: entry.name,
            version: entry.version,
            tree_hash: entry.hash,
            integrity: entry.integrity,
        });
    }

    let meta_body = fetch_metadata_cached(http, registry_table, registry_url, name)?;
    let meta: PackageMeta = serde_json::from_slice(&meta_body)
        .map_err(|e| FetchError::BadMetadata(format!("parse metadata: {e}")))?;
    let version_doc = meta.versions.get(version).ok_or_else(|| {
        FetchError::VersionMissing {
            name: name.to_string(),
            version: version.to_string(),
        }
    })?;

    let tarball_bytes = http.get_tarball(&version_doc.dist.tarball)?;

    if let Some(integrity) = &version_doc.dist.integrity {
        verify_integrity(integrity, &tarball_bytes)?;
    }
    // If integrity is missing (very old packages publish only
    // `shasum`), we still extract but leave verification to the
    // caller's policy layer.  The integrity column will be NULL.

    let tree_hash = extract_tarball_to_cas(&tarball_bytes, cas)?;

    registry_table
        .insert(
            name,
            version,
            &tree_hash,
            version_doc.dist.integrity.as_deref(),
        )
        .map_err(FetchError::Io)?;

    Ok(FetchResult {
        name: name.to_string(),
        version: version.to_string(),
        tree_hash,
        integrity: version_doc.dist.integrity.clone(),
    })
}

/// Verify a subresource-integrity string against the downloaded
/// bytes.
///
/// Supports the `sha512-<base64>` form npm publishes today.
/// Returns `Ok(())` on match; `Err(FetchError::IntegrityMismatch)`
/// when the digest disagrees; and
/// `Err(FetchError::UnsupportedIntegrity)` when the algorithm
/// prefix is not one we recognise.
pub fn verify_integrity(integrity: &str, bytes: &[u8]) -> Result<(), FetchError> {
    let (alg, expected_b64) = integrity
        .split_once('-')
        .ok_or_else(|| FetchError::UnsupportedIntegrity(integrity.to_string()))?;
    if alg != "sha512" {
        return Err(FetchError::UnsupportedIntegrity(integrity.to_string()));
    }
    let expected = base64::engine::general_purpose::STANDARD
        .decode(expected_b64)
        .map_err(|e| {
            FetchError::UnsupportedIntegrity(format!("{integrity}: {e}"))
        })?;
    let mut hasher = Sha512::new();
    hasher.update(bytes);
    let actual = hasher.finalize();
    if actual.as_slice() == expected.as_slice() {
        Ok(())
    } else {
        let actual_b64 =
            base64::engine::general_purpose::STANDARD.encode(actual.as_slice());
        Err(FetchError::IntegrityMismatch {
            expected: integrity.to_string(),
            actual: format!("sha512-{actual_b64}"),
        })
    }
}

/// Decompress and extract an npm tarball into the CAS, returning
/// the hex SHA-256 of the resulting tree manifest.
///
/// npm tarballs are gzipped POSIX tar archives wrapping a single
/// top-level `package/` directory; this function strips that
/// prefix.
/// Each regular file is stored as a CAS blob; nested directories
/// are recursively assembled into tree manifests.
/// Entries that are not regular files (symlinks, hardlinks,
/// devices) are ignored, matching the *de facto* npm rule that
/// publishable packages are made of regular files only.
pub fn extract_tarball_to_cas(
    tarball: &[u8],
    cas: &ContentStore,
) -> Result<String, FetchError> {
    let decoder = GzDecoder::new(tarball);
    let mut archive = Archive::new(decoder);

    // Build an intermediate directory tree, then walk it in
    // post-order to materialise tree manifests in the CAS.
    let mut root = DirNode::new();

    for entry in archive.entries().map_err(FetchError::Io)? {
        let mut entry = entry.map_err(FetchError::Io)?;
        let header = entry.header().clone();
        if !matches!(header.entry_type(), tar::EntryType::Regular) {
            continue;
        }
        let path = entry.path().map_err(FetchError::Io)?.into_owned();
        let mut components = path.components().peekable();
        // Strip the leading `package/` (or whatever the single
        // top-level directory is named) so the CAS tree mirrors the
        // installed-package shape.
        if components.peek().is_some() {
            components.next();
        }
        let parts: Vec<String> = components
            .filter_map(|c| {
                let s = c.as_os_str().to_string_lossy().to_string();
                if s.is_empty() || s == "." {
                    None
                } else {
                    Some(s)
                }
            })
            .collect();
        if parts.is_empty() {
            // Skip the bare top-level directory entry itself.
            continue;
        }

        let mut data = Vec::with_capacity(header.size().unwrap_or(0) as usize);
        entry.read_to_end(&mut data).map_err(FetchError::Io)?;
        let blob_hash = cas.store(&data, "blob").map_err(FetchError::Io)?;
        root.insert(&parts, blob_hash, data.len() as u64);
    }

    let tree_hash = materialise(&root, cas)?;
    Ok(tree_hash)
}

/// In-memory mirror of the tarball's directory layout, used to
/// stage the CAS tree-manifest writes in post-order.
#[derive(Default)]
struct DirNode {
    files: HashMap<String, (String, u64)>,
    dirs: HashMap<String, DirNode>,
}

impl DirNode {
    fn new() -> Self {
        DirNode::default()
    }

    fn insert(&mut self, parts: &[String], hash: String, size: u64) {
        match parts {
            [] => {}
            [name] => {
                self.files.insert(name.clone(), (hash, size));
            }
            [head, tail @ ..] => {
                self.dirs
                    .entry(head.clone())
                    .or_insert_with(DirNode::new)
                    .insert(tail, hash, size);
            }
        }
    }
}

fn materialise(node: &DirNode, cas: &ContentStore) -> Result<String, FetchError> {
    // Stage entries in a HashMap so we honour `TreeManifest`'s
    // declared type, then hand-serialise the JSON with sorted keys
    // for tree-hash determinism (a plain `serde_json::to_vec` on a
    // `HashMap` iterates in non-deterministic order, which would
    // make the same input tarball hash differently across runs).
    let mut entries: HashMap<String, TreeEntry> = HashMap::new();
    for (name, (hash, size)) in &node.files {
        entries.insert(
            name.clone(),
            TreeEntry {
                entry_type: "blob".to_string(),
                hash: hash.clone(),
                size: Some(*size),
            },
        );
    }
    for (name, child) in &node.dirs {
        let child_hash = materialise(child, cas)?;
        entries.insert(
            name.clone(),
            TreeEntry {
                entry_type: "tree".to_string(),
                hash: child_hash,
                size: None,
            },
        );
    }
    let manifest = TreeManifest { entries };
    let bytes = encode_manifest_sorted(&manifest)?;
    cas.store_tree(&bytes).map_err(FetchError::Io)
}

/// Encode a [`TreeManifest`] as JSON with the `entries` object's
/// keys in sorted order, so the on-disk byte order (and hence the
/// CAS hash) is a stable function of the input.
///
/// `serde_json::to_vec` on the wrapped `HashMap` iterates in
/// non-deterministic order; routing through `serde_json::Map`
/// (which is backed by `BTreeMap` by default) sorts the keys.
fn encode_manifest_sorted(manifest: &TreeManifest) -> Result<Vec<u8>, FetchError> {
    let mut map = serde_json::Map::new();
    for (name, entry) in &manifest.entries {
        map.insert(
            name.clone(),
            serde_json::to_value(entry).map_err(|e| {
                FetchError::Io(io::Error::new(
                    io::ErrorKind::Other,
                    format!("encode entry: {e}"),
                ))
            })?,
        );
    }
    let mut outer = serde_json::Map::new();
    outer.insert("entries".to_string(), serde_json::Value::Object(map));
    serde_json::to_vec(&serde_json::Value::Object(outer)).map_err(|e| {
        FetchError::Io(io::Error::new(
            io::ErrorKind::Other,
            format!("encode tree: {e}"),
        ))
    })
}

/// Ensure the registry URL ends with `/`, so concatenation with a
/// package name produces a well-formed URL.
fn normalize_registry_url(url: &str) -> String {
    if url.ends_with('/') {
        url.to_string()
    } else {
        format!("{url}/")
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::io::Write;

    /// In-memory `HttpClient` implementation for hermetic tests.
    /// Maps URL → response body.
    struct MockHttp {
        responses: HashMap<String, Vec<u8>>,
        calls: RefCell<Vec<String>>,
    }

    impl MockHttp {
        fn new() -> Self {
            MockHttp {
                responses: HashMap::new(),
                calls: RefCell::new(Vec::new()),
            }
        }
        fn respond(mut self, url: &str, body: Vec<u8>) -> Self {
            self.responses.insert(url.to_string(), body);
            self
        }
    }

    impl HttpClient for MockHttp {
        fn get_metadata(&self, url: &str) -> Result<Vec<u8>, FetchError> {
            self.calls.borrow_mut().push(format!("META {url}"));
            self.responses
                .get(url)
                .cloned()
                .ok_or_else(|| FetchError::Http(format!("no mock for {url}")))
        }
        fn get_tarball(&self, url: &str) -> Result<Vec<u8>, FetchError> {
            self.calls.borrow_mut().push(format!("TAR {url}"));
            self.responses
                .get(url)
                .cloned()
                .ok_or_else(|| FetchError::Http(format!("no mock for {url}")))
        }
    }

    /// Build a gzipped tar containing the given (path, content)
    /// entries.
    /// Paths are written verbatim; callers prefix `package/` as npm
    /// does.
    fn make_tarball(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let mut tar_buf = Vec::new();
        {
            let mut builder = tar::Builder::new(&mut tar_buf);
            for (path, content) in entries {
                let mut header = tar::Header::new_gnu();
                header.set_size(content.len() as u64);
                header.set_mode(0o644);
                header.set_cksum();
                builder
                    .append_data(&mut header, path, *content)
                    .unwrap();
            }
            builder.finish().unwrap();
        }
        let mut gz = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        gz.write_all(&tar_buf).unwrap();
        gz.finish().unwrap()
    }

    /// SHA-512 → npm-style `sha512-<base64>` integrity string.
    fn sri_sha512(bytes: &[u8]) -> String {
        let mut hasher = Sha512::new();
        hasher.update(bytes);
        let digest = hasher.finalize();
        format!(
            "sha512-{}",
            base64::engine::general_purpose::STANDARD.encode(digest.as_slice())
        )
    }

    fn fresh_cas() -> (tempfile::TempDir, ContentStore) {
        let tmp = tempfile::tempdir().unwrap();
        let cas = ContentStore::open(tmp.path()).unwrap();
        (tmp, cas)
    }

    #[test]
    fn verify_integrity_round_trip() {
        let payload = b"hello, npm";
        let sri = sri_sha512(payload);
        assert!(verify_integrity(&sri, payload).is_ok());
    }

    #[test]
    fn verify_integrity_detects_tampering() {
        let payload = b"hello, npm";
        let sri = sri_sha512(payload);
        let tampered = b"hello, NPM";
        match verify_integrity(&sri, tampered) {
            Err(FetchError::IntegrityMismatch { .. }) => {}
            other => panic!("expected IntegrityMismatch, got {other:?}"),
        }
    }

    #[test]
    fn verify_integrity_rejects_unknown_algorithm() {
        let payload = b"x";
        match verify_integrity("sha1-deadbeef", payload) {
            Err(FetchError::UnsupportedIntegrity(_)) => {}
            other => panic!("expected UnsupportedIntegrity, got {other:?}"),
        }
    }

    #[test]
    fn extract_strips_package_prefix() {
        let (_tmp, cas) = fresh_cas();
        let tarball = make_tarball(&[
            ("package/package.json", br#"{"name":"is-odd","version":"3.0.1"}"# as &[u8]),
            ("package/index.js", b"module.exports = n => n % 2 === 1;\n"),
            ("package/lib/util.js", b"// utility\n"),
        ]);
        let tree_hash = extract_tarball_to_cas(&tarball, &cas).unwrap();

        let names = cas.list_tree(&tree_hash).unwrap();
        assert!(
            names.contains(&"package.json".to_string()),
            "expected package.json at root, got {names:?}"
        );
        assert!(
            names.contains(&"index.js".to_string()),
            "expected index.js at root, got {names:?}"
        );
        assert!(
            names.contains(&"lib".to_string()),
            "expected lib/ subtree at root, got {names:?}"
        );

        // The `package/` directory itself must not appear; the tree
        // shape is rooted at the package contents.
        assert!(
            !names.contains(&"package".to_string()),
            "package/ prefix leaked into CAS tree: {names:?}"
        );

        let pj = cas
            .fetch_from_tree(&tree_hash, "package.json")
            .unwrap();
        assert_eq!(pj, br#"{"name":"is-odd","version":"3.0.1"}"# as &[u8]);

        let util = cas.fetch_from_tree(&tree_hash, "lib/util.js").unwrap();
        assert_eq!(util, b"// utility\n");
    }

    #[test]
    fn extract_is_deterministic() {
        // Same input bytes → same tree hash, regardless of insertion
        // order in the tar.  Both archives carry the same files but
        // in different order.
        let (_tmp_a, cas_a) = fresh_cas();
        let (_tmp_b, cas_b) = fresh_cas();
        let entries_a: &[(&str, &[u8])] = &[
            ("package/a.js", b"A"),
            ("package/b.js", b"B"),
        ];
        let entries_b: &[(&str, &[u8])] = &[
            ("package/b.js", b"B"),
            ("package/a.js", b"A"),
        ];
        let h_a = extract_tarball_to_cas(&make_tarball(entries_a), &cas_a).unwrap();
        let h_b = extract_tarball_to_cas(&make_tarball(entries_b), &cas_b).unwrap();
        assert_eq!(h_a, h_b, "tree hash drifted with tar order");
    }

    #[test]
    fn fetch_package_end_to_end_with_mock() {
        let (_tmp, cas) = fresh_cas();
        let registry = RegistryTable::open_in_memory().unwrap();

        let tarball = make_tarball(&[
            ("package/package.json", br#"{"name":"is-odd","version":"3.0.1"}"# as &[u8]),
            ("package/index.js", b"module.exports = n => n % 2 === 1;\n"),
        ]);
        let integrity = sri_sha512(&tarball);
        let tarball_url = "https://registry.npmjs.org/is-odd/-/is-odd-3.0.1.tgz";
        let metadata = format!(
            r#"{{"versions":{{"3.0.1":{{"dist":{{"tarball":"{tarball_url}","integrity":"{integrity}"}}}}}}}}"#
        );

        let http = MockHttp::new()
            .respond("https://registry.npmjs.org/is-odd", metadata.into_bytes())
            .respond(tarball_url, tarball.clone());

        let result = fetch_package(
            &http,
            &cas,
            &registry,
            DEFAULT_REGISTRY,
            "is-odd",
            "3.0.1",
        )
        .unwrap();

        assert_eq!(result.name, "is-odd");
        assert_eq!(result.version, "3.0.1");
        assert_eq!(result.integrity.as_deref(), Some(integrity.as_str()));

        // The registry table now carries the entry.
        let entry = registry.lookup("is-odd", "3.0.1").unwrap().unwrap();
        assert_eq!(entry.hash, result.tree_hash);

        // The CAS contains the extracted files at the expected
        // paths.
        let pj = cas
            .fetch_from_tree(&result.tree_hash, "package.json")
            .unwrap();
        assert_eq!(
            pj,
            br#"{"name":"is-odd","version":"3.0.1"}"# as &[u8],
            "package.json round-tripped through fetch_package"
        );

        // A second call hits the cache: no further HTTP calls.
        let before = http.calls.borrow().len();
        let again = fetch_package(
            &http,
            &cas,
            &registry,
            DEFAULT_REGISTRY,
            "is-odd",
            "3.0.1",
        )
        .unwrap();
        assert_eq!(again.tree_hash, result.tree_hash);
        assert_eq!(
            http.calls.borrow().len(),
            before,
            "cached lookup must not call HTTP"
        );
    }

    #[test]
    fn fetch_package_rejects_tampered_tarball() {
        // Regression evidence: if `fetch_package` skipped the
        // integrity check, this test would silently extract a
        // tarball whose contents do not match `dist.integrity`.
        let (_tmp, cas) = fresh_cas();
        let registry = RegistryTable::open_in_memory().unwrap();

        let real_tarball = make_tarball(&[
            ("package/package.json", br#"{"name":"x","version":"1.0.0"}"# as &[u8]),
        ]);
        let claimed_integrity = sri_sha512(&real_tarball);
        let tampered_tarball = make_tarball(&[
            ("package/package.json", br#"{"name":"x","version":"1.0.0","evil":true}"# as &[u8]),
        ]);
        let tarball_url = "https://registry.npmjs.org/x/-/x-1.0.0.tgz";
        let metadata = format!(
            r#"{{"versions":{{"1.0.0":{{"dist":{{"tarball":"{tarball_url}","integrity":"{claimed_integrity}"}}}}}}}}"#
        );

        let http = MockHttp::new()
            .respond("https://registry.npmjs.org/x", metadata.into_bytes())
            .respond(tarball_url, tampered_tarball);

        match fetch_package(
            &http,
            &cas,
            &registry,
            DEFAULT_REGISTRY,
            "x",
            "1.0.0",
        ) {
            Err(FetchError::IntegrityMismatch { .. }) => {}
            other => panic!("expected IntegrityMismatch, got {other:?}"),
        }
        // Registry must not have been updated.
        assert!(registry.lookup("x", "1.0.0").unwrap().is_none());
    }

    #[test]
    fn fetch_package_reports_missing_version() {
        let (_tmp, cas) = fresh_cas();
        let registry = RegistryTable::open_in_memory().unwrap();
        let metadata =
            r#"{"versions":{"1.0.0":{"dist":{"tarball":"https://example.invalid/x.tgz"}}}}"#;
        let http = MockHttp::new()
            .respond("https://registry.npmjs.org/x", metadata.as_bytes().to_vec());

        match fetch_package(
            &http,
            &cas,
            &registry,
            DEFAULT_REGISTRY,
            "x",
            "9.9.9",
        ) {
            Err(FetchError::VersionMissing { name, version }) => {
                assert_eq!(name, "x");
                assert_eq!(version, "9.9.9");
            }
            other => panic!("expected VersionMissing, got {other:?}"),
        }
    }

    #[test]
    fn metadata_cache_round_trip() {
        // First fetch hits the network, second comes from cache;
        // mock's call log must not grow on the second call.
        let registry = RegistryTable::open_in_memory().unwrap();
        let body = br#"{"versions":{}}"#;
        let http = MockHttp::new()
            .respond("https://registry.npmjs.org/foo", body.to_vec());

        let first =
            fetch_metadata_cached(&http, &registry, DEFAULT_REGISTRY, "foo").unwrap();
        let calls_after_first = http.calls.borrow().len();
        let second =
            fetch_metadata_cached(&http, &registry, DEFAULT_REGISTRY, "foo").unwrap();
        assert_eq!(first, second);
        assert_eq!(
            http.calls.borrow().len(),
            calls_after_first,
            "second call should hit cache, not HTTP"
        );
    }

    #[test]
    fn normalize_registry_url_appends_slash() {
        assert_eq!(
            normalize_registry_url("https://registry.npmjs.org"),
            "https://registry.npmjs.org/"
        );
        assert_eq!(
            normalize_registry_url("https://registry.npmjs.org/"),
            "https://registry.npmjs.org/"
        );
    }

    #[test]
    fn extract_ignores_non_regular_entries() {
        // A tar with a directory entry plus a regular file.  The
        // directory entry must be ignored; only the file's content
        // ends up in the CAS.
        let mut tar_buf = Vec::new();
        {
            let mut builder = tar::Builder::new(&mut tar_buf);
            let mut dir_header = tar::Header::new_gnu();
            dir_header.set_entry_type(tar::EntryType::Directory);
            dir_header.set_size(0);
            dir_header.set_mode(0o755);
            dir_header.set_cksum();
            builder
                .append_data(&mut dir_header, "package/lib/", &[][..])
                .unwrap();

            let mut file_header = tar::Header::new_gnu();
            file_header.set_size(2);
            file_header.set_mode(0o644);
            file_header.set_cksum();
            builder
                .append_data(&mut file_header, "package/lib/x.js", b"ok" as &[u8])
                .unwrap();
            builder.finish().unwrap();
        }
        let mut gz =
            flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        gz.write_all(&tar_buf).unwrap();
        let tarball = gz.finish().unwrap();

        let (_tmp, cas) = fresh_cas();
        let tree_hash = extract_tarball_to_cas(&tarball, &cas).unwrap();
        let names = cas.list_tree(&tree_hash).unwrap();
        assert_eq!(names, vec!["lib"]);
        let lib_bytes = cas.fetch_from_tree(&tree_hash, "lib/x.js").unwrap();
        assert_eq!(lib_bytes, b"ok");
    }

    #[test]
    fn fetch_package_fast_path_returns_cached_entry() {
        // Pre-seed the registry table; `fetch_package` must short-circuit
        // before touching HTTP.  Regression evidence: if the fast-path
        // were skipped, the empty `MockHttp` would surface a `no mock for
        // ...` error instead of returning the seeded entry.
        let (_tmp, cas) = fresh_cas();
        let registry = RegistryTable::open_in_memory().unwrap();
        registry
            .insert("pre-seeded", "1.2.3", "deadbeef", Some("sha512-cached"))
            .unwrap();

        let http = MockHttp::new();
        let result = fetch_package(
            &http,
            &cas,
            &registry,
            DEFAULT_REGISTRY,
            "pre-seeded",
            "1.2.3",
        )
        .expect("fast-path lookup should not hit HTTP");
        assert_eq!(result.name, "pre-seeded");
        assert_eq!(result.version, "1.2.3");
        assert_eq!(result.tree_hash, "deadbeef");
        assert_eq!(result.integrity.as_deref(), Some("sha512-cached"));
        assert!(
            http.calls.borrow().is_empty(),
            "fast-path must not call HTTP at all, saw {:?}",
            http.calls.borrow()
        );
    }

    #[test]
    fn fetch_package_accepts_missing_integrity() {
        // Very old packages publish `shasum` but no `integrity`.  The
        // module's contract is to extract anyway and store `integrity =
        // NULL`.  Regression evidence: if the missing-integrity branch
        // accidentally short-circuited to an error (e.g. someone made
        // `dist.integrity` required), the result would be `Err(...)`
        // instead of `Ok`, and the registry would stay empty.
        let (_tmp, cas) = fresh_cas();
        let registry = RegistryTable::open_in_memory().unwrap();

        let tarball = make_tarball(&[(
            "package/package.json",
            br#"{"name":"legacy","version":"0.0.1"}"# as &[u8],
        )]);
        let tarball_url = "https://registry.npmjs.org/legacy/-/legacy-0.0.1.tgz";
        // No `integrity` field; only `tarball` (and no `shasum` either,
        // which is fine: shasum is only read via the `#[allow(dead_code)]`
        // field and never enforced here).
        let metadata = format!(
            r#"{{"versions":{{"0.0.1":{{"dist":{{"tarball":"{tarball_url}"}}}}}}}}"#
        );

        let http = MockHttp::new()
            .respond(
                "https://registry.npmjs.org/legacy",
                metadata.into_bytes(),
            )
            .respond(tarball_url, tarball.clone());

        let result = fetch_package(
            &http,
            &cas,
            &registry,
            DEFAULT_REGISTRY,
            "legacy",
            "0.0.1",
        )
        .expect("missing-integrity branch must still extract");
        assert!(
            result.integrity.is_none(),
            "expected integrity=None, got {:?}",
            result.integrity
        );
        let entry = registry.lookup("legacy", "0.0.1").unwrap().unwrap();
        assert!(
            entry.integrity.is_none(),
            "registry row should carry NULL integrity"
        );
        // The extracted file still landed in the CAS.
        let pj = cas
            .fetch_from_tree(&entry.hash, "package.json")
            .unwrap();
        assert_eq!(pj, br#"{"name":"legacy","version":"0.0.1"}"# as &[u8]);
    }

    #[test]
    fn fetch_package_reports_malformed_metadata() {
        // The registry responded with text that is not parseable as the
        // expected JSON shape.  Regression evidence: if the JSON parse
        // were elided (or its error swallowed into the cache write),
        // `fetch_package` would either panic or silently proceed with an
        // empty `versions` map and report `VersionMissing` rather than
        // `BadMetadata`.
        let (_tmp, cas) = fresh_cas();
        let registry = RegistryTable::open_in_memory().unwrap();
        let http = MockHttp::new().respond(
            "https://registry.npmjs.org/broken",
            b"this is not json".to_vec(),
        );

        match fetch_package(
            &http,
            &cas,
            &registry,
            DEFAULT_REGISTRY,
            "broken",
            "1.0.0",
        ) {
            Err(FetchError::BadMetadata(msg)) => {
                assert!(
                    msg.contains("parse metadata"),
                    "expected BadMetadata to mention parse, got {msg:?}"
                );
            }
            other => panic!("expected BadMetadata, got {other:?}"),
        }
    }

    #[test]
    fn fetch_metadata_cached_rejects_non_utf8_body() {
        // A registry that returns bytes which are not valid UTF-8 should
        // surface as `BadMetadata("non-utf8 body: ...")`, because the
        // cache layer stores text and refuses to round-trip arbitrary
        // bytes.  Regression evidence: dropping the UTF-8 check would
        // bypass into `set_meta(name, str)` with a panicking
        // `from_utf8_unchecked` or surface a less useful error.
        let registry = RegistryTable::open_in_memory().unwrap();
        let http = MockHttp::new().respond(
            "https://registry.npmjs.org/binary",
            vec![0xFF, 0xFE, 0xFD, 0xFC],
        );
        match fetch_metadata_cached(&http, &registry, DEFAULT_REGISTRY, "binary") {
            Err(FetchError::BadMetadata(msg)) => {
                assert!(
                    msg.contains("non-utf8"),
                    "expected non-utf8 mention, got {msg:?}"
                );
            }
            other => panic!("expected BadMetadata(non-utf8 ...), got {other:?}"),
        }
        // Nothing should have been cached.
        assert!(registry.get_meta("binary").unwrap().is_none());
    }

    #[test]
    fn verify_integrity_rejects_missing_separator() {
        // An integrity string without the `<alg>-<b64>` separator is
        // not parseable.  Regression evidence: if `split_once('-')`
        // were swapped for a forgiving variant (or the test elided),
        // this input would either panic or be silently mis-classified.
        match verify_integrity("sha512sometingwithoutdash", b"x") {
            Err(FetchError::UnsupportedIntegrity(s)) => {
                assert_eq!(s, "sha512sometingwithoutdash");
            }
            other => panic!("expected UnsupportedIntegrity, got {other:?}"),
        }
    }

    #[test]
    fn verify_integrity_rejects_invalid_base64() {
        // Algorithm is correct (`sha512`), but the payload is not valid
        // base64.  This must surface as `UnsupportedIntegrity` with the
        // base64 decode error included.  Regression evidence: skipping
        // the `.map_err(...)` on the decode would turn this into a panic
        // (unwrap) or a misclassified `IntegrityMismatch`.
        match verify_integrity("sha512-not!valid!base64!@#$", b"x") {
            Err(FetchError::UnsupportedIntegrity(s)) => {
                assert!(
                    s.starts_with("sha512-not!valid!base64!@#$"),
                    "expected the integrity string in the error, got {s:?}"
                );
            }
            other => panic!("expected UnsupportedIntegrity, got {other:?}"),
        }
    }

    #[test]
    fn extract_tarball_to_cas_rejects_corrupt_gzip() {
        // A buffer that is not a valid gzip stream must surface as an
        // `Io` error from `extract_tarball_to_cas`, not a panic.
        // Regression evidence: a missing `.map_err(FetchError::Io)` on
        // `archive.entries()` would propagate as a raw `io::Error`,
        // breaking the typed-error contract.
        let (_tmp, cas) = fresh_cas();
        let garbage = b"this is definitely not gzip-compressed tar data";
        match extract_tarball_to_cas(garbage, &cas) {
            Err(FetchError::Io(_)) => {}
            other => panic!("expected Io error from corrupt gzip, got {other:?}"),
        }
    }

    #[test]
    fn extract_skips_bare_top_level_directory_entry() {
        // A tar whose first entry is a regular file named `package`
        // alone (no nested file under it) exercises the `parts.is_empty()`
        // branch that skips the bare top-level entry.  A second regular
        // file under `package/` confirms the rest of the extraction
        // still happens.  Regression evidence: removing the
        // `parts.is_empty()` guard *and* changing `DirNode::insert([],
        // ...)` to do anything other than a silent no-op would let a
        // stray `package` entry leak into (or corrupt) the extracted
        // tree.  The guard and the empty-arm together encode the
        // contract; this test pins both.
        let mut tar_buf = Vec::new();
        {
            let mut builder = tar::Builder::new(&mut tar_buf);
            // A regular-file entry literally named `package`. The
            // post-strip components list is empty, so the loop must
            // skip it.
            let mut bare_header = tar::Header::new_gnu();
            bare_header.set_size(5);
            bare_header.set_mode(0o644);
            bare_header.set_cksum();
            builder
                .append_data(&mut bare_header, "package", b"junk!" as &[u8])
                .unwrap();
            // And a real file inside `package/`.
            let mut real_header = tar::Header::new_gnu();
            real_header.set_size(2);
            real_header.set_mode(0o644);
            real_header.set_cksum();
            builder
                .append_data(&mut real_header, "package/a.js", b"ok" as &[u8])
                .unwrap();
            builder.finish().unwrap();
        }
        let mut gz =
            flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        gz.write_all(&tar_buf).unwrap();
        let tarball = gz.finish().unwrap();

        let (_tmp, cas) = fresh_cas();
        let tree_hash = extract_tarball_to_cas(&tarball, &cas).unwrap();
        let names = cas.list_tree(&tree_hash).unwrap();
        // Only `a.js` should appear at the root; the bare `package`
        // entry must not have leaked in.
        assert_eq!(names, vec!["a.js"]);
        let body = cas.fetch_from_tree(&tree_hash, "a.js").unwrap();
        assert_eq!(body, b"ok");
    }

    #[test]
    fn fetch_error_display_covers_every_variant() {
        // Every `FetchError` variant must produce a non-empty Display
        // string with the expected prefix.  Regression evidence: the
        // simplest way to break this is to add a new variant and forget
        // the `match` arm; that fails to compile, but a wrong prefix
        // (e.g. swapping "io:" for "http:") would silently degrade
        // diagnostics. The asserts pin the prefix.
        let http = FetchError::Http("net down".into());
        assert!(http.to_string().starts_with("http: "));

        let bad = FetchError::BadMetadata("xx".into());
        assert!(bad.to_string().starts_with("bad metadata: "));

        let missing = FetchError::VersionMissing {
            name: "foo".into(),
            version: "9.9.9".into(),
        };
        let m = missing.to_string();
        assert!(m.contains("foo@9.9.9"), "got {m:?}");
        assert!(m.starts_with("version not in registry"));

        let mismatch = FetchError::IntegrityMismatch {
            expected: "sha512-A".into(),
            actual: "sha512-B".into(),
        };
        let mm = mismatch.to_string();
        assert!(mm.starts_with("integrity mismatch"));
        assert!(mm.contains("sha512-A"));
        assert!(mm.contains("sha512-B"));

        let unsupported = FetchError::UnsupportedIntegrity("md5-xx".into());
        assert!(unsupported
            .to_string()
            .starts_with("unsupported integrity form: "));

        let io_err: FetchError =
            io::Error::new(io::ErrorKind::Other, "disk gone").into();
        let s = io_err.to_string();
        assert!(s.starts_with("io: "), "got {s:?}");
        assert!(s.contains("disk gone"));
    }

    #[test]
    fn ureq_client_constructs_via_new_and_default() {
        // Touches the `UreqClient::new` and `Default::default` paths so
        // the simple constructor isn't a coverage hole.  The agent has
        // no public observable state, so this is an instantiation-only
        // exercise; the live test covers the actual GET methods.
        let _explicit = UreqClient::new();
        let _default: UreqClient = Default::default();
    }

    /// Live registry probe: fetch `is-odd@3.0.1` from
    /// `registry.npmjs.org`, verify integrity, and check that the
    /// published `package.json` lands in the CAS at the expected
    /// path.
    ///
    /// Gated behind `ENDOR_REGISTRY_LIVE_TEST=1` so the test suite
    /// stays hermetic by default.  Run with:
    ///
    /// ```sh
    /// ENDOR_REGISTRY_LIVE_TEST=1 \
    ///   cargo test -p endo --lib fetch::tests::live_registry -- --nocapture
    /// ```
    #[test]
    fn live_registry_fetch_is_odd() {
        if std::env::var("ENDOR_REGISTRY_LIVE_TEST").ok().as_deref() != Some("1") {
            eprintln!(
                "skipping live registry test (set ENDOR_REGISTRY_LIVE_TEST=1 to enable)"
            );
            return;
        }
        let (_tmp, cas) = fresh_cas();
        let registry = RegistryTable::open_in_memory().unwrap();
        let http = UreqClient::new();
        let result = fetch_package(
            &http,
            &cas,
            &registry,
            DEFAULT_REGISTRY,
            "is-odd",
            "3.0.1",
        )
        .expect("live fetch of is-odd@3.0.1");
        assert_eq!(result.name, "is-odd");
        assert_eq!(result.version, "3.0.1");
        // The published is-odd@3.0.1 package always contains a
        // package.json declaring "is-odd" as its name.
        let pj_bytes = cas
            .fetch_from_tree(&result.tree_hash, "package.json")
            .expect("package.json in extracted tree");
        let pj_text = std::str::from_utf8(&pj_bytes).unwrap();
        assert!(
            pj_text.contains("\"name\": \"is-odd\"") || pj_text.contains("\"name\":\"is-odd\""),
            "package.json missing name field: {pj_text}"
        );
    }
}
