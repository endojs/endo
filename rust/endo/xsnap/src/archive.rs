//! Archive loader for Endo compartment-map zip archives.
//!
//! Reads a zip archive (produced by `@endo/compartment-mapper` with
//! `noTransforms: true`) containing a `compartment-map.json` manifest
//! and module source files. Loads the modules into an XS machine
//! using native Compartments.
//!
//! The archive format:
//! ```text
//! archive.zip
//! ├── compartment-map.json
//! ├── app-v1.0.0/
//! │   ├── index.js
//! │   └── lib/utils.js
//! ├── dep-v2.0.0/
//! │   └── index.js
//! └── ...
//! ```

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{self, Read, Seek};

// ---------------------------------------------------------------------------
// Compartment map types (subset of @endo/compartment-mapper schema)
// ---------------------------------------------------------------------------

/// Top-level compartment map descriptor.
#[derive(Debug, Deserialize, Serialize)]
pub struct CompartmentMap {
    pub entry: EntryDescriptor,
    pub compartments: HashMap<String, CompartmentDescriptor>,
}

/// Entry point: which compartment and module to start from.
#[derive(Debug, Deserialize, Serialize)]
pub struct EntryDescriptor {
    pub compartment: String,
    pub module: String,
}

/// A compartment (package) in the archive.
#[derive(Debug, Deserialize, Serialize)]
pub struct CompartmentDescriptor {
    pub name: String,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub modules: HashMap<String, ModuleDescriptor>,
}

/// A module within a compartment.
///
/// This is a tagged union — exactly one of the variants applies:
/// - File module: has `parser` and `location`
/// - Compartment link: has `compartment` and `module`
/// - Exit module: has `exit`
/// - Deferred error: has `deferredError`
#[derive(Debug, Deserialize, Serialize)]
#[serde(untagged)]
pub enum ModuleDescriptor {
    File {
        parser: String,
        #[serde(default)]
        location: Option<String>,
        #[serde(default)]
        sha512: Option<String>,
    },
    Link {
        compartment: String,
        module: String,
    },
    Exit {
        exit: String,
    },
    DeferredError {
        #[serde(rename = "deferredError")]
        deferred_error: String,
    },
}

// ---------------------------------------------------------------------------
// Archive reader
// ---------------------------------------------------------------------------

/// A loaded archive ready to be installed into an XS machine.
pub struct LoadedArchive {
    /// The compartment map manifest.
    pub map: CompartmentMap,
    /// Module sources: (compartment_name, specifier) → source text.
    pub sources: HashMap<(String, String), String>,
}

/// Load an archive from a zip reader.
///
/// Reads `compartment-map.json` and all module source files,
/// returning a `LoadedArchive` that can be installed into an
/// XS machine.
pub fn load_archive<R: Read + Seek>(reader: R) -> io::Result<LoadedArchive> {
    let mut zip = zip::ZipArchive::new(reader)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;

    // Read compartment-map.json
    let map: CompartmentMap = {
        let mut file = zip
            .by_name("compartment-map.json")
            .map_err(|e| io::Error::new(io::ErrorKind::NotFound, e))?;
        let mut contents = String::new();
        file.read_to_string(&mut contents)?;
        serde_json::from_str(&contents)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?
    };

    // Read all file module sources
    let mut sources: HashMap<(String, String), String> = HashMap::new();

    for (compartment_name, compartment) in &map.compartments {
        for (specifier, descriptor) in &compartment.modules {
            if let ModuleDescriptor::File {
                parser, location, ..
            } = descriptor
            {
                // Only load source-text parsers (mjs, cjs, json)
                match parser.as_str() {
                    "mjs" | "cjs" | "json" => {}
                    // Skip pre-compiled formats — XS doesn't need them
                    _ => continue,
                }

                let file_location = match location {
                    Some(loc) => loc.clone(),
                    None => {
                        // If no location, use the specifier as the path
                        let s = specifier.strip_prefix("./").unwrap_or(specifier);
                        s.to_string()
                    }
                };

                let zip_path = format!("{}/{}", compartment_name, file_location);
                match zip.by_name(&zip_path) {
                    Ok(mut file) => {
                        let mut source = String::new();
                        file.read_to_string(&mut source)?;
                        sources.insert(
                            (compartment_name.clone(), specifier.clone()),
                            source,
                        );
                    }
                    Err(_) => {
                        // Module file missing from archive — will be a
                        // runtime error if actually imported
                    }
                }
            }
        }
    }

    Ok(LoadedArchive { map, sources })
}

/// Load an archive from base64-encoded zip data (endoZipBase64 format).
pub fn load_archive_base64(data: &str) -> io::Result<LoadedArchive> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
    let cursor = io::Cursor::new(bytes);
    load_archive(cursor)
}

// ---------------------------------------------------------------------------
// XS machine integration
// ---------------------------------------------------------------------------

/// Install a loaded archive into an XS machine.
///
/// Creates one XS Compartment per archive compartment, wires up
/// cross-compartment module links via `loadNowHook` and
/// `resolveHook`, and returns the entry module's namespace.
///
/// The generated JS code:
/// 1. Stores all module sources in a global registry object
/// 2. Creates a Compartment for each archive compartment
/// 3. Wires `loadNowHook` to look up sources from the registry
/// 4. Wires `resolveHook` to resolve cross-compartment links
/// 5. Calls `importNow` on the entry compartment/module
pub fn install_archive(machine: &crate::Machine, archive: &LoadedArchive) -> bool {
    // Step 1: Build the JS source registry and compartment link map
    let mut registry_js = String::from("var __archiveRegistry = {};\n");
    let mut links_js = String::from("var __archiveLinks = {};\n");

    for (compartment_name, compartment) in &archive.map.compartments {
        // Initialize per-compartment registry
        registry_js.push_str(&format!(
            "__archiveRegistry['{}'] = {{}};\n",
            escape_js_string(compartment_name)
        ));

        // Initialize per-compartment links
        links_js.push_str(&format!(
            "__archiveLinks['{}'] = {{}};\n",
            escape_js_string(compartment_name)
        ));

        for (specifier, descriptor) in &compartment.modules {
            match descriptor {
                ModuleDescriptor::File { .. } => {
                    // Register source text
                    if let Some(source) = archive
                        .sources
                        .get(&(compartment_name.clone(), specifier.clone()))
                    {
                        registry_js.push_str(&format!(
                            "__archiveRegistry['{}']['{}'] = {};\n",
                            escape_js_string(compartment_name),
                            escape_js_string(specifier),
                            json_encode_string(source),
                        ));
                    }
                }
                ModuleDescriptor::Link {
                    compartment: target_comp,
                    module: target_mod,
                } => {
                    // Register cross-compartment link
                    links_js.push_str(&format!(
                        "__archiveLinks['{}']['{}'] = {{ compartment: '{}', module: '{}' }};\n",
                        escape_js_string(compartment_name),
                        escape_js_string(specifier),
                        escape_js_string(target_comp),
                        escape_js_string(target_mod),
                    ));
                }
                _ => {}
            }
        }
    }

    // Step 2: Create compartments and wire them together
    let compartments_js = format!(
        r#"
var __archiveCompartments = {{}};

function __makeArchiveCompartment(compName) {{
    if (__archiveCompartments[compName]) return __archiveCompartments[compName];

    var sources = __archiveRegistry[compName] || {{}};
    var links = __archiveLinks[compName] || {{}};

    var endowments = globalThis.__archiveEndowments || {{}};
    var comp = new Compartment({{
        globals: endowments,
        resolveHook: function(specifier, referrer) {{
            return specifier;
        }},
        loadNowHook: function(specifier) {{
            // Check for cross-compartment link first
            var link = links[specifier];
            if (link) {{
                var foreignComp = __makeArchiveCompartment(link.compartment);
                return {{ namespace: foreignComp.importNow(link.module) }};
            }}
            // Look up source in this compartment's registry
            var src = sources[specifier];
            if (src === undefined) {{
                throw new Error('Module not found: ' + compName + '/' + specifier);
            }}
            return {{ source: new ModuleSource(src) }};
        }}
    }});
    __archiveCompartments[compName] = comp;
    return comp;
}}
"#
    );

    // Step 3: Import the entry module — split into multiple evals
    // to avoid XS SIGSEGV when Compartment creation + importNow
    // happen in the same eval call
    let make_entry_comp_js = format!(
        "var __entryComp = __makeArchiveCompartment('{}');",
        escape_js_string(&archive.map.entry.compartment),
    );
    let import_entry_js = format!(
        "var __entryNs = __entryComp.importNow('{}');",
        escape_js_string(&archive.map.entry.module),
    );

    // Execute in separate evals
    if machine.eval(&registry_js).is_none() {
        return false;
    }
    if machine.eval(&links_js).is_none() {
        return false;
    }
    if machine.eval(&compartments_js).is_none() {
        return false;
    }
    if machine.eval(&make_entry_comp_js).is_none() {
        return false;
    }
    machine.eval(&import_entry_js).is_some()
}

/// Escape a string for use inside JS single-quoted strings.
fn escape_js_string(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('\'', "\\'")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
}

/// JSON-encode a string value (with quotes).
fn json_encode_string(s: &str) -> String {
    serde_json::to_string(s).unwrap_or_else(|_| "\"\"".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    /// Create a test zip archive with the given compartment map and files.
    fn make_test_archive(
        map: &CompartmentMap,
        files: &[(&str, &str)],
    ) -> Vec<u8> {
        let mut buf = io::Cursor::new(Vec::new());
        {
            let mut zip = zip::ZipWriter::new(&mut buf);
            let options = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Stored);

            // Write compartment-map.json
            zip.start_file("compartment-map.json", options).unwrap();
            let map_json = serde_json::to_string_pretty(map).unwrap();
            zip.write_all(map_json.as_bytes()).unwrap();

            // Write module files
            for (path, content) in files {
                zip.start_file(path.to_string(), options).unwrap();
                zip.write_all(content.as_bytes()).unwrap();
            }

            zip.finish().unwrap();
        }
        buf.into_inner()
    }

    fn make_simple_map() -> CompartmentMap {
        let mut modules = HashMap::new();
        modules.insert(
            ".".to_string(),
            ModuleDescriptor::File {
                parser: "mjs".to_string(),
                location: Some("index.js".to_string()),
                sha512: None,
            },
        );

        let mut compartments = HashMap::new();
        compartments.insert(
            "app-v1.0.0".to_string(),
            CompartmentDescriptor {
                name: "app".to_string(),
                label: None,
                modules,
            },
        );

        CompartmentMap {
            entry: EntryDescriptor {
                compartment: "app-v1.0.0".to_string(),
                module: ".".to_string(),
            },
            compartments,
        }
    }

    #[test]
    fn load_simple_archive() {
        let map = make_simple_map();
        let zip_bytes = make_test_archive(
            &map,
            &[("app-v1.0.0/index.js", "export const x = 42;")],
        );

        let archive = load_archive(io::Cursor::new(zip_bytes)).unwrap();
        assert_eq!(archive.map.entry.compartment, "app-v1.0.0");
        assert_eq!(archive.map.entry.module, ".");

        let source = archive
            .sources
            .get(&("app-v1.0.0".to_string(), ".".to_string()))
            .unwrap();
        assert_eq!(source, "export const x = 42;");
    }

    #[test]
    fn load_archive_with_dependencies() {
        let mut app_modules = HashMap::new();
        app_modules.insert(
            ".".to_string(),
            ModuleDescriptor::File {
                parser: "mjs".to_string(),
                location: Some("index.js".to_string()),
                sha512: None,
            },
        );
        app_modules.insert(
            "utils".to_string(),
            ModuleDescriptor::Link {
                compartment: "utils-v2.0.0".to_string(),
                module: ".".to_string(),
            },
        );

        let mut utils_modules = HashMap::new();
        utils_modules.insert(
            ".".to_string(),
            ModuleDescriptor::File {
                parser: "mjs".to_string(),
                location: Some("index.js".to_string()),
                sha512: None,
            },
        );

        let mut compartments = HashMap::new();
        compartments.insert(
            "app-v1.0.0".to_string(),
            CompartmentDescriptor {
                name: "app".to_string(),
                label: None,
                modules: app_modules,
            },
        );
        compartments.insert(
            "utils-v2.0.0".to_string(),
            CompartmentDescriptor {
                name: "utils".to_string(),
                label: None,
                modules: utils_modules,
            },
        );

        let map = CompartmentMap {
            entry: EntryDescriptor {
                compartment: "app-v1.0.0".to_string(),
                module: ".".to_string(),
            },
            compartments,
        };

        let zip_bytes = make_test_archive(
            &map,
            &[
                (
                    "app-v1.0.0/index.js",
                    "import { double } from 'utils'; export default function(x) { return double(x); }",
                ),
                (
                    "utils-v2.0.0/index.js",
                    "export function double(x) { return x * 2; }",
                ),
            ],
        );

        let archive = load_archive(io::Cursor::new(zip_bytes)).unwrap();
        assert_eq!(archive.sources.len(), 2);
        assert!(archive
            .sources
            .contains_key(&("app-v1.0.0".to_string(), ".".to_string())));
        assert!(archive
            .sources
            .contains_key(&("utils-v2.0.0".to_string(), ".".to_string())));
    }

    #[test]
    fn load_base64_archive() {
        use base64::Engine;

        let map = make_simple_map();
        let zip_bytes = make_test_archive(
            &map,
            &[("app-v1.0.0/index.js", "export const greeting = 'hello';")],
        );

        let b64 = base64::engine::general_purpose::STANDARD.encode(&zip_bytes);
        let archive = load_archive_base64(&b64).unwrap();
        assert_eq!(archive.map.entry.compartment, "app-v1.0.0");

        let source = archive
            .sources
            .get(&("app-v1.0.0".to_string(), ".".to_string()))
            .unwrap();
        assert!(source.contains("greeting"));
    }
}
