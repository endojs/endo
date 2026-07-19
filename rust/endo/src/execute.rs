//! Entry-point run execution: the remaining half of Phase 4 of
//! `designs/endor-npm-registry-proxy.md`.
//!
//! [`crate::assemble`] leaves a compartment map in the CAS whose
//! locations are `cas:sha256:<tree>` URIs and whose dependency edges
//! name the target compartment with `"."` for its default entry.
//! This module turns that artifact into a runnable
//! [`xsnap::archive::LoadedArchive`]:
//!
//! - each compartment's CAS tree is walked and its module files
//!   (`.js`, `.mjs`, `.cjs`, `.json`) become `File` descriptors with
//!   sources read back out of the CAS,
//! - each `"."` dependency edge is bound to the target package's
//!   concrete main module (its `package.json` `main`, with npm's
//!   `.js` / `/index.js` completions, defaulting to `index.js`) as a
//!   `Link` descriptor,
//! - every source is normalized to ESM before it enters the archive,
//!   because the XS loader hosts modules via `ModuleSource` (an
//!   ESM-only surface): `.json` becomes `export default <json>;` and
//!   CommonJS gets a best-effort shim exporting `module.exports` as
//!   the default binding. The shim provides no `require`; a CommonJS
//!   module that calls `require` fails at import time with a
//!   `ReferenceError` naming it — a truthful report of the gap
//!   rather than a silent wrong answer. Full CommonJS linkage is a
//!   known gap tracked in the design.
//!
//! A second known limitation inherited from the archive loader:
//! relative imports resolve against the compartment root, not the
//! importing module's directory (the resolve hook is identity), so a
//! package whose nested modules import `../sibling.js` will not link.

use std::collections::{BTreeMap, HashMap};
use std::fmt;
use std::io;
use std::path::Path;

use crate::cas::ContentStore;
use xsnap::archive::{
    CompartmentDescriptor, CompartmentMap, EntryDescriptor, LoadedArchive, ModuleDescriptor,
};

/// Errors from loading an assembled compartment map for execution.
#[derive(Debug)]
pub enum ExecuteError {
    /// The compartment map document did not parse or lacked a
    /// required field.
    BadMap(String),
    /// A compartment's location was not a `cas:sha256:` URI.
    BadLocation {
        compartment: String,
        location: String,
    },
    /// A dependency edge names a compartment the map does not hold.
    MissingCompartment { requirer: String, target: String },
    /// A package's main module could not be located in its tree.
    NoMain { compartment: String },
    /// CAS I/O failed.
    Io(io::Error),
}

impl fmt::Display for ExecuteError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ExecuteError::BadMap(msg) => write!(f, "bad compartment map: {msg}"),
            ExecuteError::BadLocation {
                compartment,
                location,
            } => write!(
                f,
                "compartment {compartment}: unsupported location {location:?}"
            ),
            ExecuteError::MissingCompartment { requirer, target } => {
                write!(f, "{requirer}: edge to missing compartment {target}")
            }
            ExecuteError::NoMain { compartment } => {
                write!(f, "cannot locate main module of {compartment}")
            }
            ExecuteError::Io(e) => write!(f, "execute I/O: {e}"),
        }
    }
}

impl From<io::Error> for ExecuteError {
    fn from(e: io::Error) -> Self {
        ExecuteError::Io(e)
    }
}

/// One compartment as parsed back out of the assembled map.
struct MapCompartment {
    /// CAS tree hash from the `cas:sha256:` location.
    tree_hash: String,
    /// Dependency edges: bare specifier → target compartment key.
    edges: BTreeMap<String, String>,
}

/// Parse the assembled compartment-map document.
fn parse_map(
    bytes: &[u8],
) -> Result<(EntryDescriptor, BTreeMap<String, MapCompartment>), ExecuteError> {
    let doc: serde_json::Value =
        serde_json::from_slice(bytes).map_err(|e| ExecuteError::BadMap(format!("parse: {e}")))?;
    let entry_compartment = doc["entry"]["compartment"]
        .as_str()
        .ok_or_else(|| ExecuteError::BadMap("entry.compartment missing".to_string()))?
        .to_string();
    let entry_module = doc["entry"]["module"]
        .as_str()
        .ok_or_else(|| ExecuteError::BadMap("entry.module missing".to_string()))?
        .to_string();
    let compartments_doc = doc["compartments"]
        .as_object()
        .ok_or_else(|| ExecuteError::BadMap("compartments missing".to_string()))?;

    let mut compartments = BTreeMap::new();
    for (key, descriptor) in compartments_doc {
        let location = descriptor["location"]
            .as_str()
            .ok_or_else(|| ExecuteError::BadMap(format!("{key}: location missing")))?;
        let tree_hash = location
            .strip_prefix("cas:sha256:")
            .ok_or_else(|| ExecuteError::BadLocation {
                compartment: key.clone(),
                location: location.to_string(),
            })?
            .to_string();
        let mut edges = BTreeMap::new();
        if let Some(modules) = descriptor["modules"].as_object() {
            for (specifier, edge) in modules {
                let target = edge["compartment"].as_str().ok_or_else(|| {
                    ExecuteError::BadMap(format!("{key}: edge {specifier} lacks a compartment"))
                })?;
                edges.insert(specifier.clone(), target.to_string());
            }
        }
        compartments.insert(key.clone(), MapCompartment { tree_hash, edges });
    }
    Ok((
        EntryDescriptor {
            compartment: entry_compartment,
            module: entry_module,
        },
        compartments,
    ))
}

/// Recursively collect a CAS package tree's module files as
/// `relative/path` → contents, keeping only extensions the loader
/// can host.
fn collect_module_files(
    cas: &ContentStore,
    tree_hash: &str,
    prefix: &str,
    out: &mut BTreeMap<String, Vec<u8>>,
) -> io::Result<()> {
    let tree = cas.read_tree(tree_hash)?;
    for (child_name, entry) in &tree.entries {
        let path = if prefix.is_empty() {
            child_name.clone()
        } else {
            format!("{prefix}/{child_name}")
        };
        match entry.entry_type.as_str() {
            "tree" => collect_module_files(cas, &entry.hash, &path, out)?,
            _ => {
                if matches!(
                    Path::new(child_name).extension().and_then(|e| e.to_str()),
                    Some("js") | Some("mjs") | Some("cjs") | Some("json")
                ) {
                    out.insert(path, cas.fetch(&entry.hash)?);
                }
            }
        }
    }
    Ok(())
}

/// The pieces of a package's `package.json` execution consults.
struct TreeManifest {
    /// `"type": "module"` — `.js` files are ESM.
    esm_by_default: bool,
    /// `main` field, if present.
    main: Option<String>,
}

/// Read a compartment tree's `package.json`, tolerating absence (a
/// bare entry directory has none) and malformation (the assembler
/// already validated the manifests it consumed; a package tarball's
/// own manifest is data, not a gate, here).
fn read_tree_manifest(cas: &ContentStore, tree_hash: &str) -> TreeManifest {
    let parsed = cas
        .fetch_from_tree(tree_hash, "package.json")
        .ok()
        .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok());
    match parsed {
        Some(doc) => TreeManifest {
            esm_by_default: doc.get("type").and_then(|t| t.as_str()) == Some("module"),
            main: doc
                .get("main")
                .and_then(|m| m.as_str())
                .map(|m| m.to_string()),
        },
        None => TreeManifest {
            esm_by_default: false,
            main: None,
        },
    }
}

/// Locate a package's main module among its collected files: the
/// `main` field with npm's `.js` / `/index.js` completions, then
/// `index.js`. Returns a `./`-prefixed specifier.
fn resolve_main(manifest: &TreeManifest, files: &BTreeMap<String, Vec<u8>>) -> Option<String> {
    let declared = manifest.main.as_deref().unwrap_or("index.js");
    let declared = declared.strip_prefix("./").unwrap_or(declared);
    let candidates = [
        declared.to_string(),
        format!("{declared}.js"),
        format!("{declared}/index.js"),
        "index.js".to_string(),
    ];
    candidates
        .into_iter()
        .find(|c| files.contains_key(c))
        .map(|c| format!("./{c}"))
}

/// Normalize a module source to ESM according to its extension and
/// its package's `type` field (see the module doc for the CommonJS
/// and JSON treatment).
fn normalize_to_esm(path: &str, bytes: &[u8], esm_by_default: bool) -> String {
    let source = String::from_utf8_lossy(bytes).into_owned();
    let ext = Path::new(path).extension().and_then(|e| e.to_str());
    match ext {
        Some("json") => format!("export default ({source});"),
        Some("mjs") => source,
        Some("js") if esm_by_default => source,
        _ => format!(
            "const module = {{ exports: {{}} }};\nconst exports = module.exports;\n{source}\nexport default module.exports;\n"
        ),
    }
}

/// Load an assembled compartment map (by its CAS blob hash) into a
/// runnable archive: sources from the CAS trees, `Link` descriptors
/// for the dependency edges.
pub fn load_assembled_archive(
    cas: &ContentStore,
    compartment_map_hash: &str,
) -> Result<LoadedArchive, ExecuteError> {
    let map_bytes = cas.fetch(compartment_map_hash)?;
    let (entry, parsed) = parse_map(&map_bytes)?;

    // First pass: per-compartment files, manifests, and mains, so
    // edges can bind to concrete main modules in the second pass.
    let mut files_by_key: BTreeMap<String, BTreeMap<String, Vec<u8>>> = BTreeMap::new();
    let mut manifests: BTreeMap<String, TreeManifest> = BTreeMap::new();
    let mut mains: BTreeMap<String, String> = BTreeMap::new();
    for (key, compartment) in &parsed {
        let mut files = BTreeMap::new();
        collect_module_files(cas, &compartment.tree_hash, "", &mut files)?;
        let manifest = read_tree_manifest(cas, &compartment.tree_hash);
        if let Some(main) = resolve_main(&manifest, &files) {
            mains.insert(key.clone(), main);
        }
        files_by_key.insert(key.clone(), files);
        manifests.insert(key.clone(), manifest);
    }

    let mut compartments: HashMap<String, CompartmentDescriptor> = HashMap::new();
    let mut sources: HashMap<(String, String), String> = HashMap::new();
    for (key, compartment) in &parsed {
        let files = &files_by_key[key];
        let manifest = &manifests[key];

        let mut modules: HashMap<String, ModuleDescriptor> = HashMap::new();
        for (path, bytes) in files {
            let specifier = format!("./{path}");
            modules.insert(
                specifier.clone(),
                ModuleDescriptor::File {
                    parser: "mjs".to_string(),
                    location: None,
                    sha512: None,
                },
            );
            sources.insert(
                (key.clone(), specifier),
                normalize_to_esm(path, bytes, manifest.esm_by_default),
            );
        }

        for (specifier, target) in &compartment.edges {
            if !parsed.contains_key(target) {
                return Err(ExecuteError::MissingCompartment {
                    requirer: key.clone(),
                    target: target.clone(),
                });
            }
            let target_main = mains.get(target).ok_or_else(|| ExecuteError::NoMain {
                compartment: target.clone(),
            })?;
            modules.insert(
                specifier.clone(),
                ModuleDescriptor::Link {
                    compartment: target.clone(),
                    module: target_main.clone(),
                },
            );
        }

        compartments.insert(
            key.clone(),
            CompartmentDescriptor {
                name: key.clone(),
                label: None,
                modules,
            },
        );
    }

    // The entry module must exist, or the run would fail deep inside
    // the XS loader with a less useful message.
    if !sources.contains_key(&(entry.compartment.clone(), entry.module.clone())) {
        return Err(ExecuteError::BadMap(format!(
            "entry module {} not found in compartment {}",
            entry.module, entry.compartment
        )));
    }

    Ok(LoadedArchive {
        map: CompartmentMap {
            entry,
            compartments,
        },
        sources,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::assemble::{assemble_entry, ENTRY_COMPARTMENT};
    use crate::fetch::{FetchError, HttpClient, DEFAULT_REGISTRY};
    use crate::registry::RegistryTable;
    use std::collections::HashMap as StdHashMap;
    use std::fs;
    use std::io::Write;

    // Minimal mock registry, mirroring the fixtures in
    // `assemble::tests` (same duplication rationale recorded there:
    // hoisting shared test support from open stacked PRs would
    // manufacture rebase conflicts).
    struct MockHttp {
        responses: StdHashMap<String, Vec<u8>>,
    }

    impl MockHttp {
        fn new() -> Self {
            MockHttp {
                responses: StdHashMap::new(),
            }
        }

        fn respond(mut self, url: &str, body: Vec<u8>) -> Self {
            self.responses.insert(url.to_string(), body);
            self
        }
    }

    impl HttpClient for MockHttp {
        fn get_metadata(&self, url: &str) -> Result<Vec<u8>, FetchError> {
            self.responses
                .get(url)
                .cloned()
                .ok_or_else(|| FetchError::Http(format!("no mock for {url}")))
        }
        fn get_tarball(&self, url: &str) -> Result<Vec<u8>, FetchError> {
            self.responses
                .get(url)
                .cloned()
                .ok_or_else(|| FetchError::Http(format!("no mock for {url}")))
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

    /// An ESM graph: esm-a@1.2.0 (type module) depends on
    /// esm-b@^2.0.0 (type module).
    fn esm_graph_http() -> MockHttp {
        let b_tar = make_tarball(&[
            (
                "package/package.json",
                br#"{"name":"esm-b","version":"2.3.0","type":"module","main":"index.js"}"#,
            ),
            ("package/index.js", b"export const b = 2;\n"),
        ]);
        let a_tar = make_tarball(&[
            (
                "package/package.json",
                br#"{"name":"esm-a","version":"1.2.0","type":"module","dependencies":{"esm-b":"^2.0.0"}}"#,
            ),
            (
                "package/index.js",
                b"import { b } from 'esm-b';\nexport const a = b + 1;\n",
            ),
        ]);
        MockHttp::new()
            .respond(
                "https://registry.npmjs.org/esm-a",
                registry_meta("esm-a", &["1.2.0"]),
            )
            .respond(
                "https://registry.npmjs.org/esm-b",
                registry_meta("esm-b", &["2.3.0"]),
            )
            .respond(&tarball_url("esm-a", "1.2.0"), a_tar)
            .respond(&tarball_url("esm-b", "2.3.0"), b_tar)
    }

    fn assemble_esm_app(
        cas: &ContentStore,
        registry: &RegistryTable,
        app: &Path,
    ) -> crate::assemble::AssembledRun {
        fs::write(
            app.join("package.json"),
            r#"{"name":"app","type":"module","dependencies":{"esm-a":"^1.0.0"}}"#,
        )
        .unwrap();
        fs::write(
            app.join("main.js"),
            "import { a } from 'esm-a';\nprint(`a=${a}`);\n",
        )
        .unwrap();
        assemble_entry(
            &esm_graph_http(),
            cas,
            registry,
            DEFAULT_REGISTRY,
            &app.join("main.js"),
        )
        .unwrap()
    }

    #[test]
    fn loads_assembled_map_into_linked_archive() {
        let cas_tmp = tempfile::tempdir().unwrap();
        let cas = ContentStore::open(cas_tmp.path()).unwrap();
        let registry = RegistryTable::open_in_memory().unwrap();
        let app = tempfile::tempdir().unwrap();
        let run = assemble_esm_app(&cas, &registry, app.path());

        let archive = load_assembled_archive(&cas, &run.compartment_map_hash).unwrap();

        assert_eq!(archive.map.entry.compartment, ENTRY_COMPARTMENT);
        assert_eq!(archive.map.entry.module, "./main.js");

        // Entry links its bare specifier to esm-a's concrete main.
        let entry_comp = &archive.map.compartments[ENTRY_COMPARTMENT];
        match &entry_comp.modules["esm-a"] {
            ModuleDescriptor::Link {
                compartment,
                module,
            } => {
                assert_eq!(compartment, "esm-a-v1.2.0");
                assert_eq!(module, "./index.js");
            }
            other => panic!("expected link for esm-a, got {other:?}"),
        }
        // esm-a links esm-b likewise.
        let a_comp = &archive.map.compartments["esm-a-v1.2.0"];
        match &a_comp.modules["esm-b"] {
            ModuleDescriptor::Link {
                compartment,
                module,
            } => {
                assert_eq!(compartment, "esm-b-v2.3.0");
                assert_eq!(module, "./index.js");
            }
            other => panic!("expected link for esm-b, got {other:?}"),
        }

        // ESM sources pass through untouched, out of the CAS trees.
        assert_eq!(
            archive.sources[&("esm-b-v2.3.0".to_string(), "./index.js".to_string())],
            "export const b = 2;\n"
        );
        assert_eq!(
            archive.sources[&(ENTRY_COMPARTMENT.to_string(), "./main.js".to_string())],
            "import { a } from 'esm-a';\nprint(`a=${a}`);\n"
        );
    }

    /// The full Phase 4 loop offline: assemble from a mock registry,
    /// load, and EXECUTE in an XS machine. The entry imports through
    /// two compartments and prints; a failed link or a bad source
    /// fails installation and hence the test.
    #[test]
    fn executes_assembled_esm_graph_in_xs() {
        let cas_tmp = tempfile::tempdir().unwrap();
        let cas = ContentStore::open(cas_tmp.path()).unwrap();
        let registry = RegistryTable::open_in_memory().unwrap();
        let app = tempfile::tempdir().unwrap();
        let run = assemble_esm_app(&cas, &registry, app.path());

        let archive = load_assembled_archive(&cas, &run.compartment_map_hash).unwrap();
        xsnap::run_xs_archive_loaded(&archive).expect("XS execution of the assembled graph");
    }

    #[test]
    fn normalizes_cjs_and_json_sources() {
        let cjs = normalize_to_esm("index.js", b"module.exports = 5;", false);
        assert!(cjs.starts_with("const module = { exports: {} };"));
        assert!(cjs.ends_with("export default module.exports;\n"));

        let json = normalize_to_esm("data.json", b"{\"a\":1}", false);
        assert_eq!(json, "export default ({\"a\":1});");

        let esm_js = normalize_to_esm("index.js", b"export default 1;", true);
        assert_eq!(esm_js, "export default 1;");

        let mjs = normalize_to_esm("index.mjs", b"export default 2;", false);
        assert_eq!(mjs, "export default 2;");
    }

    #[test]
    fn missing_entry_module_is_a_clear_error() {
        let cas_tmp = tempfile::tempdir().unwrap();
        let cas = ContentStore::open(cas_tmp.path()).unwrap();
        // A map whose entry module does not exist in its tree.
        let empty_tree = cas.store_tree(b"{\"entries\":{}}").unwrap();
        let map = serde_json::json!({
            "tags": [],
            "entry": {"compartment": "<entry>", "module": "./main.js"},
            "compartments": {
                "<entry>": {
                    "name": "app",
                    "location": format!("cas:sha256:{empty_tree}"),
                    "modules": {},
                }
            }
        });
        let hash = cas
            .store(&serde_json::to_vec(&map).unwrap(), "compartment-map")
            .unwrap();
        let err = match load_assembled_archive(&cas, &hash) {
            Ok(_) => panic!("expected a missing-entry error"),
            Err(e) => e,
        };
        assert!(matches!(err, ExecuteError::BadMap(_)), "got {err}");
    }

    #[test]
    fn non_cas_location_is_rejected() {
        let cas_tmp = tempfile::tempdir().unwrap();
        let cas = ContentStore::open(cas_tmp.path()).unwrap();
        let map = serde_json::json!({
            "tags": [],
            "entry": {"compartment": "<entry>", "module": "./main.js"},
            "compartments": {
                "<entry>": {
                    "name": "app",
                    "location": "file:///tmp/app",
                    "modules": {},
                }
            }
        });
        let hash = cas
            .store(&serde_json::to_vec(&map).unwrap(), "compartment-map")
            .unwrap();
        let err = match load_assembled_archive(&cas, &hash) {
            Ok(_) => panic!("expected a bad-location error"),
            Err(e) => e,
        };
        assert!(matches!(err, ExecuteError::BadLocation { .. }), "got {err}");
    }
}
