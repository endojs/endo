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
    /// Raw CommonJS sources: (compartment_name, specifier) → the
    /// unwrapped CJS text. A module present here has an ESM facade in
    /// `sources` (`export default __loadCjs(...)`) and is evaluated
    /// by the runtime's CommonJS loader, which supplies a working
    /// `require`. Empty for zip archives, whose CJS modules were
    /// already linked by the compartment mapper.
    pub cjs_sources: HashMap<(String, String), String>,
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

    Ok(LoadedArchive {
        map,
        sources,
        cjs_sources: HashMap::new(),
    })
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

/// Node-semantics `package.json` `"exports"` resolution, evaluated
/// into the machine as plain declarations (no user code runs here).
///
/// Supports subpath keys (`"."`, `"./sub"`), single-`*` wildcard
/// patterns (longest-prefix, then longest-suffix specificity),
/// nested condition objects walked in object key order, array
/// fallback chains, and `null` blocks. When a package has an
/// `exports` field, unlisted subpaths are encapsulated (a clean
/// error, not a file fallback); without one, subpaths fall back to
/// Node-style file lookup (`.js` / `/index.js` completion) and `"."`
/// falls back to `"main"` / `index.js`.
///
/// The package manifest is read back as the raw `./package.json`
/// source registered by [`crate::execute`] (kept unwrapped for this
/// reason); source-existence checks go through `__lookupSource`,
/// defined here since this runtime resolves entries at import time
/// rather than pre-binding them in Rust.
///
/// Condition handling deviates from Node in one deliberate way:
/// every load in this runtime — ESM import and wrapped-cjs
/// `require` alike — bottoms out in `importNow`, so resolution runs
/// an `import`-conditions pass first (named imports from a dual
/// package must see its ESM build) and retries with `require`
/// conditions only when the first pass finds nothing, rather than
/// activating both conditions in one pass and letting object order
/// pick a build the consumer cannot use.
const EXPORTS_RESOLVER_JS: &str = r#"
// Return the canonical registry key for a specifier in a
// compartment, applying Node's .js / /index.js completion, or
// undefined when no candidate exists.
function __lookupSource(compName, spec) {
    var reg = __archiveRegistry[compName] || {};
    var candidates = [spec, spec + '.js', spec + '/index.js'];
    for (var i = 0; i < candidates.length; i++) {
        if (Object.prototype.hasOwnProperty.call(reg, candidates[i])) {
            return candidates[i];
        }
    }
    return undefined;
}

// Resolve a relative specifier ('./x', '../x') against its
// referrer module's directory, returning the './'-rooted full
// specifier the load hooks key on. Bare specifiers pass through
// untouched (the load hooks route them through the link map), as
// does any call without a string referrer (a full-specifier
// import has no referrer to be relative to). Climbing above the
// package root is a clean error: archive compartments hold one
// package tree, so there is nothing above '.' to name.
function __resolveRelative(specifier, referrer) {
    if (specifier.charCodeAt(0) !== 46 /* '.' */) return specifier;
    if (typeof referrer !== 'string' || referrer === '') return specifier;
    var stack = referrer.split('/');
    stack.pop();
    if (stack.length === 0) stack = ['.'];
    var segments = specifier.split('/');
    for (var i = 0; i < segments.length; i++) {
        var segment = segments[i];
        if (segment === '' || segment === '.') continue;
        if (segment === '..') {
            if (stack.length <= 1) {
                throw new Error(
                    "Cannot resolve '" + specifier + "' from '" + referrer +
                    "': escapes the package root");
            }
            stack.pop();
            continue;
        }
        stack.push(segment);
    }
    return stack.length === 1 ? '.' : stack.join('/');
}

var __archiveManifests = {};

// Parsed package.json for a compartment, memoised; null when absent
// or unparseable.
function __packageManifest(compName) {
    if (Object.prototype.hasOwnProperty.call(__archiveManifests, compName)) {
        return __archiveManifests[compName];
    }
    var sources = __archiveRegistry[compName] || {};
    var text = sources['./package.json'];
    var doc = null;
    if (text !== undefined) {
        try { doc = JSON.parse(text); } catch (e) { doc = null; }
    }
    __archiveManifests[compName] = doc;
    return doc;
}

// Split a bare specifier into its package name and subpath rest,
// honouring @scope/name. Returns undefined when there is no rest
// (a plain package name is handled by the exact link key).
function __parsePackageName(spec) {
    var parts = spec.split('/');
    var nameLen = spec.charCodeAt(0) === 64 /* '@' */ ? 2 : 1;
    if (parts.length <= nameLen) return undefined;
    var name = parts.slice(0, nameLen).join('/');
    var rest = parts.slice(nameLen).join('/');
    if (name === '' || rest === '') return undefined;
    return { name: name, rest: rest };
}

// Resolve one exports target value: a string (with '*' substituted),
// an array fallback chain, or a condition object walked in key
// order. Returns a target string, null (explicitly blocked), or
// undefined (no match under these conditions).
function __resolveExportTarget(target, starText, conds) {
    if (target === null) return null;
    if (typeof target === 'string') {
        return target.indexOf('*') === -1
            ? target
            : target.split('*').join(starText);
    }
    if (Array.isArray(target)) {
        for (var i = 0; i < target.length; i++) {
            var r = __resolveExportTarget(target[i], starText, conds);
            if (r !== undefined && r !== null) return r;
        }
        return undefined;
    }
    if (typeof target === 'object') {
        for (var key in target) {
            if (key === 'default' || conds.indexOf(key) !== -1) {
                var r2 = __resolveExportTarget(target[key], starText, conds);
                if (r2 !== undefined) return r2;
            }
        }
    }
    return undefined;
}

// Match a subpath ('.', './sub') against an exports value under one
// condition set. A bare string/array exports, or an object whose
// first key does not start with '.', is sugar for { '.': exports }.
function __matchExports(exp, subpath, conds) {
    var subpathMap = exp;
    if (typeof exp === 'string' || Array.isArray(exp)) {
        subpathMap = { '.': exp };
    } else {
        for (var first in exp) {
            if (first.charCodeAt(0) !== 46 /* '.' */) subpathMap = { '.': exp };
            break;
        }
    }
    if (Object.prototype.hasOwnProperty.call(subpathMap, subpath)) {
        return __resolveExportTarget(subpathMap[subpath], '', conds);
    }
    var best; var bestStar; var bestPrefix = -1; var bestSuffix = -1;
    for (var key in subpathMap) {
        var star = key.indexOf('*');
        if (star === -1 || key.indexOf('*', star + 1) !== -1) continue;
        var prefix = key.slice(0, star);
        var suffix = key.slice(star + 1);
        if (subpath.length < prefix.length + suffix.length) continue;
        if (subpath.slice(0, prefix.length) !== prefix) continue;
        if (suffix !== '' && subpath.slice(-suffix.length) !== suffix) continue;
        if (prefix.length > bestPrefix
            || (prefix.length === bestPrefix && suffix.length > bestSuffix)) {
            bestPrefix = prefix.length;
            bestSuffix = suffix.length;
            bestStar = subpath.slice(prefix.length, subpath.length - suffix.length);
            best = subpathMap[key];
        }
    }
    if (best !== undefined) return __resolveExportTarget(best, bestStar, conds);
    return undefined;
}

// Resolve a package subpath to a canonical source key in that
// package's compartment, or throw a clean, named error. The
// optional condsOrder names the condition passes to try in turn;
// ESM imports default to import-then-require, the CommonJS
// loader's `require` passes require-then-import so a dual package
// hands its CJS build to a CJS consumer.
function __resolveExports(compName, subpath, condsOrder) {
    var manifest = __packageManifest(compName);
    var exp = manifest ? manifest.exports : undefined;
    if (exp === undefined || exp === null) {
        var base = subpath;
        if (subpath === '.') {
            var main = manifest && typeof manifest.main === 'string'
                ? manifest.main : 'index.js';
            base = './' + main.replace(/^\.\//, '');
        }
        var canon = __lookupSource(compName, base);
        if (canon === undefined) {
            throw new Error('Module not found: ' + compName + '/' + base);
        }
        return canon;
    }
    var order = condsOrder || ['import', 'require'];
    var target;
    for (var oi = 0; oi < order.length && target === undefined; oi++) {
        target = __matchExports(exp, subpath, [order[oi]]);
    }
    if (target === undefined || target === null) {
        throw new Error(
            "Package subpath '" + subpath +
            "' is not defined by exports of " + compName);
    }
    var canon2 = __lookupSource(compName, target);
    if (canon2 === undefined) {
        throw new Error('Module not found: ' + compName + '/' + target);
    }
    return canon2;
}
"#;

/// The runtime CommonJS loader: Node-style module cache with
/// cycle-safe partial exports, per-module `require` (relative
/// specifiers against the requiring module's directory, bare and
/// subpath specifiers through the link map and the exports resolver
/// with `require`-conditions-first), `require.resolve`, `__filename`
/// / `__dirname`, and function-wrapper evaluation through
/// `Compartment.prototype.evaluate` — which also restores sloppy-mode
/// semantics the old strict ESM shim silently denied CJS sources.
///
/// A module with a raw source in `__archiveCjsSources` is registered
/// in the ESM registry as a one-line facade
/// (`export default __loadCjs(...)`), so ESM importers see Node's
/// require(esm)-era interop shape: the CJS `module.exports` as the
/// default export. Requiring an ESM module returns its namespace
/// (`.json` its default), matching modern Node `require(esm)`; a
/// required ESM graph using top-level await fails at `importNow`
/// with the engine's async-module error, as it does in Node.
const CJS_RUNTIME_JS: &str = r#"
var __cjsModuleCache = Object.create(null);

function __cjsDirname(key) {
    var i = key.lastIndexOf('/');
    return i <= 0 ? '.' : key.slice(0, i);
}

// Node's require completion set: exact, then .js/.json, then
// directory index completions.
function __lookupRequire(compName, spec) {
    var reg = __archiveRegistry[compName] || {};
    var candidates = [
        spec, spec + '.js', spec + '.json',
        spec + '/index.js', spec + '/index.json'
    ];
    for (var i = 0; i < candidates.length; i++) {
        if (Object.prototype.hasOwnProperty.call(reg, candidates[i])) {
            return candidates[i];
        }
    }
    return undefined;
}

// Resolve a require specifier from a CJS module to its target
// { compartment, key }, or throw the clean Node-shaped error.
function __resolveRequire(compName, referrer, spec) {
    if (typeof spec !== 'string' || spec === '') {
        throw new Error(
            'require: specifier must be a non-empty string, required from '
            + compName + '/' + referrer);
    }
    if (spec.charCodeAt(0) === 46 /* '.' */) {
        var full = __resolveRelative(spec, referrer);
        var canon = __lookupRequire(compName, full);
        if (canon === undefined) {
            throw new Error(
                "Cannot find module '" + spec + "' required from "
                + compName + '/' + referrer);
        }
        return { compartment: compName, key: canon };
    }
    var links = __archiveLinks[compName] || {};
    var link = Object.prototype.hasOwnProperty.call(links, spec)
        ? links[spec] : undefined;
    if (link) {
        var mod = link.module;
        if (mod === '.') {
            var fsources = __archiveRegistry[link.compartment] || {};
            mod = fsources['.'] !== undefined
                ? '.'
                : __resolveExports(link.compartment, '.', ['require', 'import']);
        }
        return { compartment: link.compartment, key: mod };
    }
    var parsed = __parsePackageName(spec);
    if (parsed !== undefined) {
        var plink = Object.prototype.hasOwnProperty.call(links, parsed.name)
            ? links[parsed.name] : undefined;
        if (plink) {
            return {
                compartment: plink.compartment,
                key: __resolveExports(
                    plink.compartment, './' + parsed.rest, ['require', 'import'])
            };
        }
    }
    throw new Error(
        "Cannot find module '" + spec + "' required from "
        + compName + '/' + referrer);
}

// Load a resolved module for require: CJS through the CJS loader,
// JSON as its parsed value, ESM as its namespace object.
function __loadModule(compName, key) {
    var cjs = __archiveCjsSources[compName];
    if (cjs && Object.prototype.hasOwnProperty.call(cjs, key)) {
        return __loadCjs(compName, key);
    }
    var comp = __makeArchiveCompartment(compName);
    var ns = comp.importNow(key);
    if (key.slice(-5) === '.json') return ns.default;
    return ns;
}

function __makeRequire(compName, referrerKey) {
    var require = function require(spec) {
        var t = __resolveRequire(compName, referrerKey, spec);
        return __loadModule(t.compartment, t.key);
    };
    require.resolve = function resolve(spec) {
        return __resolveRequire(compName, referrerKey, spec).key;
    };
    return require;
}

function __loadCjs(compName, key) {
    var cache = __cjsModuleCache[compName]
        || (__cjsModuleCache[compName] = Object.create(null));
    if (Object.prototype.hasOwnProperty.call(cache, key)) {
        return cache[key].exports;
    }
    var sources = __archiveCjsSources[compName] || {};
    if (!Object.prototype.hasOwnProperty.call(sources, key)) {
        throw new Error(
            "Cannot find module '" + key + "' required from " + compName);
    }
    var module = { exports: {} };
    // Pre-register before evaluation so a require cycle observes the
    // partial exports, as in Node.
    cache[key] = module;
    var src = sources[key];
    var comp = __makeArchiveCompartment(compName);
    try {
        var fn = comp.evaluate(
            '(function (module, exports, require, __filename, __dirname) {'
            + src + '\n})');
        // Node invokes the CJS wrapper with `this === module.exports`;
        // a plain call would leave `this` bound to the (sloppy-mode)
        // compartment global, so a module doing `this.foo = ...` would
        // silently mis-export and pollute the shared global.
        fn.call(module.exports, module, module.exports,
           __makeRequire(compName, key), key, __cjsDirname(key));
    } catch (e) {
        // Node deletes the cache entry when evaluation throws, so a
        // later require retries rather than seeing half a module.
        delete cache[key];
        throw e;
    }
    return module.exports;
}
"#;

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
    if !install_archive_prelude(machine, archive) {
        return false;
    }
    let import_entry_js = format!(
        "var __entryNs = __entryComp.importNow('{}');",
        escape_js_string(&archive.map.entry.module),
    );
    crate::eval_wrapped(machine, &import_entry_js, "endor[archive]/entry-import")
}

/// Shared installation steps: build the source registry and link map,
/// declare the compartment factory and exports resolver, and create
/// the entry compartment. Everything up to — but not including — the
/// entry module import, which differs between the sync
/// ([`install_archive`]) and async ([`install_archive_async`]) paths.
fn install_archive_prelude(machine: &crate::Machine, archive: &LoadedArchive) -> bool {
    // Step 1: Build the JS source registry and compartment link map
    let mut registry_js = String::from("var __archiveRegistry = {};\n");
    let mut links_js = String::from("var __archiveLinks = {};\n");
    let mut cjs_js = String::from("var __archiveCjsSources = {};\n");

    for (compartment_name, compartment) in &archive.map.compartments {
        // Initialize per-compartment registry
        registry_js.push_str(&format!(
            "__archiveRegistry['{}'] = {{}};\n",
            escape_js_string(compartment_name)
        ));

        // Initialize per-compartment raw CJS sources
        cjs_js.push_str(&format!(
            "__archiveCjsSources['{}'] = {{}};\n",
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

    for ((compartment_name, specifier), raw) in &archive.cjs_sources {
        cjs_js.push_str(&format!(
            "__archiveCjsSources['{}']['{}'] = {};\n",
            escape_js_string(compartment_name),
            escape_js_string(specifier),
            json_encode_string(raw),
        ));
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
    // Translate a cross-compartment link's target specifier. A '.'
    // link module loads the target's literal '.' source when the
    // archive registers one (the zip-archive convention, where the
    // mapper already resolved entries); otherwise it defers to the
    // target package's exports map ('main' / index.js when it has
    // none).
    var linkTarget = function(link) {{
        var mod = link.module;
        if (mod === '.') {{
            var fsources = __archiveRegistry[link.compartment] || {{}};
            mod = fsources['.'] !== undefined
                ? '.'
                : __resolveExports(link.compartment, '.');
        }}
        return mod;
    }};
    var comp = new Compartment({{
        globals: endowments,
        resolveHook: function(specifier, referrer) {{
            return __resolveRelative(specifier, referrer);
        }},
        loadNowHook: function(specifier) {{
            // Check for cross-compartment link first.
            var link = links[specifier];
            if (link) {{
                var foreignComp = __makeArchiveCompartment(link.compartment);
                return {{ namespace: foreignComp.importNow(linkTarget(link)) }};
            }}
            // A bare specifier with a subpath ('pkg/sub',
            // '@scope/pkg/sub') follows the package's link, then
            // resolves the subpath through its exports map.
            if (specifier.charCodeAt(0) !== 46 /* '.' */) {{
                var parsed = __parsePackageName(specifier);
                if (parsed !== undefined) {{
                    var plink = links[parsed.name];
                    if (plink) {{
                        var pcomp = __makeArchiveCompartment(plink.compartment);
                        var pmod = __resolveExports(plink.compartment, './' + parsed.rest);
                        return {{ namespace: pcomp.importNow(pmod) }};
                    }}
                }}
            }}
            // Look up source in this compartment's registry, applying
            // Node's .js / /index.js completion.
            var key = __lookupSource(compName, specifier);
            if (key === undefined) {{
                throw new Error('Module not found: ' + compName + '/' + specifier);
            }}
            return {{ source: new ModuleSource(sources[key]) }};
        }},
        loadHook: function(specifier) {{
            // Async twin of loadNowHook, used by the async entry
            // import so a module graph may use top-level await.
            // Cross-compartment edges return the lazy descriptor
            // naming the target specifier and compartment, so the
            // engine drives the foreign module's (possibly async)
            // evaluation itself; an eager foreignComp.import()
            // awaited here would deadlock the loader.
            var link = links[specifier];
            if (link) {{
                return {{
                    namespace: linkTarget(link),
                    compartment: __makeArchiveCompartment(link.compartment)
                }};
            }}
            if (specifier.charCodeAt(0) !== 46 /* '.' */) {{
                var parsed = __parsePackageName(specifier);
                if (parsed !== undefined) {{
                    var plink = links[parsed.name];
                    if (plink) {{
                        return {{
                            namespace: __resolveExports(plink.compartment, './' + parsed.rest),
                            compartment: __makeArchiveCompartment(plink.compartment)
                        }};
                    }}
                }}
            }}
            var key = __lookupSource(compName, specifier);
            if (key === undefined) {{
                throw new Error('Module not found: ' + compName + '/' + specifier);
            }}
            return {{ source: new ModuleSource(sources[key]) }};
        }}
    }});
    // The CJS facade modules (`export default __loadCjs(...)`) call
    // back into the shared CommonJS loader through their
    // compartment's global. The exposed callback IGNORES the
    // caller-supplied compartment name and always resolves in THIS
    // compartment, so guest module code cannot pass an arbitrary
    // compartment name and force-load a module outside its link map.
    // (The facade already passes its own compartment; the argument is
    // accepted only for call-shape compatibility.)
    comp.globalThis.__loadCjs = function (_callerComp, key) {{
        return __loadCjs(compName, key);
    }};
    __archiveCompartments[compName] = comp;
    return comp;
}}
"#
    );

    // Step 3: Create the entry compartment — split into multiple
    // evals to avoid XS SIGSEGV when Compartment creation + import
    // happen in the same eval call
    let make_entry_comp_js = format!(
        "var __entryComp = __makeArchiveCompartment('{}');",
        escape_js_string(&archive.map.entry.compartment),
    );

    // Execute in separate evals. The first four are generated
    // declarations that run no user code and must stay unwrapped: a
    // `function` declaration inside a try block does not hoist to
    // the global scope. The last (and the entry import that the
    // caller runs next) run arbitrary user code, so they go through
    // the inline try/catch wrapper — a throw that unwinds out of an
    // eval into the host frame crashes XS, and a ReferenceError in
    // the program being run must surface as a clean failure, not a
    // SIGSEGV.
    if machine.eval(&registry_js).is_none() {
        return false;
    }
    if machine.eval(&links_js).is_none() {
        return false;
    }
    if machine.eval(&cjs_js).is_none() {
        return false;
    }
    if machine.eval(&compartments_js).is_none() {
        return false;
    }
    if machine.eval(EXPORTS_RESOLVER_JS).is_none() {
        return false;
    }
    if machine.eval(CJS_RUNTIME_JS).is_none() {
        return false;
    }
    crate::eval_wrapped(machine, &make_entry_comp_js, "endor[archive]/entry-compartment")
}

/// Install a loaded archive like [`install_archive`], but import the
/// entry module through the asynchronous `Compartment.prototype.import`
/// path so the module graph may use top-level `await`.
///
/// The synchronous `importNow` path fails on any async module with
/// `TypeError: async module`; this variant kicks off the async import
/// and records its settlement in the machine globals `__entryDone` /
/// `__entryErr` / `__entryNs`. The caller must drain the job queue
/// (`Machine::quiesce`) and then consult [`entry_import_result`] to
/// learn whether the entry module resolved or rejected — a `true`
/// return here only means the import was successfully started.
pub fn install_archive_async(machine: &crate::Machine, archive: &LoadedArchive) -> bool {
    if !install_archive_prelude(machine, archive) {
        return false;
    }
    let import_entry_js = format!(
        "var __entryNs = undefined; var __entryErr = undefined; var __entryDone = false; \
         __entryComp.import('{}').then( \
             function (ns) {{ __entryNs = ns; __entryDone = true; }}, \
             function (e) {{ \
                 __entryErr = e === undefined ? new Error('rejected with undefined') : e; \
                 __entryDone = true; \
             }});",
        escape_js_string(&archive.map.entry.module),
    );
    crate::eval_wrapped(machine, &import_entry_js, "endor[archive]/entry-import")
}

/// Report how the async entry import kicked off by
/// [`install_archive_async`] settled, after the caller has drained
/// the machine's job queue.
///
/// Prints the rejection's message and stack to stderr (mirroring
/// `eval_wrapped`'s clean error surface) before returning an error.
pub fn entry_import_result(machine: &crate::Machine) -> Result<(), crate::XsnapError> {
    let check = "__entryErr !== undefined \
         ? 'ERROR: ' + (__entryErr && __entryErr.message ? __entryErr.message : String(__entryErr)) \
           + '\\nSTACK: ' + (__entryErr && __entryErr.stack ? __entryErr.stack : '') \
         : (__entryDone ? 'ok' : 'pending')";
    match machine.eval(check) {
        Some(crate::JsValue::String(ref s)) if s == "ok" => Ok(()),
        Some(crate::JsValue::String(ref s)) if s == "pending" => Err(crate::XsnapError::Archive(
            "entry module import did not settle (async work still pending)".to_string(),
        )),
        Some(crate::JsValue::String(s)) => {
            eprintln!("endor[archive]/entry-import: entry module rejected:");
            for line in s.lines() {
                eprintln!("  {line}");
            }
            Err(crate::XsnapError::Archive(
                "entry module evaluation failed".to_string(),
            ))
        }
        _ => Err(crate::XsnapError::Archive(
            "entry import settlement check failed".to_string(),
        )),
    }
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
