//! Transitive npm dependency resolution over the CAS-backed
//! registry proxy (Phase 4 of `designs/endor-npm-registry-proxy.md`,
//! resolver half).
//!
//! Given a set of root requirements — `(package name, semver range)`
//! pairs — [`resolve_transitive`] drives the Phase 2 fetch layer
//! ([`fetch_package`]) and the Phase 3 version selection to a
//! fixpoint over the transitive dependency graph:
//!
//! 1. Accumulate every range declared for each package name across
//!    the whole graph (requirement sets only grow, so the fixpoint
//!    terminates).
//! 2. Select versions per package with Go-like Minimal Version
//!    Selection: each range is anchored to the major version of the
//!    smallest available release that satisfies it, and each anchor
//!    group independently selects the greatest available version of
//!    that major satisfying all ranges in the group. Distinct majors
//!    of one package therefore coexist, per the design's "greatest
//!    explicitly mentioned minor version for each major" rule.
//! 3. Fetch each selected `(name, version)` into the CAS (a no-op
//!    when the registry table already has it), read its
//!    `package.json` back out of the CAS tree, and fold its
//!    `dependencies` into the requirement set.
//! 4. Repeat until a pass selects no package that has not already
//!    been expanded.
//!
//! Once a graph has been resolved, every subsequent resolution of
//! the same roots is served entirely from the registry table and the
//! CAS — no network traffic — which is the
//! registry-table-as-implicit-lock-file behaviour the design
//! intends (and the substrate Phase 5's `--offline` flag will
//! expose).
//!
//! Deliberate scope limits, matching the design's known gaps:
//! `devDependencies`, `peerDependencies`, and `optionalDependencies`
//! are ignored; pre-release versions are never selected; ranges
//! outside the supported semver grammar (git URLs, `file:`,
//! `workspace:`, tags) are an error rather than a silent skip.

use std::collections::{BTreeMap, BTreeSet};

use serde::Deserialize;

use crate::cas::ContentStore;
use crate::fetch::{fetch_metadata_cached, fetch_package, FetchError, HttpClient};
use crate::npmrc::NpmConfig;
use crate::registry::RegistryTable;
use crate::semver::{Range, Version};

/// Safety bound on the number of distinct `(name, version)` packages
/// one resolution may expand. A hostile or misbehaving registry
/// could otherwise chain fresh package names without limit.
pub const MAX_PACKAGES: usize = 4096;

/// One package selected by [`resolve_transitive`].
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct ResolvedPackage {
    pub name: String,
    pub version: String,
    /// Hex SHA-256 of the package's extracted tree in the CAS.
    pub tree_hash: String,
}

/// Errors that can arise during transitive resolution.
#[derive(Debug)]
pub enum ResolveError {
    /// The underlying metadata or tarball fetch failed.
    Fetch(FetchError),
    /// A dependency range was not in the supported semver grammar
    /// (e.g. a git URL, `file:` path, `workspace:` protocol, or a
    /// dist-tag).
    BadRange { name: String, range: String },
    /// No available, non-pre-release version of the package
    /// satisfies the accumulated ranges.
    NoMatchingVersion { name: String, ranges: Vec<String> },
    /// A fetched package's `package.json` was missing or malformed.
    BadPackageJson {
        name: String,
        version: String,
        detail: String,
    },
    /// The graph expanded past [`MAX_PACKAGES`].
    GraphTooLarge,
}

impl std::fmt::Display for ResolveError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ResolveError::Fetch(e) => write!(f, "fetch: {e}"),
            ResolveError::BadRange { name, range } => {
                write!(f, "unsupported range for {name}: {range:?}")
            }
            ResolveError::NoMatchingVersion { name, ranges } => {
                write!(f, "no version of {name} satisfies {}", ranges.join(", "))
            }
            ResolveError::BadPackageJson {
                name,
                version,
                detail,
            } => write!(f, "bad package.json in {name}@{version}: {detail}"),
            ResolveError::GraphTooLarge => {
                write!(f, "dependency graph exceeds {MAX_PACKAGES} packages")
            }
        }
    }
}

impl std::error::Error for ResolveError {}

impl From<FetchError> for ResolveError {
    fn from(e: FetchError) -> Self {
        ResolveError::Fetch(e)
    }
}

/// Subset of the registry's per-package document consumed here: the
/// set of published version strings.
#[derive(Deserialize)]
struct MetaVersions {
    versions: BTreeMap<String, serde::de::IgnoredAny>,
}

/// Subset of a package's `package.json` consumed here.
#[derive(Deserialize)]
struct PackageJsonDeps {
    #[serde(default)]
    dependencies: BTreeMap<String, String>,
}

/// Resolve the transitive dependency graph of `roots`, fetching
/// every selected package into the CAS and recording it in the
/// registry table.
///
/// `roots` are `(package name, semver range)` pairs. The returned
/// set is sorted by `(name, version)` and contains one entry per
/// selected `(name, major)` — distinct majors of one package
/// coexist.
///
/// Every package fetches from `registry_url`; for per-scope
/// registry routing use [`resolve_transitive_with_config`].
pub fn resolve_transitive<H: HttpClient>(
    http: &H,
    cas: &ContentStore,
    registry_table: &RegistryTable,
    registry_url: &str,
    roots: &[(String, String)],
) -> Result<Vec<ResolvedPackage>, ResolveError> {
    let config = NpmConfig::with_registry(registry_url);
    resolve_transitive_with_config(http, cas, registry_table, &config, roots)
}

/// [`resolve_transitive`] with full registry configuration: each
/// package routes through [`NpmConfig::registry_for`], so a scoped
/// name (`@scope/pkg`) fetches from its scope's registry while
/// everything else stays on the default (Phase 5 of the design).
pub fn resolve_transitive_with_config<H: HttpClient>(
    http: &H,
    cas: &ContentStore,
    registry_table: &RegistryTable,
    config: &NpmConfig,
    roots: &[(String, String)],
) -> Result<Vec<ResolvedPackage>, ResolveError> {
    // Package name → every range string declared for it anywhere in
    // the graph. Grows monotonically across passes.
    let mut requirements: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for (name, range) in roots {
        requirements
            .entry(name.clone())
            .or_default()
            .insert(range.clone());
    }

    // `(name, version)` pairs whose dependencies have already been
    // folded into `requirements`.
    let mut expanded: BTreeSet<(String, String)> = BTreeSet::new();

    loop {
        let selection = select_all(http, registry_table, config, &requirements)?;

        let mut grew = false;
        for (name, version) in &selection {
            if expanded.contains(&(name.clone(), version.clone())) {
                continue;
            }
            if expanded.len() >= MAX_PACKAGES {
                return Err(ResolveError::GraphTooLarge);
            }
            let fetched = fetch_package(
                http,
                cas,
                registry_table,
                config.registry_for(name),
                name,
                version,
            )?;
            let deps = read_dependencies(cas, name, version, &fetched.tree_hash)?;
            expanded.insert((name.clone(), version.clone()));
            grew = true;
            for (dep_name, dep_range) in deps {
                requirements.entry(dep_name).or_default().insert(dep_range);
            }
        }

        if !grew {
            // Fixpoint: the current selection is final and every
            // selected package is already fetched; assemble the
            // result from the registry table.
            let mut resolved = Vec::with_capacity(selection.len());
            for (name, version) in &selection {
                let entry = registry_table
                    .lookup(name, version)
                    .map_err(|e| ResolveError::Fetch(FetchError::Io(e)))?
                    .expect("selected package must be in the registry table");
                resolved.push(ResolvedPackage {
                    name: entry.name,
                    version: entry.version,
                    tree_hash: entry.hash,
                });
            }
            resolved.sort();
            return Ok(resolved);
        }
    }
}

/// Compute the version selection for every requirement in the set.
///
/// Returns `(name, version)` pairs, one per `(name, anchor major)`
/// group.
fn select_all<H: HttpClient>(
    http: &H,
    registry_table: &RegistryTable,
    config: &NpmConfig,
    requirements: &BTreeMap<String, BTreeSet<String>>,
) -> Result<Vec<(String, String)>, ResolveError> {
    let mut selection = Vec::new();
    for (name, range_strings) in requirements {
        // Parse every range up front so an unsupported range fails
        // fast, before any network traffic.
        let mut ranges = Vec::with_capacity(range_strings.len());
        for s in range_strings {
            let range = Range::parse(s).ok_or_else(|| ResolveError::BadRange {
                name: name.clone(),
                range: s.clone(),
            })?;
            ranges.push((s.clone(), range));
        }

        let meta_body =
            fetch_metadata_cached(http, registry_table, config.registry_for(name), name)?;
        let meta: MetaVersions = serde_json::from_slice(&meta_body).map_err(|e| {
            ResolveError::Fetch(FetchError::BadMetadata(format!(
                "parse metadata for {name}: {e}"
            )))
        })?;
        // Pre-releases are never selected; MVS considers only
        // released versions.
        let mut available: Vec<Version> = meta
            .versions
            .keys()
            .filter_map(|s| Version::parse(s))
            .filter(|v| v.pre.is_empty())
            .collect();
        available.sort();

        for version in select_for_package(&available, &ranges).ok_or_else(|| {
            ResolveError::NoMatchingVersion {
                name: name.clone(),
                ranges: range_strings.iter().cloned().collect(),
            }
        })? {
            selection.push((name.clone(), version.to_string()));
        }
    }
    Ok(selection)
}

/// Select versions for one package from its available releases and
/// the accumulated ranges.
///
/// Each range is anchored to the major of the smallest available
/// version satisfying it; each anchor group independently selects
/// the greatest available version of that major satisfying all of
/// the group's ranges. Returns `None` when any range matches no
/// available version, or when an anchor group has no version
/// satisfying the whole group.
fn select_for_package(available: &[Version], ranges: &[(String, Range)]) -> Option<Vec<Version>> {
    // Anchor major → the ranges anchored there.
    let mut groups: BTreeMap<u64, Vec<&Range>> = BTreeMap::new();
    for (_, range) in ranges {
        // `available` is sorted ascending, so the first match is the
        // smallest satisfying version.
        let anchor = available.iter().find(|v| range.satisfies(v))?;
        groups.entry(anchor.major).or_default().push(range);
    }

    let mut selected = Vec::new();
    for (major, group) in &groups {
        let best = available
            .iter()
            .rev()
            .filter(|v| v.major == *major)
            .find(|v| group.iter().all(|r| r.satisfies(v)))?;
        selected.push(best.clone());
    }
    Some(selected)
}

/// Read a fetched package's declared `dependencies` back out of its
/// CAS tree.
fn read_dependencies(
    cas: &ContentStore,
    name: &str,
    version: &str,
    tree_hash: &str,
) -> Result<Vec<(String, String)>, ResolveError> {
    let bytes = cas
        .fetch_from_tree(tree_hash, "package.json")
        .map_err(|e| ResolveError::BadPackageJson {
            name: name.to_string(),
            version: version.to_string(),
            detail: format!("read: {e}"),
        })?;
    let pkg: PackageJsonDeps =
        serde_json::from_slice(&bytes).map_err(|e| ResolveError::BadPackageJson {
            name: name.to_string(),
            version: version.to_string(),
            detail: format!("parse: {e}"),
        })?;
    Ok(pkg.dependencies.into_iter().collect())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::collections::HashMap;
    use std::io::Write;

    use base64::Engine;
    use sha2::{Digest, Sha512};

    /// In-memory `HttpClient`: URL → response body, recording calls.
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
        fn call_count(&self) -> usize {
            self.calls.borrow().len()
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

    const REGISTRY: &str = "https://registry.test/";

    /// Gzipped npm-shaped tarball (entries under `package/`).
    fn make_tarball(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let mut tar_buf = Vec::new();
        {
            let mut builder = tar::Builder::new(&mut tar_buf);
            for (path, content) in entries {
                let mut header = tar::Header::new_gnu();
                header.set_size(content.len() as u64);
                header.set_mode(0o644);
                header.set_cksum();
                builder.append_data(&mut header, path, *content).unwrap();
            }
            builder.finish().unwrap();
        }
        let mut gz = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        gz.write_all(&tar_buf).unwrap();
        gz.finish().unwrap()
    }

    fn sri_sha512(bytes: &[u8]) -> String {
        let mut hasher = Sha512::new();
        hasher.update(bytes);
        let digest = hasher.finalize();
        format!(
            "sha512-{}",
            base64::engine::general_purpose::STANDARD.encode(digest.as_slice())
        )
    }

    /// A package whose `package.json` declares `deps`, plus the
    /// registry metadata fragment for one version of it.
    fn package_tarball(name: &str, version: &str, deps: &[(&str, &str)]) -> Vec<u8> {
        let deps_json: BTreeMap<&str, &str> = deps.iter().cloned().collect();
        let pkg_json = serde_json::json!({
            "name": name,
            "version": version,
            "dependencies": deps_json,
        });
        make_tarball(&[("package/package.json", pkg_json.to_string().as_bytes())])
    }

    fn tarball_url(name: &str, version: &str) -> String {
        format!("{REGISTRY}{name}/-/{name}-{version}.tgz")
    }

    /// Registry metadata document advertising `versions`, each with
    /// a dist pointing at [`tarball_url`] and a correct integrity
    /// for the given tarball bytes.
    fn meta_doc(name: &str, versions: &[(&str, &[u8])]) -> Vec<u8> {
        let mut vmap = serde_json::Map::new();
        for (version, tarball) in versions {
            vmap.insert(
                version.to_string(),
                serde_json::json!({
                    "dist": {
                        "tarball": tarball_url(name, version),
                        "integrity": sri_sha512(tarball),
                    }
                }),
            );
        }
        serde_json::json!({ "versions": vmap })
            .to_string()
            .into_bytes()
    }

    fn roots(specs: &[(&str, &str)]) -> Vec<(String, String)> {
        specs
            .iter()
            .map(|(n, r)| (n.to_string(), r.to_string()))
            .collect()
    }

    #[test]
    fn transitive_chain_resolves_and_populates_cas() {
        let tmp = tempfile::tempdir().unwrap();
        let cas = ContentStore::open(tmp.path()).unwrap();
        let table = RegistryTable::open_in_memory().unwrap();

        let b_tar = package_tarball("b", "2.3.0", &[]);
        let a_tar = package_tarball("a", "1.0.0", &[("b", "^2.0.0")]);
        let http = MockHttp::new()
            .respond(&format!("{REGISTRY}a"), meta_doc("a", &[("1.0.0", &a_tar)]))
            .respond(
                &format!("{REGISTRY}b"),
                meta_doc("b", &[("2.0.0", &b_tar), ("2.3.0", &b_tar)]),
            )
            .respond(&tarball_url("a", "1.0.0"), a_tar.clone())
            .respond(&tarball_url("b", "2.3.0"), b_tar.clone());

        let resolved =
            resolve_transitive(&http, &cas, &table, REGISTRY, &roots(&[("a", "^1.0.0")])).unwrap();

        let summary: Vec<(&str, &str)> = resolved
            .iter()
            .map(|p| (p.name.as_str(), p.version.as_str()))
            .collect();
        assert_eq!(summary, vec![("a", "1.0.0"), ("b", "2.3.0")]);

        // Every resolved package's tree is readable from the CAS.
        for p in &resolved {
            let pkg_json = cas.fetch_from_tree(&p.tree_hash, "package.json").unwrap();
            let v: serde_json::Value = serde_json::from_slice(&pkg_json).unwrap();
            assert_eq!(v["name"], p.name.as_str());
        }
    }

    #[test]
    fn accumulated_ranges_constrain_selection() {
        let tmp = tempfile::tempdir().unwrap();
        let cas = ContentStore::open(tmp.path()).unwrap();
        let table = RegistryTable::open_in_memory().unwrap();

        // a and b both depend on c with different ranges; the
        // selected c must satisfy both (1.2.5, not 1.3.0).
        let c_tar = package_tarball("c", "1.2.5", &[]);
        let a_tar = package_tarball("a", "1.0.0", &[("c", "~1.2.0")]);
        let b_tar = package_tarball("b", "1.0.0", &[("c", "^1.1.0")]);
        let http = MockHttp::new()
            .respond(&format!("{REGISTRY}a"), meta_doc("a", &[("1.0.0", &a_tar)]))
            .respond(&format!("{REGISTRY}b"), meta_doc("b", &[("1.0.0", &b_tar)]))
            .respond(
                &format!("{REGISTRY}c"),
                meta_doc(
                    "c",
                    &[("1.1.0", &c_tar), ("1.2.5", &c_tar), ("1.3.0", &c_tar)],
                ),
            )
            .respond(&tarball_url("a", "1.0.0"), a_tar.clone())
            .respond(&tarball_url("b", "1.0.0"), b_tar.clone())
            .respond(&tarball_url("c", "1.2.5"), c_tar.clone());

        let resolved = resolve_transitive(
            &http,
            &cas,
            &table,
            REGISTRY,
            &roots(&[("a", "^1.0.0"), ("b", "^1.0.0")]),
        )
        .unwrap();

        let c: Vec<&ResolvedPackage> = resolved.iter().filter(|p| p.name == "c").collect();
        assert_eq!(c.len(), 1);
        assert_eq!(c[0].version, "1.2.5");
    }

    #[test]
    fn distinct_majors_coexist() {
        let tmp = tempfile::tempdir().unwrap();
        let cas = ContentStore::open(tmp.path()).unwrap();
        let table = RegistryTable::open_in_memory().unwrap();

        let c1_tar = package_tarball("c", "1.4.0", &[]);
        let c2_tar = package_tarball("c", "2.1.0", &[]);
        let a_tar = package_tarball("a", "1.0.0", &[("c", "^1.0.0")]);
        let b_tar = package_tarball("b", "1.0.0", &[("c", "^2.0.0")]);
        let http = MockHttp::new()
            .respond(&format!("{REGISTRY}a"), meta_doc("a", &[("1.0.0", &a_tar)]))
            .respond(&format!("{REGISTRY}b"), meta_doc("b", &[("1.0.0", &b_tar)]))
            .respond(
                &format!("{REGISTRY}c"),
                meta_doc("c", &[("1.4.0", &c1_tar), ("2.1.0", &c2_tar)]),
            )
            .respond(&tarball_url("a", "1.0.0"), a_tar.clone())
            .respond(&tarball_url("b", "1.0.0"), b_tar.clone())
            .respond(&tarball_url("c", "1.4.0"), c1_tar.clone())
            .respond(&tarball_url("c", "2.1.0"), c2_tar.clone());

        let resolved = resolve_transitive(
            &http,
            &cas,
            &table,
            REGISTRY,
            &roots(&[("a", "^1.0.0"), ("b", "^1.0.0")]),
        )
        .unwrap();

        let c_versions: Vec<&str> = resolved
            .iter()
            .filter(|p| p.name == "c")
            .map(|p| p.version.as_str())
            .collect();
        assert_eq!(c_versions, vec!["1.4.0", "2.1.0"]);
    }

    #[test]
    fn dependency_cycle_terminates() {
        let tmp = tempfile::tempdir().unwrap();
        let cas = ContentStore::open(tmp.path()).unwrap();
        let table = RegistryTable::open_in_memory().unwrap();

        let a_tar = package_tarball("a", "1.0.0", &[("b", "^1.0.0")]);
        let b_tar = package_tarball("b", "1.0.0", &[("a", "^1.0.0")]);
        let http = MockHttp::new()
            .respond(&format!("{REGISTRY}a"), meta_doc("a", &[("1.0.0", &a_tar)]))
            .respond(&format!("{REGISTRY}b"), meta_doc("b", &[("1.0.0", &b_tar)]))
            .respond(&tarball_url("a", "1.0.0"), a_tar.clone())
            .respond(&tarball_url("b", "1.0.0"), b_tar.clone());

        let resolved =
            resolve_transitive(&http, &cas, &table, REGISTRY, &roots(&[("a", "^1.0.0")])).unwrap();

        let summary: Vec<(&str, &str)> = resolved
            .iter()
            .map(|p| (p.name.as_str(), p.version.as_str()))
            .collect();
        assert_eq!(summary, vec![("a", "1.0.0"), ("b", "1.0.0")]);
    }

    #[test]
    fn no_matching_version_is_an_error() {
        let tmp = tempfile::tempdir().unwrap();
        let cas = ContentStore::open(tmp.path()).unwrap();
        let table = RegistryTable::open_in_memory().unwrap();

        let a_tar = package_tarball("a", "1.0.0", &[]);
        let http =
            MockHttp::new().respond(&format!("{REGISTRY}a"), meta_doc("a", &[("1.0.0", &a_tar)]));

        let err = resolve_transitive(&http, &cas, &table, REGISTRY, &roots(&[("a", "^9.0.0")]))
            .unwrap_err();
        match err {
            ResolveError::NoMatchingVersion { name, .. } => assert_eq!(name, "a"),
            other => panic!("expected NoMatchingVersion, got {other:?}"),
        }
    }

    #[test]
    fn unsupported_range_is_an_error() {
        let tmp = tempfile::tempdir().unwrap();
        let cas = ContentStore::open(tmp.path()).unwrap();
        let table = RegistryTable::open_in_memory().unwrap();
        let http = MockHttp::new();

        let err = resolve_transitive(
            &http,
            &cas,
            &table,
            REGISTRY,
            &roots(&[("a", "git+https://example.com/a.git")]),
        )
        .unwrap_err();
        match err {
            ResolveError::BadRange { name, .. } => assert_eq!(name, "a"),
            other => panic!("expected BadRange, got {other:?}"),
        }
    }

    #[test]
    fn pre_release_versions_are_never_selected() {
        let tmp = tempfile::tempdir().unwrap();
        let cas = ContentStore::open(tmp.path()).unwrap();
        let table = RegistryTable::open_in_memory().unwrap();

        let a_tar = package_tarball("a", "1.2.0", &[]);
        let http = MockHttp::new()
            .respond(
                &format!("{REGISTRY}a"),
                meta_doc("a", &[("1.2.0", &a_tar), ("2.0.0-beta.1", &a_tar)]),
            )
            .respond(&tarball_url("a", "1.2.0"), a_tar.clone());

        let resolved =
            resolve_transitive(&http, &cas, &table, REGISTRY, &roots(&[("a", "*")])).unwrap();
        assert_eq!(resolved.len(), 1);
        assert_eq!(resolved[0].version, "1.2.0");
    }

    #[test]
    fn second_resolution_is_served_entirely_from_cache() {
        let tmp = tempfile::tempdir().unwrap();
        let cas = ContentStore::open(tmp.path()).unwrap();
        let table = RegistryTable::open_in_memory().unwrap();

        let b_tar = package_tarball("b", "2.0.0", &[]);
        let a_tar = package_tarball("a", "1.0.0", &[("b", "^2.0.0")]);
        let http = MockHttp::new()
            .respond(&format!("{REGISTRY}a"), meta_doc("a", &[("1.0.0", &a_tar)]))
            .respond(&format!("{REGISTRY}b"), meta_doc("b", &[("2.0.0", &b_tar)]))
            .respond(&tarball_url("a", "1.0.0"), a_tar.clone())
            .respond(&tarball_url("b", "2.0.0"), b_tar.clone());

        let first =
            resolve_transitive(&http, &cas, &table, REGISTRY, &roots(&[("a", "^1.0.0")])).unwrap();
        assert!(http.call_count() > 0);

        // Same table and CAS, but a client that answers nothing: the
        // resolution must complete without a single HTTP request.
        let offline = MockHttp::new();
        let second =
            resolve_transitive(&offline, &cas, &table, REGISTRY, &roots(&[("a", "^1.0.0")]))
                .unwrap();
        assert_eq!(offline.call_count(), 0);
        assert_eq!(first, second);
    }

    #[test]
    fn offline_client_replays_cached_graph_and_refuses_cold() {
        // Phase 5: `--offline` is the OfflineClient, which turns
        // "would have gone to the network" into a typed error rather
        // than relying on a registry URL that happens to be
        // unreachable.
        let tmp = tempfile::tempdir().unwrap();
        let cas = ContentStore::open(tmp.path()).unwrap();
        let table = RegistryTable::open_in_memory().unwrap();

        let b_tar = package_tarball("b", "2.0.0", &[]);
        let a_tar = package_tarball("a", "1.0.0", &[("b", "^2.0.0")]);
        let http = MockHttp::new()
            .respond(&format!("{REGISTRY}a"), meta_doc("a", &[("1.0.0", &a_tar)]))
            .respond(&format!("{REGISTRY}b"), meta_doc("b", &[("2.0.0", &b_tar)]))
            .respond(&tarball_url("a", "1.0.0"), a_tar.clone())
            .respond(&tarball_url("b", "2.0.0"), b_tar.clone());

        let first =
            resolve_transitive(&http, &cas, &table, REGISTRY, &roots(&[("a", "^1.0.0")])).unwrap();

        let offline = crate::fetch::OfflineClient;
        let second =
            resolve_transitive(&offline, &cas, &table, REGISTRY, &roots(&[("a", "^1.0.0")]))
                .unwrap();
        assert_eq!(first, second);

        // A root the cache has never seen must surface `Offline`.
        match resolve_transitive(&offline, &cas, &table, REGISTRY, &roots(&[("zzz", "^1.0.0")])) {
            Err(ResolveError::Fetch(FetchError::Offline { url })) => {
                assert_eq!(url, format!("{REGISTRY}zzz"));
            }
            other => panic!("expected Offline, got {other:?}"),
        }
    }

    #[test]
    fn scoped_packages_route_to_their_scope_registry() {
        // Phase 5: an `@scope:registry` line routes the scope's
        // metadata fetch to the scope registry; unscoped packages
        // stay on the default. (Tarball URLs come from the metadata
        // document itself, so routing is a metadata-URL concern.)
        let tmp = tempfile::tempdir().unwrap();
        let cas = ContentStore::open(tmp.path()).unwrap();
        let table = RegistryTable::open_in_memory().unwrap();

        const SCOPE_REGISTRY: &str = "https://scope.test/";
        let b_tar = package_tarball("b", "1.0.0", &[]);
        let a_tar = package_tarball("@acme/a", "1.0.0", &[("b", "^1.0.0")]);
        let http = MockHttp::new()
            .respond(
                &format!("{SCOPE_REGISTRY}@acme/a"),
                meta_doc("@acme/a", &[("1.0.0", &a_tar)]),
            )
            .respond(&format!("{REGISTRY}b"), meta_doc("b", &[("1.0.0", &b_tar)]))
            .respond(&tarball_url("@acme/a", "1.0.0"), a_tar.clone())
            .respond(&tarball_url("b", "1.0.0"), b_tar.clone());

        let mut config = NpmConfig::with_registry(REGISTRY);
        config.apply_npmrc(&format!("@acme:registry={SCOPE_REGISTRY}\n"));

        let resolved = resolve_transitive_with_config(
            &http,
            &cas,
            &table,
            &config,
            &roots(&[("@acme/a", "^1.0.0")]),
        )
        .unwrap();

        let summary: Vec<(&str, &str)> = resolved
            .iter()
            .map(|p| (p.name.as_str(), p.version.as_str()))
            .collect();
        assert_eq!(summary, vec![("@acme/a", "1.0.0"), ("b", "1.0.0")]);

        let calls = http.calls.borrow();
        assert!(
            calls.iter().any(|c| c == &format!("META {SCOPE_REGISTRY}@acme/a")),
            "scoped metadata must come from the scope registry: {calls:?}"
        );
        assert!(
            !calls.iter().any(|c| c == &format!("META {REGISTRY}@acme/a")),
            "scoped metadata must not hit the default registry: {calls:?}"
        );
        assert!(
            calls.iter().any(|c| c == &format!("META {REGISTRY}b")),
            "unscoped metadata stays on the default registry: {calls:?}"
        );
    }
}
