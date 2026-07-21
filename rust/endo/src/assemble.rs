//! Entry-point run assembly: the acquisition half of Phase 4 of
//! `designs/endor-npm-registry-proxy.md`.
//!
//! Given an entry module (`endor run entry.js`), this module:
//!
//! 1. locates the entry package root (the nearest ancestor directory
//!    holding a `package.json`, or the entry's own directory when
//!    there is none),
//! 2. resolves and fetches the package's transitive npm dependencies
//!    into the CAS via [`resolve_transitive_with_config`] (Go-like
//!    MVS, registry-table fast path, cached replay),
//! 3. ingests the entry package's own files into the CAS as a tree
//!    (skipping `node_modules` and VCS metadata — the whole point is
//!    that no `node_modules` tree is consulted), and
//! 4. synthesises a **compartment map** whose module locations are
//!    CAS tree hashes, stored in the CAS itself.
//!
//! The compartment map is the artifact the execution half of Phase 4
//! ([`crate::execute`]) consumes: one compartment per resolved
//! `(name, version)`, each `location` a `cas:sha256:<tree>` URI,
//! each dependency edge bound to the compartment that MVS selected
//! for it. Everything here is deterministic: assembling the same
//! package twice yields byte-identical maps and hence the same CAS
//! hash.

use std::collections::BTreeMap;
use std::fmt;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use crate::cas::ContentStore;
use crate::fetch::{materialise, DirNode, HttpClient};
use crate::npm_resolve::{resolve_transitive_with_config, ResolveError};
use crate::npmrc::NpmConfig;
use crate::registry::RegistryTable;
use crate::semver::{Range, Version};

/// Compartment-map key for the entry package's own compartment.
/// Angle brackets keep it disjoint from every npm package name.
pub const ENTRY_COMPARTMENT: &str = "<entry>";

/// Directory names never ingested into the entry package's CAS tree.
const EXCLUDED_DIRS: &[&str] = &["node_modules", ".git"];

/// Errors from entry-point assembly.
#[derive(Debug)]
pub enum AssembleError {
    /// The entry path is missing, unreadable, or not a file.
    BadEntry(String),
    /// The entry package's `package.json` did not parse.
    BadPackageJson(String),
    /// Transitive resolution failed.
    Resolve(ResolveError),
    /// Filesystem or CAS I/O failed.
    Io(io::Error),
}

impl fmt::Display for AssembleError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AssembleError::BadEntry(msg) => write!(f, "bad entry module: {msg}"),
            AssembleError::BadPackageJson(msg) => write!(f, "bad package.json: {msg}"),
            AssembleError::Resolve(e) => write!(f, "resolution failed: {e}"),
            AssembleError::Io(e) => write!(f, "assembly I/O: {e}"),
        }
    }
}

impl From<ResolveError> for AssembleError {
    fn from(e: ResolveError) -> Self {
        AssembleError::Resolve(e)
    }
}

impl From<io::Error> for AssembleError {
    fn from(e: io::Error) -> Self {
        AssembleError::Io(e)
    }
}

/// One resolved package plus the dependency edges read back out of
/// its CAS tree — what map building needs beyond
/// [`crate::npm_resolve::ResolvedPackage`].
#[derive(Debug, Clone)]
pub struct ResolvedCompartment {
    pub name: String,
    pub version: String,
    /// Hex SHA-256 of the package's extracted tree in the CAS.
    pub tree_hash: String,
    /// The package's declared runtime `dependencies`.
    pub dependencies: BTreeMap<String, String>,
}

/// The transitive resolution as consumed by map building: the
/// resolved packages with their dependency edges, plus range→package
/// edge binding.
#[derive(Debug, Default)]
pub struct Resolution {
    packages: Vec<ResolvedCompartment>,
}

impl Resolution {
    pub fn packages(&self) -> impl Iterator<Item = &ResolvedCompartment> {
        self.packages.iter()
    }

    pub fn len(&self) -> usize {
        self.packages.len()
    }

    pub fn is_empty(&self) -> bool {
        self.packages.is_empty()
    }

    /// The resolved package of `name` with the given major version,
    /// if any (distinct majors of one package coexist).
    pub fn get(&self, name: &str, major: u64) -> Option<&ResolvedCompartment> {
        self.packages.iter().find(|p| {
            p.name == name && Version::parse(&p.version).map(|v| v.major) == Some(major)
        })
    }

    /// Bind a declared `(name, range)` edge to the resolved package
    /// serving it: the greatest resolved version of `name` that
    /// satisfies `range` (per-major MVS selects one version per
    /// anchor major, so in practice exactly one candidate matches).
    pub fn resolve_dependency(&self, name: &str, range_str: &str) -> Option<&ResolvedCompartment> {
        let range = Range::parse(range_str)?;
        self.packages
            .iter()
            .filter(|p| p.name == name)
            .filter_map(|p| Version::parse(&p.version).map(|v| (v, p)))
            .filter(|(v, _)| range.satisfies(v))
            .max_by(|(a, _), (b, _)| a.cmp(b))
            .map(|(_, p)| p)
    }
}

/// The outcome of [`assemble_entry`]: everything the execution half
/// of Phase 4 needs, already in the CAS.
#[derive(Debug)]
pub struct AssembledRun {
    /// Directory holding the entry package (`package.json`'s home,
    /// or the entry module's directory when there is none).
    pub package_root: PathBuf,
    /// The entry package's `name`, or the sentinel `"entry"`.
    pub package_name: String,
    /// Entry module path relative to `package_root`, `./`-prefixed.
    pub entry_module: String,
    /// CAS tree hash of the ingested entry package directory.
    pub entry_tree_hash: String,
    /// CAS blob hash of the serialised compartment map.
    pub compartment_map_hash: String,
    /// The transitive resolution the map was built from.
    pub resolution: Resolution,
}

/// Locate the entry package root: walk up from the entry module's
/// directory to the nearest ancestor holding a `package.json`.
/// Returns the root directory and the `package.json` text when one
/// was found; a bare entry module (no `package.json` anywhere above
/// it) roots at its own directory with no manifest — zero
/// dependencies, per the design's "works out of the box" goal.
pub fn find_package_root(entry_js: &Path) -> Result<(PathBuf, Option<String>), AssembleError> {
    let entry = entry_js
        .canonicalize()
        .map_err(|e| AssembleError::BadEntry(format!("{}: {e}", entry_js.display())))?;
    if !entry.is_file() {
        return Err(AssembleError::BadEntry(format!(
            "{} is not a file",
            entry.display()
        )));
    }
    let start = entry
        .parent()
        .ok_or_else(|| AssembleError::BadEntry(format!("{} has no parent", entry.display())))?;
    let mut dir = start;
    loop {
        let manifest = dir.join("package.json");
        if manifest.is_file() {
            let text = fs::read_to_string(&manifest)?;
            return Ok((dir.to_path_buf(), Some(text)));
        }
        match dir.parent() {
            Some(parent) => dir = parent,
            None => return Ok((start.to_path_buf(), None)),
        }
    }
}

/// Parse a `"dependencies"` object out of a parsed `package.json`
/// document. Absence defaults to no dependencies; a non-object
/// field or non-string range is an error rather than a silently
/// empty graph.
fn parse_dependencies(
    doc: &serde_json::Value,
    who: &str,
) -> Result<BTreeMap<String, String>, AssembleError> {
    let mut dependencies = BTreeMap::new();
    if let Some(deps) = doc.get("dependencies") {
        let obj = deps.as_object().ok_or_else(|| {
            AssembleError::BadPackageJson(format!("{who}: \"dependencies\" is not an object"))
        })?;
        for (dep, range) in obj {
            let range = range.as_str().ok_or_else(|| {
                AssembleError::BadPackageJson(format!(
                    "{who}: dependency {dep} has a non-string range"
                ))
            })?;
            dependencies.insert(dep.clone(), range.to_string());
        }
    }
    Ok(dependencies)
}

/// Parse the entry package's name and runtime `dependencies` out of
/// its `package.json`. Absent fields default (name `"entry"`, no
/// dependencies).
fn parse_manifest(text: &str) -> Result<(String, BTreeMap<String, String>), AssembleError> {
    let doc: serde_json::Value = serde_json::from_str(text)
        .map_err(|e| AssembleError::BadPackageJson(format!("parse: {e}")))?;
    let name = doc
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("entry")
        .to_string();
    let dependencies = parse_dependencies(&doc, &name)?;
    Ok((name, dependencies))
}

/// Read a resolved package's declared `dependencies` back out of its
/// CAS tree, mirroring the resolver's own walk so the map's edges
/// bind exactly the ranges resolution satisfied.
fn read_tree_dependencies(
    cas: &ContentStore,
    name: &str,
    version: &str,
    tree_hash: &str,
) -> Result<BTreeMap<String, String>, AssembleError> {
    let who = format!("{name}@{version}");
    let bytes = cas.fetch_from_tree(tree_hash, "package.json").map_err(|e| {
        AssembleError::BadPackageJson(format!("{who}: read package.json: {e}"))
    })?;
    let doc: serde_json::Value = serde_json::from_slice(&bytes)
        .map_err(|e| AssembleError::BadPackageJson(format!("{who}: parse: {e}")))?;
    parse_dependencies(&doc, &who)
}

/// Ingest a local directory into the CAS as a tree, mirroring the
/// tarball ingestion in [`crate::fetch`]: file contents become
/// blobs, directories become tree manifests with sorted keys, so the
/// root hash is a stable function of the directory's contents.
/// `node_modules` and VCS metadata are skipped; symlinks are skipped
/// (a CAS tree holds content, not filesystem aliases).
pub fn store_dir_tree(cas: &ContentStore, dir: &Path) -> Result<String, AssembleError> {
    let mut root = DirNode::new();
    ingest_dir(cas, dir, &mut Vec::new(), &mut root)?;
    materialise(&root, cas).map_err(|e| {
        AssembleError::Io(io::Error::new(
            io::ErrorKind::Other,
            format!("materialise tree: {e}"),
        ))
    })
}

fn ingest_dir(
    cas: &ContentStore,
    dir: &Path,
    prefix: &mut Vec<String>,
    root: &mut DirNode,
) -> Result<(), AssembleError> {
    // Sort entries for a deterministic ingestion order. The tree
    // hash is already order-independent (manifest keys are sorted at
    // encode time); this keeps blob-store side effects stable too.
    let mut entries: Vec<_> = fs::read_dir(dir)?.collect::<Result<_, _>>()?;
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let name = entry.file_name().to_string_lossy().to_string();
        let file_type = entry.file_type()?;
        if file_type.is_symlink() {
            continue;
        }
        if file_type.is_dir() {
            if EXCLUDED_DIRS.contains(&name.as_str()) {
                continue;
            }
            prefix.push(name);
            ingest_dir(cas, &entry.path(), prefix, root)?;
            prefix.pop();
        } else if file_type.is_file() {
            let data = fs::read(entry.path())?;
            let blob_hash = cas.store(&data, "blob")?;
            let mut parts = prefix.clone();
            parts.push(name);
            root.insert(&parts, blob_hash, data.len() as u64);
        }
    }
    Ok(())
}

/// Compartment-map key for a resolved package: `<name>-v<version>`,
/// following `@endo/compartment-mapper`'s naming.
fn compartment_key(package: &ResolvedCompartment) -> String {
    format!("{}-v{}", package.name, package.version)
}

fn cas_location(tree_hash: &str) -> String {
    format!("cas:sha256:{tree_hash}")
}

/// Bind one package's declared dependency edges to the compartments
/// the resolution selected for them.
fn bind_edges(
    resolution: &Resolution,
    dependencies: &BTreeMap<String, String>,
    requirer: &str,
) -> Result<serde_json::Map<String, serde_json::Value>, AssembleError> {
    let mut modules = serde_json::Map::new();
    for (dep, range) in dependencies {
        let target = resolution.resolve_dependency(dep, range).ok_or_else(|| {
            // Unreachable after a successful resolve_transitive; a
            // hole here means the resolver and the map disagree.
            AssembleError::BadPackageJson(format!(
                "{requirer}: dependency {dep}@{range} missing from resolution"
            ))
        })?;
        modules.insert(
            dep.clone(),
            serde_json::json!({
                "compartment": compartment_key(target),
                "module": ".",
            }),
        );
    }
    Ok(modules)
}

/// Build the compartment map document as canonical (sorted-key)
/// JSON bytes. One compartment per resolved `(name, major)` plus the
/// entry compartment; locations are CAS tree URIs; each `modules`
/// edge names the compartment serving that dependency, with `"."`
/// denoting the target package's default entry (the concrete file is
/// the loader's business — it reads the target's `package.json` from
/// the CAS).
pub fn build_compartment_map(
    package_name: &str,
    entry_module: &str,
    entry_tree_hash: &str,
    root_dependencies: &BTreeMap<String, String>,
    resolution: &Resolution,
) -> Result<Vec<u8>, AssembleError> {
    let mut compartments = serde_json::Map::new();
    compartments.insert(
        ENTRY_COMPARTMENT.to_string(),
        serde_json::json!({
            "name": package_name,
            "location": cas_location(entry_tree_hash),
            "modules": bind_edges(resolution, root_dependencies, package_name)?,
        }),
    );
    for package in resolution.packages() {
        let requirer = format!("{}@{}", package.name, package.version);
        compartments.insert(
            compartment_key(package),
            serde_json::json!({
                "name": package.name,
                "version": package.version,
                "location": cas_location(&package.tree_hash),
                "modules": bind_edges(resolution, &package.dependencies, &requirer)?,
            }),
        );
    }
    let doc = serde_json::json!({
        "tags": [],
        "entry": {
            "compartment": ENTRY_COMPARTMENT,
            "module": entry_module,
        },
        "compartments": compartments,
    });
    // `serde_json::Map` is sorted (BTreeMap-backed), so this
    // serialisation is canonical and the CAS hash deterministic.
    serde_json::to_vec_pretty(&doc).map_err(|e| {
        AssembleError::Io(io::Error::new(
            io::ErrorKind::Other,
            format!("encode map: {e}"),
        ))
    })
}

/// Assemble an entry-point run: resolve and fetch the entry
/// package's transitive dependencies into the CAS, ingest the entry
/// package itself, and store the compartment map binding them.
/// A fully cached graph assembles without any network traffic (the
/// registry table is the implicit lock file); pair with
/// [`crate::fetch::OfflineClient`] to make that a hard guarantee
/// (Phase 5's `--offline` flag).
pub fn assemble_entry<H: HttpClient>(
    http: &H,
    cas: &ContentStore,
    registry_table: &RegistryTable,
    registry_url: &str,
    entry_js: &Path,
) -> Result<AssembledRun, AssembleError> {
    let config = NpmConfig::with_registry(registry_url);
    assemble_entry_with_config(http, cas, registry_table, &config, entry_js)
}

/// [`assemble_entry`] with full registry configuration
/// ([`crate::npmrc::NpmConfig`]): scoped packages route to their
/// scope's registry during resolution.
pub fn assemble_entry_with_config<H: HttpClient>(
    http: &H,
    cas: &ContentStore,
    registry_table: &RegistryTable,
    config: &NpmConfig,
    entry_js: &Path,
) -> Result<AssembledRun, AssembleError> {
    let (package_root, manifest) = find_package_root(entry_js)?;
    let (package_name, root_dependencies) = match &manifest {
        Some(text) => parse_manifest(text)?,
        None => ("entry".to_string(), BTreeMap::new()),
    };

    let roots: Vec<(String, String)> = root_dependencies
        .iter()
        .map(|(name, range)| (name.clone(), range.clone()))
        .collect();
    let resolved = resolve_transitive_with_config(http, cas, registry_table, config, &roots)?;
    let mut packages = Vec::with_capacity(resolved.len());
    for package in resolved {
        let dependencies =
            read_tree_dependencies(cas, &package.name, &package.version, &package.tree_hash)?;
        packages.push(ResolvedCompartment {
            name: package.name,
            version: package.version,
            tree_hash: package.tree_hash,
            dependencies,
        });
    }
    let resolution = Resolution { packages };

    let entry_tree_hash = store_dir_tree(cas, &package_root)?;

    let entry_canonical = entry_js
        .canonicalize()
        .map_err(|e| AssembleError::BadEntry(format!("{}: {e}", entry_js.display())))?;
    let relative = entry_canonical
        .strip_prefix(&package_root)
        .map_err(|_| {
            AssembleError::BadEntry(format!(
                "{} is outside its package root {}",
                entry_canonical.display(),
                package_root.display()
            ))
        })?;
    let entry_module = format!("./{}", relative.display());

    let map_bytes = build_compartment_map(
        &package_name,
        &entry_module,
        &entry_tree_hash,
        &root_dependencies,
        &resolution,
    )?;
    let compartment_map_hash = cas.store(&map_bytes, "compartment-map")?;

    Ok(AssembledRun {
        package_root,
        package_name,
        entry_module,
        entry_tree_hash,
        compartment_map_hash,
        resolution,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fetch::FetchError;
    use std::cell::RefCell;
    use std::collections::HashMap;
    use std::io::Write;

    // Minimal mock registry, mirroring the fixtures in
    // `npm_resolve::tests`. Duplicated rather than shared: the
    // fixtures live inside that module's `#[cfg(test)]` block on an
    // open PR (#799), and reorganising it from this stacked branch
    // would manufacture rebase conflicts. A follow-up can hoist a
    // common test-support module once the stack lands.
    struct MockHttp {
        responses: HashMap<String, Vec<u8>>,
        calls: RefCell<usize>,
    }

    impl MockHttp {
        fn new() -> Self {
            MockHttp {
                responses: HashMap::new(),
                calls: RefCell::new(0),
            }
        }

        fn respond(mut self, url: &str, body: Vec<u8>) -> Self {
            self.responses.insert(url.to_string(), body);
            self
        }
    }

    impl HttpClient for MockHttp {
        fn get_metadata(&self, url: &str) -> Result<Vec<u8>, FetchError> {
            *self.calls.borrow_mut() += 1;
            self.responses
                .get(url)
                .cloned()
                .ok_or_else(|| FetchError::Http(format!("no mock for {url}")))
        }
        fn get_tarball(&self, url: &str) -> Result<Vec<u8>, FetchError> {
            *self.calls.borrow_mut() += 1;
            self.responses
                .get(url)
                .cloned()
                .ok_or_else(|| FetchError::Http(format!("no mock for {url}")))
        }
    }

    /// An HTTP client that hard-fails every request: replaying a
    /// cached graph against it proves the registry table and CAS
    /// alone served the assembly.
    struct FailClient;

    impl HttpClient for FailClient {
        fn get_metadata(&self, url: &str) -> Result<Vec<u8>, FetchError> {
            Err(FetchError::Http(format!("offline: {url}")))
        }
        fn get_tarball(&self, url: &str) -> Result<Vec<u8>, FetchError> {
            Err(FetchError::Http(format!("offline: {url}")))
        }
    }

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

    fn tarball_url(name: &str, version: &str) -> String {
        format!("https://registry.npmjs.org/{name}/-/{name}-{version}.tgz")
    }

    fn pkg_tarball(name: &str, version: &str, deps: &[(&str, &str)]) -> Vec<u8> {
        let deps_json = deps
            .iter()
            .map(|(n, r)| format!(r#""{n}":"{r}""#))
            .collect::<Vec<_>>()
            .join(",");
        let pj =
            format!(r#"{{"name":"{name}","version":"{version}","dependencies":{{{deps_json}}}}}"#);
        make_tarball(&[
            ("package/package.json", pj.as_bytes()),
            ("package/index.js", b"export default 42;\n"),
        ])
    }

    fn registry_meta(name: &str, versions: &[&str]) -> Vec<u8> {
        let versions_json = versions
            .iter()
            .map(|v| {
                format!(
                    r#""{v}":{{"dist":{{"tarball":"{}"}}}}"#,
                    tarball_url(name, v)
                )
            })
            .collect::<Vec<_>>()
            .join(",");
        format!(r#"{{"versions":{{{versions_json}}}}}"#).into_bytes()
    }

    /// A mock registry where a@1.2.0 depends on b@^2.0.0.
    fn graph_http() -> MockHttp {
        MockHttp::new()
            .respond(
                "https://registry.npmjs.org/a",
                registry_meta("a", &["1.0.0", "1.2.0"]),
            )
            .respond(
                "https://registry.npmjs.org/b",
                registry_meta("b", &["2.0.0", "2.3.0"]),
            )
            .respond(
                &tarball_url("a", "1.2.0"),
                pkg_tarball("a", "1.2.0", &[("b", "^2.0.0")]),
            )
            .respond(&tarball_url("b", "2.3.0"), pkg_tarball("b", "2.3.0", &[]))
    }

    fn fresh_cas() -> (tempfile::TempDir, ContentStore) {
        let tmp = tempfile::tempdir().unwrap();
        let cas = ContentStore::open(tmp.path()).unwrap();
        (tmp, cas)
    }

    /// An entry package on disk: package.json depending on a@^1.0.0,
    /// with the entry module nested one directory down and a
    /// node_modules impostor that must not be ingested.
    fn entry_package(dir: &Path) {
        fs::write(
            dir.join("package.json"),
            r#"{"name":"app","dependencies":{"a":"^1.0.0"}}"#,
        )
        .unwrap();
        fs::create_dir_all(dir.join("src")).unwrap();
        fs::write(dir.join("src/main.js"), "import a from 'a';\n").unwrap();
        fs::create_dir_all(dir.join("node_modules/a")).unwrap();
        fs::write(dir.join("node_modules/a/index.js"), "poison\n").unwrap();
    }

    fn assembled_map(cas: &ContentStore, run: &AssembledRun) -> serde_json::Value {
        let bytes = cas.fetch(&run.compartment_map_hash).unwrap();
        serde_json::from_slice(&bytes).unwrap()
    }

    const REGISTRY: &str = crate::fetch::DEFAULT_REGISTRY;

    #[test]
    fn find_package_root_walks_up_from_nested_entry() {
        let tmp = tempfile::tempdir().unwrap();
        entry_package(tmp.path());
        let (root, manifest) = find_package_root(&tmp.path().join("src/main.js")).unwrap();
        assert_eq!(root, tmp.path().canonicalize().unwrap());
        assert!(manifest.unwrap().contains("\"app\""));
    }

    #[test]
    fn find_package_root_without_manifest_roots_at_entry_dir() {
        let tmp = tempfile::tempdir().unwrap();
        fs::write(tmp.path().join("lone.js"), "export default 1;\n").unwrap();
        let (root, manifest) = find_package_root(&tmp.path().join("lone.js")).unwrap();
        assert_eq!(root, tmp.path().canonicalize().unwrap());
        assert!(manifest.is_none());
    }

    #[test]
    fn assemble_builds_map_over_transitive_graph() {
        let (_cas_tmp, cas) = fresh_cas();
        let registry = RegistryTable::open_in_memory().unwrap();
        let http = graph_http();
        let app = tempfile::tempdir().unwrap();
        entry_package(app.path());

        let run = assemble_entry(
            &http,
            &cas,
            &registry,
            REGISTRY,
            &app.path().join("src/main.js"),
        )
        .unwrap();

        assert_eq!(run.package_name, "app");
        assert_eq!(run.entry_module, "./src/main.js");
        assert_eq!(run.resolution.len(), 2);

        let map = assembled_map(&cas, &run);
        assert_eq!(map["entry"]["compartment"], ENTRY_COMPARTMENT);
        assert_eq!(map["entry"]["module"], "./src/main.js");
        let compartments = map["compartments"].as_object().unwrap();
        assert_eq!(compartments.len(), 3);
        assert_eq!(
            compartments[ENTRY_COMPARTMENT]["modules"]["a"]["compartment"],
            "a-v1.2.0"
        );
        assert_eq!(
            compartments["a-v1.2.0"]["modules"]["b"]["compartment"],
            "b-v2.3.0"
        );
        let a = run.resolution.get("a", 1).unwrap();
        assert_eq!(
            compartments["a-v1.2.0"]["location"],
            format!("cas:sha256:{}", a.tree_hash)
        );
        assert_eq!(
            compartments[ENTRY_COMPARTMENT]["location"],
            format!("cas:sha256:{}", run.entry_tree_hash)
        );
    }

    #[test]
    fn entry_tree_excludes_node_modules_and_is_deterministic() {
        let (_cas_tmp, cas) = fresh_cas();
        let app = tempfile::tempdir().unwrap();
        entry_package(app.path());

        let tree = store_dir_tree(&cas, app.path()).unwrap();
        let names = cas.list_tree(&tree).unwrap();
        assert!(names.iter().any(|n| n == "package.json"));
        assert!(names.iter().any(|n| n == "src"));
        assert!(!names.iter().any(|n| n == "node_modules"));
        let main = cas.fetch_from_tree(&tree, "src/main.js").unwrap();
        assert_eq!(main, b"import a from 'a';\n");

        let again = store_dir_tree(&cas, app.path()).unwrap();
        assert_eq!(tree, again);
    }

    #[test]
    fn assembly_is_deterministic_across_runs() {
        let (_cas_tmp, cas) = fresh_cas();
        let registry = RegistryTable::open_in_memory().unwrap();
        let app = tempfile::tempdir().unwrap();
        entry_package(app.path());
        let entry = app.path().join("src/main.js");

        let first = assemble_entry(&graph_http(), &cas, &registry, REGISTRY, &entry).unwrap();
        let second = assemble_entry(&graph_http(), &cas, &registry, REGISTRY, &entry).unwrap();
        assert_eq!(first.compartment_map_hash, second.compartment_map_hash);
        assert_eq!(first.entry_tree_hash, second.entry_tree_hash);
    }

    #[test]
    fn assemble_without_manifest_yields_entry_only_map() {
        let (_cas_tmp, cas) = fresh_cas();
        let registry = RegistryTable::open_in_memory().unwrap();
        let http = MockHttp::new();
        let app = tempfile::tempdir().unwrap();
        fs::write(app.path().join("lone.js"), "export default 1;\n").unwrap();

        let run = assemble_entry(
            &http,
            &cas,
            &registry,
            REGISTRY,
            &app.path().join("lone.js"),
        )
        .unwrap();

        assert!(run.resolution.is_empty());
        assert_eq!(*http.calls.borrow(), 0);
        let map = assembled_map(&cas, &run);
        assert_eq!(map["compartments"].as_object().unwrap().len(), 1);
        assert_eq!(map["entry"]["module"], "./lone.js");
    }

    #[test]
    fn cached_replay_reassembles_identically_with_zero_network() {
        let (_cas_tmp, cas) = fresh_cas();
        let registry = RegistryTable::open_in_memory().unwrap();
        let app = tempfile::tempdir().unwrap();
        entry_package(app.path());
        let entry = app.path().join("src/main.js");

        let online = assemble_entry(&graph_http(), &cas, &registry, REGISTRY, &entry).unwrap();
        // Replay against the populated CAS + registry table with a
        // client that hard-fails every request: the registry table
        // is the lock file.
        let replay = assemble_entry(&FailClient, &cas, &registry, REGISTRY, &entry).unwrap();
        assert_eq!(online.compartment_map_hash, replay.compartment_map_hash);
    }

    #[test]
    fn malformed_manifest_is_an_error() {
        let (_cas_tmp, cas) = fresh_cas();
        let registry = RegistryTable::open_in_memory().unwrap();
        let app = tempfile::tempdir().unwrap();
        fs::write(app.path().join("package.json"), "{not json").unwrap();
        fs::write(app.path().join("main.js"), "\n").unwrap();

        let err = assemble_entry(
            &MockHttp::new(),
            &cas,
            &registry,
            REGISTRY,
            &app.path().join("main.js"),
        )
        .unwrap_err();
        assert!(matches!(err, AssembleError::BadPackageJson(_)));
    }

    /// Live-network assembly against registry.npmjs.org, gated
    /// behind `ENDOR_REGISTRY_LIVE_TEST=1` like the resolver's live
    /// test:
    ///
    /// ```sh
    /// ENDOR_REGISTRY_LIVE_TEST=1 \
    ///   cargo test -p endo --lib assemble::tests::live_registry -- --nocapture
    /// ```
    #[test]
    fn live_registry_entry_assembly() {
        if std::env::var("ENDOR_REGISTRY_LIVE_TEST").ok().as_deref() != Some("1") {
            eprintln!("skipping live registry test (set ENDOR_REGISTRY_LIVE_TEST=1 to enable)");
            return;
        }
        let (_cas_tmp, cas) = fresh_cas();
        let registry = RegistryTable::open_in_memory().unwrap();
        let app = tempfile::tempdir().unwrap();
        fs::write(
            app.path().join("package.json"),
            r#"{"name":"live-app","dependencies":{"is-odd":"^3.0.0"}}"#,
        )
        .unwrap();
        fs::write(app.path().join("main.js"), "import isOdd from 'is-odd';\n").unwrap();

        let http = crate::fetch::UreqClient::new();
        let run = assemble_entry(
            &http,
            &cas,
            &registry,
            REGISTRY,
            &app.path().join("main.js"),
        )
        .unwrap();

        let map = assembled_map(&cas, &run);
        let compartments = map["compartments"].as_object().unwrap();
        let is_odd_key = compartments
            .keys()
            .find(|k| k.starts_with("is-odd-v"))
            .expect("is-odd compartment");
        let is_number_key = compartments
            .keys()
            .find(|k| k.starts_with("is-number-v"))
            .expect("is-number compartment (transitive)");
        eprintln!(
            "assembled compartment map {} with {} and {}",
            run.compartment_map_hash, is_odd_key, is_number_key
        );

        // Cached replay from the same CAS + table must reproduce
        // the map byte-for-byte with zero network.
        let replay = assemble_entry(
            &FailClient,
            &cas,
            &registry,
            REGISTRY,
            &app.path().join("main.js"),
        )
        .unwrap();
        assert_eq!(replay.compartment_map_hash, run.compartment_map_hash);
        eprintln!("cached replay reproduced the map with zero HTTP");
    }
}
