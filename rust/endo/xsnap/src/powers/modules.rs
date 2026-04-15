//! Module loading host functions.
//!
//! Provides a Rust-side module registry that JavaScript compartments
//! can query via host functions. This backs the `loadNowHook` and
//! `resolveHook` used by XS native Compartments.
//!
//! JS calling convention:
//!   loadModuleSource(specifier) -> string (source text) or undefined
//!   resolveModule(specifier, referrer) -> string (resolved specifier)

use crate::ffi::*;
use crate::powers::HostPowers;
use crate::worker_io::{arg_str, set_result_string};

/// Helper: get HostPowers from the machine context.
unsafe fn get_powers(the: *mut XsMachine) -> &'static HostPowers {
    &*((*the).context as *const HostPowers)
}

/// `loadModuleSource(specifier) -> string | undefined`
///
/// Looks up the module source in the Rust-side module registry.
/// Returns the source text if found, or undefined if not.
pub unsafe extern "C" fn host_load_module_source(the: *mut XsMachine) {
    let powers = get_powers(the);
    let specifier = arg_str(the, 0);

    match powers.get_module(&specifier) {
        Some(source) => set_result_string(the, source),
        None => {
            // Leave xsResult as undefined (default)
        }
    }
}

/// `resolveModule(specifier, referrer) -> string`
///
/// Resolves a module specifier relative to a referrer.
/// For now, uses simple path resolution:
/// - Absolute specifiers (starting with `/` or a package name) pass through.
/// - Relative specifiers (`./` or `../`) are resolved against the referrer.
pub unsafe extern "C" fn host_resolve_module(the: *mut XsMachine) {
    let specifier = arg_str(the, 0);
    let referrer = arg_str(the, 1);

    let resolved = resolve_specifier(&specifier, &referrer);
    set_result_string(the, &resolved);
}

/// Simple module specifier resolution.
fn resolve_specifier(specifier: &str, referrer: &str) -> String {
    if specifier.starts_with("./") || specifier.starts_with("../") {
        // Relative import — resolve against referrer's directory
        let base = if let Some(pos) = referrer.rfind('/') {
            &referrer[..pos]
        } else {
            "."
        };
        normalize_path(&format!("{}/{}", base, specifier))
    } else {
        // Absolute or bare specifier — pass through
        specifier.to_string()
    }
}

/// Normalize a path by resolving `.` and `..` segments.
fn normalize_path(path: &str) -> String {
    let mut parts: Vec<&str> = Vec::new();
    for segment in path.split('/') {
        match segment {
            "." | "" => {}
            ".." => {
                parts.pop();
            }
            s => parts.push(s),
        }
    }
    parts.join("/")
}

/// Register module loading host functions on the machine.
pub unsafe fn register(machine: &crate::Machine) {
    machine.define_function("loadModuleSource", host_load_module_source, 1);
    machine.define_function("resolveModule", host_resolve_module, 2);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_absolute_specifier() {
        assert_eq!(resolve_specifier("@endo/far", "anything"), "@endo/far");
        assert_eq!(resolve_specifier("foo/bar", "baz"), "foo/bar");
    }

    #[test]
    fn resolve_relative_specifier() {
        assert_eq!(
            resolve_specifier("./utils", "lib/main"),
            "lib/utils"
        );
        assert_eq!(
            resolve_specifier("../shared", "lib/sub/main"),
            "lib/shared"
        );
    }

    #[test]
    fn normalize() {
        assert_eq!(normalize_path("a/b/../c"), "a/c");
        assert_eq!(normalize_path("a/./b/c"), "a/b/c");
        assert_eq!(normalize_path("./a/b"), "a/b");
    }
}
