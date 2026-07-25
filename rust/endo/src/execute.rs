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
//! - each `"."` dependency edge is left as a `Link` with module
//!   `"."`, unresolved: entry-point and subpath resolution — the
//!   `package.json` `"exports"` map (subpath keys, wildcard patterns,
//!   nested conditions, subpath encapsulation), the `"main"` /
//!   `index.js` fallback — happens at run time in the archive
//!   bootstrap (`xsnap::archive`'s exports resolver), where a bare
//!   subpath import (`import x from 'pkg/sub'`) needs it anyway. The
//!   target package's `package.json` is therefore kept as raw JSON in
//!   the source registry so the resolver can read it back.
//! - every source is normalized to ESM before it enters the archive,
//!   because the XS loader hosts modules via `ModuleSource` (an
//!   ESM-only surface): `.json` becomes `export default <json>;` and
//!   a CommonJS module becomes a one-line ESM facade
//!   (`export default __loadCjs(...)`) over its raw source, carried
//!   separately in [`LoadedArchive::cjs_sources`]. The archive
//!   runtime's CommonJS loader (`xsnap::archive`'s `CJS_RUNTIME_JS`)
//!   evaluates the raw source under a function wrapper with a real
//!   `require` — relative specifiers against the requiring module's
//!   directory, bare and subpath specifiers through the link map and
//!   the exports resolver with `require`-conditions-first, a
//!   Node-style cycle-safe module cache — so ESM importers see the
//!   CJS `module.exports` as the default export and CJS consumers
//!   require one another natively.

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
}

/// Read a compartment tree's `package.json`, tolerating absence (a
/// bare entry directory has none) and malformation (the assembler
/// already validated the manifests it consumed; a package tarball's
/// own manifest is data, not a gate, here). Entry-point resolution
/// (`main` / `exports`) is deferred to the runtime resolver, which
/// reads the raw manifest back out of the source registry; only the
/// `type` field is consulted here, to classify `.js` parsers.
fn read_tree_manifest(cas: &ContentStore, tree_hash: &str) -> TreeManifest {
    let parsed = cas
        .fetch_from_tree(tree_hash, "package.json")
        .ok()
        .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok());
    match parsed {
        Some(doc) => TreeManifest {
            esm_by_default: doc.get("type").and_then(|t| t.as_str()) == Some("module"),
        },
        None => TreeManifest {
            esm_by_default: false,
        },
    }
}

/// A module source normalized for the archive registry: the ESM text
/// the loader hosts, plus — for a CommonJS module — the raw source
/// the runtime CJS loader evaluates with a working `require`.
struct NormalizedSource {
    /// The source registered for the ESM loader (a facade, for CJS).
    esm: String,
    /// The unwrapped CommonJS text, when the module is CJS.
    cjs_raw: Option<String>,
}

/// Normalize a module source to ESM according to its extension and
/// its package's `type` field (see the module doc for the CommonJS
/// and JSON treatment). `package.json` is kept as raw JSON — never
/// wrapped as an ESM module — because the runtime exports resolver
/// parses it back out of the source registry to bind `"."` edges and
/// subpaths. A CommonJS module yields an ESM facade delegating to
/// the runtime CJS loader, keyed by its compartment and `./`-rooted
/// specifier, with the raw source (shebang stripped, as Node does)
/// carried alongside.
fn normalize_to_esm(
    path: &str,
    bytes: &[u8],
    esm_by_default: bool,
    compartment: &str,
) -> NormalizedSource {
    let source = String::from_utf8_lossy(bytes).into_owned();
    let esm_only = |esm: String| NormalizedSource {
        esm,
        cjs_raw: None,
    };
    if Path::new(path).file_name().and_then(|n| n.to_str()) == Some("package.json") {
        return esm_only(source);
    }
    let ext = Path::new(path).extension().and_then(|e| e.to_str());
    match ext {
        Some("json") => esm_only(format!("export default ({source});")),
        Some("mjs") => esm_only(source),
        Some("js") if esm_by_default => esm_only(source),
        _ => {
            // Strip the shebang line but keep the newline in its place,
            // as Node does, so line numbers (and stack traces) stay
            // aligned to the original source.
            let raw = match source.strip_prefix("#!") {
                Some(rest) => match rest.split_once('\n') {
                    Some((_, body)) => format!("\n{body}"),
                    None => String::new(),
                },
                None => source,
            };
            let comp_json =
                serde_json::to_string(compartment).unwrap_or_else(|_| "\"\"".to_string());
            let key_json = serde_json::to_string(&format!("./{path}"))
                .unwrap_or_else(|_| "\"\"".to_string());
            // Synthesize named exports for the statically detected
            // `module.exports` names (cjs-module-lexer shape), so
            // `import { named } from 'cjsPkg'` links; a name the
            // evaluated exports never receives binds `undefined`,
            // as in Node's interop. With no detected names the
            // facade keeps the one-line default-only form.
            let names = crate::cjs_lexer::detect_named_exports(&raw);
            let esm = if names.is_empty() {
                format!("export default __loadCjs({comp_json}, {key_json});\n")
            } else {
                let mut facade = format!(
                    "const __cjs = __loadCjs({comp_json}, {key_json});\n\
                     export default __cjs;\n\
                     const __cjsO = __cjs == null ? {{}} : __cjs;\n"
                );
                for name in &names {
                    facade.push_str(&format!("export const {name} = __cjsO.{name};\n"));
                }
                facade
            };
            NormalizedSource {
                esm,
                cjs_raw: Some(raw),
            }
        }
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

    // First pass: per-compartment files and manifests. Edges are
    // bound to the target's `"."` entry at run time by the exports
    // resolver, so no main pre-resolution happens here.
    let mut files_by_key: BTreeMap<String, BTreeMap<String, Vec<u8>>> = BTreeMap::new();
    let mut manifests: BTreeMap<String, TreeManifest> = BTreeMap::new();
    for (key, compartment) in &parsed {
        let mut files = BTreeMap::new();
        collect_module_files(cas, &compartment.tree_hash, "", &mut files)?;
        let manifest = read_tree_manifest(cas, &compartment.tree_hash);
        files_by_key.insert(key.clone(), files);
        manifests.insert(key.clone(), manifest);
    }

    let mut compartments: HashMap<String, CompartmentDescriptor> = HashMap::new();
    let mut sources: HashMap<(String, String), String> = HashMap::new();
    let mut cjs_sources: HashMap<(String, String), String> = HashMap::new();
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
            let normalized = normalize_to_esm(path, bytes, manifest.esm_by_default, key);
            sources.insert((key.clone(), specifier.clone()), normalized.esm);
            if let Some(raw) = normalized.cjs_raw {
                cjs_sources.insert((key.clone(), specifier), raw);
            }
        }

        for (specifier, target) in &compartment.edges {
            if !parsed.contains_key(target) {
                return Err(ExecuteError::MissingCompartment {
                    requirer: key.clone(),
                    target: target.clone(),
                });
            }
            // Leave the edge unresolved as `"."`; the runtime exports
            // resolver binds it to the target's entry (exports map
            // over `main` over `index.js`) at import time.
            modules.insert(
                specifier.clone(),
                ModuleDescriptor::Link {
                    compartment: target.clone(),
                    module: ".".to_string(),
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
        cjs_sources,
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

        // Entry links its bare specifier to esm-a's compartment,
        // unresolved ("."); the runtime resolver binds it at import.
        let entry_comp = &archive.map.compartments[ENTRY_COMPARTMENT];
        match &entry_comp.modules["esm-a"] {
            ModuleDescriptor::Link {
                compartment,
                module,
            } => {
                assert_eq!(compartment, "esm-a-v1.2.0");
                assert_eq!(module, ".");
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
                assert_eq!(module, ".");
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

    /// Top-level await in both the entry module and a dependency:
    /// the async import path (`loadHook` + lazy cross-compartment
    /// descriptors) evaluates the graph where the synchronous
    /// `importNow` path failed with `TypeError: async module`.
    #[test]
    fn executes_top_level_await_graph_in_xs() {
        let tla_tar = make_tarball(&[
            (
                "package/package.json",
                br#"{"name":"tla-dep","version":"1.0.0","type":"module","main":"index.js"}"#,
            ),
            (
                "package/index.js",
                b"export const d = await Promise.resolve(7);\n",
            ),
        ]);
        let http = MockHttp::new()
            .respond(
                "https://registry.npmjs.org/tla-dep",
                registry_meta("tla-dep", &["1.0.0"]),
            )
            .respond(&tarball_url("tla-dep", "1.0.0"), tla_tar);

        let cas_tmp = tempfile::tempdir().unwrap();
        let cas = ContentStore::open(cas_tmp.path()).unwrap();
        let registry = RegistryTable::open_in_memory().unwrap();
        let app = tempfile::tempdir().unwrap();
        fs::write(
            app.path().join("package.json"),
            r#"{"name":"app","type":"module","dependencies":{"tla-dep":"^1.0.0"}}"#,
        )
        .unwrap();
        fs::write(
            app.path().join("main.js"),
            "import { d } from 'tla-dep';\n\
             const e = await Promise.resolve(1);\n\
             print(`d+e=${d + e}`);\n",
        )
        .unwrap();
        let run = assemble_entry(
            &http,
            &cas,
            &registry,
            DEFAULT_REGISTRY,
            &app.path().join("main.js"),
        )
        .unwrap();

        let archive = load_assembled_archive(&cas, &run.compartment_map_hash).unwrap();
        xsnap::run_xs_archive_loaded(&archive)
            .expect("XS execution of the top-level-await graph");
    }

    #[test]
    fn normalizes_cjs_and_json_sources() {
        let cjs = normalize_to_esm("index.js", b"module.exports = 5;", false, "dep-v1.0.0");
        assert_eq!(
            cjs.esm,
            "export default __loadCjs(\"dep-v1.0.0\", \"./index.js\");\n"
        );
        assert_eq!(cjs.cjs_raw.as_deref(), Some("module.exports = 5;"));

        // A CJS bin-style shebang line is stripped, as Node strips it,
        // but the newline is kept in its place so line numbers stay
        // aligned to the original source.
        let shebang = normalize_to_esm(
            "cli.js",
            b"#!/usr/bin/env node\nmodule.exports = 9;",
            false,
            "dep-v1.0.0",
        );
        assert_eq!(shebang.cjs_raw.as_deref(), Some("\nmodule.exports = 9;"));

        let json = normalize_to_esm("data.json", b"{\"a\":1}", false, "dep-v1.0.0");
        assert_eq!(json.esm, "export default ({\"a\":1});");
        assert!(json.cjs_raw.is_none());

        let esm_js = normalize_to_esm("index.js", b"export default 1;", true, "dep-v1.0.0");
        assert_eq!(esm_js.esm, "export default 1;");
        assert!(esm_js.cjs_raw.is_none());

        let mjs = normalize_to_esm("index.mjs", b"export default 2;", false, "dep-v1.0.0");
        assert_eq!(mjs.esm, "export default 2;");
        assert!(mjs.cjs_raw.is_none());
    }

    /// A CJS module with statically detectable export names gets a
    /// facade that also synthesizes each name, so ESM importers can
    /// bind `import { named }` (cjs-module-lexer shape).
    #[test]
    fn cjs_facade_synthesizes_named_exports() {
        let cjs = normalize_to_esm(
            "index.js",
            b"exports.alpha = 1;\nmodule.exports.beta = 2;\n",
            false,
            "dep-v1.0.0",
        );
        assert_eq!(
            cjs.esm,
            "const __cjs = __loadCjs(\"dep-v1.0.0\", \"./index.js\");\n\
             export default __cjs;\n\
             const __cjsO = __cjs == null ? {} : __cjs;\n\
             export const alpha = __cjsO.alpha;\n\
             export const beta = __cjsO.beta;\n"
        );

        // Object-literal replacement exports its top-level keys.
        let literal = normalize_to_esm(
            "index.js",
            b"module.exports = { parse, valid: 1 };\n",
            false,
            "dep-v1.0.0",
        );
        assert!(literal.esm.contains("export const parse = __cjsO.parse;\n"));
        assert!(literal.esm.contains("export const valid = __cjsO.valid;\n"));
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

    // --- Run-machine hardening (relanded from PR #791) ---

    /// Store one blob and return its hash.
    fn store_blob(cas: &ContentStore, content: &str) -> String {
        cas.store(content.as_bytes(), "blob").unwrap()
    }

    /// Store a flat tree from `(name, hash)` blob entries.
    fn store_flat_tree(cas: &ContentStore, entries: &[(&str, &str)]) -> String {
        let mut map = serde_json::Map::new();
        for (name, hash) in entries {
            map.insert(
                name.to_string(),
                serde_json::json!({ "type": "blob", "hash": hash }),
            );
        }
        let tree = serde_json::json!({ "entries": map });
        cas.store_tree(&serde_json::to_vec(&tree).unwrap()).unwrap()
    }

    /// A single-module entry compartment (type module) whose
    /// `main.js` is `source`, stored as a compartment map in the CAS.
    fn single_module_map(cas: &ContentStore, source: &str) -> String {
        let entry_main = store_blob(cas, source);
        let entry_manifest = store_blob(cas, r#"{"name": "app", "type": "module"}"#);
        let entry_tree = store_flat_tree(
            cas,
            &[("main.js", &entry_main), ("package.json", &entry_manifest)],
        );
        let map = serde_json::json!({
            "tags": [],
            "entry": { "compartment": "<entry>", "module": "./main.js" },
            "compartments": {
                "<entry>": {
                    "name": "app",
                    "location": format!("cas:sha256:{entry_tree}"),
                    "modules": {},
                },
            },
        });
        cas.store(&serde_json::to_vec(&map).unwrap(), "compartment-map")
            .unwrap()
    }

    /// Real npm entry code calls `console.log`; the standalone runner
    /// must endow it rather than let the reference throw.
    #[test]
    fn console_log_is_endowed_in_the_run_machine() {
        let cas_tmp = tempfile::tempdir().unwrap();
        let cas = ContentStore::open(cas_tmp.path()).unwrap();
        let map_hash = single_module_map(
            &cas,
            "console.log('hello', 42, { a: 1 });\nconsole.error('to stderr');\nexport const done = true;\n",
        );
        let archive = load_assembled_archive(&cas, &map_hash).unwrap();
        xsnap::run_xs_archive_loaded(&archive).expect("console endowment lets the run complete");
    }

    /// A throw in the program being run (here a ReferenceError) must
    /// come back as `Err` from the runner, not SIGSEGV the process.
    #[test]
    fn entry_throw_surfaces_as_error_not_crash() {
        let cas_tmp = tempfile::tempdir().unwrap();
        let cas = ContentStore::open(cas_tmp.path()).unwrap();
        let map_hash =
            single_module_map(&cas, "noSuchGlobal(1);\nexport const unreachable = 1;\n");
        let archive = load_assembled_archive(&cas, &map_hash).unwrap();
        assert!(xsnap::run_xs_archive_loaded(&archive).is_err());
    }

    // --- Node-semantics exports resolution (relanded from PR #795) ---

    /// Store a package tree from flat `(path, content)` pairs,
    /// building nested CAS subtrees for paths with directories.
    fn store_file_tree(cas: &ContentStore, files: &[(&str, &str)]) -> String {
        let mut blobs: Vec<(String, String)> = Vec::new();
        let mut subtrees: Vec<(String, Vec<(String, String)>)> = Vec::new();
        for (path, content) in files {
            match path.split_once('/') {
                None => blobs.push((path.to_string(), store_blob(cas, content))),
                Some((dir, rest)) => match subtrees.iter_mut().find(|(d, _)| d == dir) {
                    Some((_, entries)) => entries.push((rest.to_string(), content.to_string())),
                    None => {
                        subtrees.push((dir.to_string(), vec![(rest.to_string(), content.to_string())]))
                    }
                },
            }
        }
        let mut entries = serde_json::Map::new();
        for (name, hash) in &blobs {
            entries.insert(name.clone(), serde_json::json!({ "type": "blob", "hash": hash }));
        }
        for (dir, sub) in &subtrees {
            let sub_refs: Vec<(&str, &str)> =
                sub.iter().map(|(a, b)| (a.as_str(), b.as_str())).collect();
            let subtree = store_file_tree(cas, &sub_refs);
            entries.insert(dir.clone(), serde_json::json!({ "type": "tree", "hash": subtree }));
        }
        let tree = serde_json::json!({ "entries": entries });
        cas.store_tree(&serde_json::to_vec(&tree).unwrap()).unwrap()
    }

    /// A map with a type-module entry importing one dependency
    /// through edge key `dep_key`, whose package tree is `dep_files`
    /// (manifest included by the caller).
    fn two_comp_map(
        cas: &ContentStore,
        entry_src: &str,
        dep_key: &str,
        dep_files: &[(&str, &str)],
    ) -> String {
        let dep_tree = store_file_tree(cas, dep_files);
        let entry_tree = store_file_tree(
            cas,
            &[
                ("main.js", entry_src),
                ("package.json", r#"{"name": "app", "type": "module"}"#),
            ],
        );
        let map = serde_json::json!({
            "tags": [],
            "entry": { "compartment": "<entry>", "module": "./main.js" },
            "compartments": {
                "<entry>": {
                    "name": "app",
                    "location": format!("cas:sha256:{entry_tree}"),
                    "modules": {
                        dep_key: { "compartment": "dep-v1.0.0", "module": "." },
                    },
                },
                "dep-v1.0.0": {
                    "name": "dep",
                    "version": "1.0.0",
                    "location": format!("cas:sha256:{dep_tree}"),
                    "modules": {},
                },
            },
        });
        cas.store(&serde_json::to_vec(&map).unwrap(), "compartment-map")
            .unwrap()
    }

    fn run_two_comp(
        entry_src: &str,
        dep_key: &str,
        dep_files: &[(&str, &str)],
    ) -> Result<(), xsnap::XsnapError> {
        let cas_tmp = tempfile::tempdir().unwrap();
        let cas = ContentStore::open(cas_tmp.path()).unwrap();
        let map_hash = two_comp_map(&cas, entry_src, dep_key, dep_files);
        let archive = load_assembled_archive(&cas, &map_hash).unwrap();
        xsnap::run_xs_archive_loaded(&archive)
    }

    /// When a package has both `main` and `exports`, the exports map
    /// wins (Node semantics): `main` points at a file that throws,
    /// so loading it would fail the run.
    #[test]
    fn dot_edge_prefers_exports_over_main() {
        run_two_comp(
            "import v from 'dep'; export const got = v;\n",
            "dep",
            &[
                (
                    "package.json",
                    r#"{"name": "dep", "main": "./boom.js", "exports": "./good.js"}"#,
                ),
                ("boom.js", "throw new Error('main must not load');\n"),
                ("good.js", "module.exports = 'good';\n"),
            ],
        )
        .unwrap();
    }

    /// A package without an exports map keeps Node-style file
    /// access: an extension-less subpath resolves through the
    /// `.js` / `/index.js` lookup candidates.
    #[test]
    fn subpath_without_exports_falls_back_to_files() {
        run_two_comp(
            "import u from 'dep/lib/util'; export const got = u;\n",
            "dep",
            &[
                ("package.json", r#"{"name": "dep"}"#),
                ("lib/util.js", "module.exports = 7;\n"),
            ],
        )
        .unwrap();
    }

    /// Subpath exports resolve nested condition objects, skipping
    /// inapplicable conditions (`types`) and preferring the `import`
    /// build over an earlier `require` key: the require target
    /// throws, so order-blind resolution would fail the run.
    #[test]
    fn subpath_resolves_conditional_exports_import_first() {
        run_two_comp(
            "import { word } from 'dep/sub'; export const got = word;\n",
            "dep",
            &[
                (
                    "package.json",
                    r#"{"name": "dep", "type": "module", "exports": {"./sub": {"types": "./sub.d.ts", "require": "./boom.cjs", "import": "./src/sub.js"}}}"#,
                ),
                ("boom.cjs", "throw new Error('require build must not load');\n"),
                ("src/sub.js", "export const word = 'esm';\n"),
            ],
        )
        .unwrap();
    }

    /// A single-`*` wildcard pattern maps the matched text into the
    /// target path.
    #[test]
    fn wildcard_subpath_pattern_resolves() {
        run_two_comp(
            "import a from 'dep/features/alpha'; export const got = a;\n",
            "dep",
            &[
                (
                    "package.json",
                    r#"{"name": "dep", "exports": {"./features/*": "./src/features/*.js"}}"#,
                ),
                ("src/features/alpha.js", "module.exports = 'alpha';\n"),
            ],
        )
        .unwrap();
    }

    /// An exports map encapsulates the package: a subpath it does
    /// not list fails cleanly even though the file exists.
    #[test]
    fn unexported_subpath_fails_cleanly() {
        let result = run_two_comp(
            "import s from 'dep/secret.js'; export const got = s;\n",
            "dep",
            &[
                (
                    "package.json",
                    r#"{"name": "dep", "exports": {".": "./index.js"}}"#,
                ),
                ("index.js", "module.exports = 'front door';\n"),
                ("secret.js", "module.exports = 'back door';\n"),
            ],
        );
        assert!(result.is_err());
    }

    /// Scoped package names keep their two-segment name when the
    /// subpath is split off.
    #[test]
    fn scoped_package_subpath_resolves() {
        run_two_comp(
            "import u from '@acme/kit/util'; export const got = u;\n",
            "@acme/kit",
            &[
                ("package.json", r#"{"name": "@acme/kit"}"#),
                ("util.js", "module.exports = 'scoped';\n"),
            ],
        )
        .unwrap();
    }

    // --- Referrer-relative resolution ---

    /// A package whose entry lives in a subdirectory resolves its
    /// relative imports against that directory, not the package
    /// root: `./utilities.js` from `./source/index.js` is
    /// `./source/utilities.js`, and `../root-helper.js` climbs back
    /// out. An identity resolve hook fails both lookups.
    #[test]
    fn nested_module_relative_imports_resolve_against_referrer() {
        run_two_comp(
            "import v from 'dep'; export const got = v;\n",
            "dep",
            &[
                (
                    "package.json",
                    r#"{"name": "dep", "type": "module", "main": "./source/index.js"}"#,
                ),
                (
                    "source/index.js",
                    "import { u } from './utilities.js';\n\
                     import { r } from '../root-helper.js';\n\
                     export default u + r;\n",
                ),
                ("source/utilities.js", "export const u = 40;\n"),
                ("root-helper.js", "export const r = 2;\n"),
            ],
        )
        .unwrap();
    }

    /// A relative specifier that climbs above the package root is a
    /// clean error, not a root-relative mislookup: the compartment
    /// holds one package tree, so there is nothing above `.` to
    /// name.
    #[test]
    fn relative_specifier_escaping_package_root_fails_cleanly() {
        let result = run_two_comp(
            "import v from 'dep'; export const got = v;\n",
            "dep",
            &[
                (
                    "package.json",
                    r#"{"name": "dep", "type": "module", "main": "./index.js"}"#,
                ),
                ("index.js", "import '../outside.js';\nexport default 1;\n"),
            ],
        );
        assert!(result.is_err());
    }

    /// A require-only exports entry still resolves: the import-pass
    /// finds nothing and the require-pass supplies the cjs build.
    #[test]
    fn require_only_exports_resolve_on_second_pass() {
        run_two_comp(
            "import v from 'dep/sub'; export const got = v;\n",
            "dep",
            &[
                (
                    "package.json",
                    r#"{"name": "dep", "exports": {"./sub": {"require": "./sub.cjs"}}}"#,
                ),
                ("sub.cjs", "module.exports = 42;\n"),
            ],
        )
        .unwrap();
    }

    // --- CommonJS require linkage ---

    /// A CommonJS graph assembled from a mock registry: cjs-a's main
    /// lives in `lib/` and requires a relative sibling through `.js`
    /// completion, a JSON file above its own directory, and its bare
    /// dependency cjs-b. A wrong value anywhere throws, failing the
    /// run.
    fn cjs_graph_http() -> MockHttp {
        let b_tar = make_tarball(&[
            (
                "package/package.json",
                br#"{"name":"cjs-b","version":"1.0.0","main":"index.js"}"#,
            ),
            ("package/index.js", b"module.exports = { b: 10 };\n"),
        ]);
        let a_tar = make_tarball(&[
            (
                "package/package.json",
                br#"{"name":"cjs-a","version":"1.0.0","main":"lib/index.js","dependencies":{"cjs-b":"^1.0.0"}}"#,
            ),
            (
                "package/lib/index.js",
                b"var util = require('./util');\n\
                  var data = require('../data.json');\n\
                  var b = require('cjs-b');\n\
                  module.exports = { total: util.helper() + data.n + b.b };\n",
            ),
            (
                "package/lib/util.js",
                b"exports.helper = function () { return 1; };\n",
            ),
            ("package/data.json", b"{\"n\":100}\n"),
        ]);
        MockHttp::new()
            .respond(
                "https://registry.npmjs.org/cjs-a",
                registry_meta("cjs-a", &["1.0.0"]),
            )
            .respond(
                "https://registry.npmjs.org/cjs-b",
                registry_meta("cjs-b", &["1.0.0"]),
            )
            .respond(&tarball_url("cjs-a", "1.0.0"), a_tar)
            .respond(&tarball_url("cjs-b", "1.0.0"), b_tar)
    }

    #[test]
    fn executes_cjs_require_graph_in_xs() {
        let cas_tmp = tempfile::tempdir().unwrap();
        let cas = ContentStore::open(cas_tmp.path()).unwrap();
        let registry = RegistryTable::open_in_memory().unwrap();
        let app = tempfile::tempdir().unwrap();
        fs::write(
            app.path().join("package.json"),
            r#"{"name":"app","type":"module","dependencies":{"cjs-a":"^1.0.0"}}"#,
        )
        .unwrap();
        fs::write(
            app.path().join("main.js"),
            "import a from 'cjs-a';\n\
             if (a.total !== 111) throw new Error(`bad total: ${a.total}`);\n\
             print(`total=${a.total}`);\n",
        )
        .unwrap();
        let run = assemble_entry(
            &cjs_graph_http(),
            &cas,
            &registry,
            DEFAULT_REGISTRY,
            &app.path().join("main.js"),
        )
        .unwrap();

        let archive = load_assembled_archive(&cas, &run.compartment_map_hash).unwrap();
        xsnap::run_xs_archive_loaded(&archive)
            .expect("XS execution of the CommonJS require graph");
    }

    /// ESM named imports of a CJS package link through the facade's
    /// synthesized exports: `exports.name` assignments and a
    /// `module.exports = { … }` literal both surface as named
    /// bindings, and a name never actually assigned binds
    /// `undefined` rather than failing to link, as in Node's
    /// cjs-module-lexer interop.
    #[test]
    fn executes_esm_named_imports_of_cjs_in_xs() {
        let dep_tar = make_tarball(&[
            (
                "package/package.json",
                br#"{"name":"cjs-named","version":"1.0.0","main":"index.js"}"#,
            ),
            (
                "package/index.js",
                b"exports.alpha = 7;\n\
                  var helpers = require('./helpers');\n\
                  if (false) { exports.phantom = 1; }\n\
                  module.exports = { alpha: exports.alpha, sum: helpers.sum };\n",
            ),
            (
                "package/helpers.js",
                b"exports.sum = function (a, b) { return a + b; };\n",
            ),
        ]);
        let http = MockHttp::new()
            .respond(
                "https://registry.npmjs.org/cjs-named",
                registry_meta("cjs-named", &["1.0.0"]),
            )
            .respond(&tarball_url("cjs-named", "1.0.0"), dep_tar);

        let cas_tmp = tempfile::tempdir().unwrap();
        let cas = ContentStore::open(cas_tmp.path()).unwrap();
        let registry = RegistryTable::open_in_memory().unwrap();
        let app = tempfile::tempdir().unwrap();
        fs::write(
            app.path().join("package.json"),
            r#"{"name":"app","type":"module","dependencies":{"cjs-named":"^1.0.0"}}"#,
        )
        .unwrap();
        fs::write(
            app.path().join("main.js"),
            "import whole, { alpha, sum, phantom } from 'cjs-named';\n\
             if (alpha !== 7) throw new Error(`bad alpha: ${alpha}`);\n\
             if (sum(3, 4) !== 7) throw new Error('bad sum');\n\
             if (phantom !== undefined) throw new Error('phantom must be undefined');\n\
             if (whole.alpha !== alpha) throw new Error('default disagrees with named');\n\
             print(`alpha=${alpha} sum=${sum(3, 4)}`);\n",
        )
        .unwrap();
        let run = assemble_entry(
            &http,
            &cas,
            &registry,
            DEFAULT_REGISTRY,
            &app.path().join("main.js"),
        )
        .unwrap();

        let archive = load_assembled_archive(&cas, &run.compartment_map_hash).unwrap();
        xsnap::run_xs_archive_loaded(&archive)
            .expect("XS execution of ESM named imports of a CJS package");
    }

    /// A CommonJS entry point: the app package has no `"type"`, so
    /// its main module runs under the CJS loader and requires its
    /// dependency — which must resolve through `require` conditions
    /// first (the `import` build throws).
    #[test]
    fn cjs_entry_requires_with_require_conditions_first() {
        let dual_tar = make_tarball(&[
            (
                "package/package.json",
                br#"{"name":"dual","version":"1.0.0","exports":{".":{"import":"./main.mjs","require":"./main.cjs"}}}"#,
            ),
            (
                "package/main.mjs",
                b"throw new Error('import build must not load for a require');\n",
            ),
            ("package/main.cjs", b"module.exports = 'cjs-build';\n"),
        ]);
        let http = MockHttp::new()
            .respond(
                "https://registry.npmjs.org/dual",
                registry_meta("dual", &["1.0.0"]),
            )
            .respond(&tarball_url("dual", "1.0.0"), dual_tar);

        let cas_tmp = tempfile::tempdir().unwrap();
        let cas = ContentStore::open(cas_tmp.path()).unwrap();
        let registry = RegistryTable::open_in_memory().unwrap();
        let app = tempfile::tempdir().unwrap();
        fs::write(
            app.path().join("package.json"),
            r#"{"name":"app","dependencies":{"dual":"^1.0.0"}}"#,
        )
        .unwrap();
        fs::write(
            app.path().join("main.js"),
            "var v = require('dual');\n\
             if (v !== 'cjs-build') throw new Error('wrong build: ' + v);\n\
             module.exports = v;\n",
        )
        .unwrap();
        let run = assemble_entry(
            &http,
            &cas,
            &registry,
            DEFAULT_REGISTRY,
            &app.path().join("main.js"),
        )
        .unwrap();

        let archive = load_assembled_archive(&cas, &run.compartment_map_hash).unwrap();
        xsnap::run_xs_archive_loaded(&archive)
            .expect("XS execution of the CommonJS entry point");
    }

    /// A require cycle observes the partially-populated exports of
    /// the module that is still evaluating, as in Node: b sees a's
    /// pre-cycle binding as a string and its post-cycle binding as
    /// undefined.
    #[test]
    fn cjs_require_cycle_observes_partial_exports() {
        run_two_comp(
            "import v from 'dep';\n\
             if (v !== 'string/undefined:a-late') throw new Error('cycle saw: ' + v);\n\
             export const got = v;\n",
            "dep",
            &[
                ("package.json", r#"{"name": "dep", "main": "index.js"}"#),
                (
                    "index.js",
                    "var a = require('./a');\nmodule.exports = a.sawFromB + ':' + a.late;\n",
                ),
                (
                    "a.js",
                    "exports.early = 'a-early';\n\
                     var b = require('./b');\n\
                     exports.late = 'a-late';\n\
                     exports.sawFromB = b.saw;\n",
                ),
                (
                    "b.js",
                    "var a = require('./a');\nexports.saw = typeof a.early + '/' + typeof a.late;\n",
                ),
            ],
        )
        .unwrap();
    }

    /// Requiring an ESM module returns its namespace object (modern
    /// Node `require(esm)` semantics).
    #[test]
    fn cjs_require_of_esm_returns_namespace() {
        run_two_comp(
            "import v from 'dep';\n\
             if (v !== 11) throw new Error('got: ' + v);\n\
             export const got = v;\n",
            "dep",
            &[
                ("package.json", r#"{"name": "dep", "main": "index.js"}"#),
                (
                    "index.js",
                    "var ns = require('./esm.mjs');\nmodule.exports = ns.value + 1;\n",
                ),
                ("esm.mjs", "export const value = 10;\n"),
            ],
        )
        .unwrap();
    }

    /// A require of a module that does not exist is a clean run
    /// failure, not a crash.
    #[test]
    fn cjs_require_missing_module_is_clean_error() {
        let result = run_two_comp(
            "import v from 'dep'; export const got = v;\n",
            "dep",
            &[
                ("package.json", r#"{"name": "dep", "main": "index.js"}"#),
                ("index.js", "module.exports = require('./nope');\n"),
            ],
        );
        // A missing require must be a clean, identifiable failure, not a
        // crash: assert the thrown error is the Node-shaped "Cannot find
        // module" message rather than merely that the run errored (an XS
        // panic would also satisfy is_err()).
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("Cannot find module"),
            "expected a clean 'Cannot find module' failure, got: {err}"
        );
    }
}
