//! Process-related host functions.
//!
//! JS calling convention:
//!   getPid() -> number
//!   getEnv(name) -> string | undefined
//!   joinPath(...parts) -> string
//!   realPath(dirToken, path) -> string

use crate::ffi::*;
use crate::powers::HostPowers;
use std::ffi::CStr;

/// Helper: read a string argument from the XS stack frame.
unsafe fn arg_str(the: *mut XsMachine, index: usize) -> &'static str {
    let slot = (*the).frame.sub(2 + index);
    let ptr = fxToString(the, slot);
    CStr::from_ptr(ptr).to_str().unwrap_or("")
}

/// Helper: set xsResult to a string.
unsafe fn set_result_string(the: *mut XsMachine, s: &str) {
    let c_str = std::ffi::CString::new(s).unwrap();
    fxString(the, &mut (*the).scratch, c_str.as_ptr());
    *(*the).frame.add(1) = (*the).scratch;
}

/// `getPid() -> number`
///
/// Returns the current process ID.
pub unsafe extern "C" fn host_get_pid(the: *mut XsMachine) {
    let pid = std::process::id();
    fxInteger(the, &mut (*the).scratch, pid as i32);
    *(*the).frame.add(1) = (*the).scratch;
}

/// `getEnv(name) -> string | undefined`
///
/// Reads an environment variable. Returns undefined if not set.
pub unsafe extern "C" fn host_get_env(the: *mut XsMachine) {
    let name = arg_str(the, 0);
    match std::env::var(name) {
        Ok(value) => set_result_string(the, &value),
        Err(_) => {
            // Return undefined (xsResult is already undefined by default).
        }
    }
}

/// `joinPath(...parts) -> string`
///
/// Joins path components. Accepts 1-8 string arguments.
/// Uses the argc from the XS frame to determine how many parts.
pub unsafe extern "C" fn host_join_path(the: *mut XsMachine) {
    // XS stores argc at frame[-1] (the slot before the return value)
    let argc_slot = (*the).frame.sub(1);
    let argc = fxToInteger(the, argc_slot) as usize;
    let count = argc.min(8);
    // Collect all parts, then split on path separator to handle
    // ".." and "." components (matching Node.js path.join behavior).
    let mut parts: Vec<String> = Vec::new();
    for i in 0..count {
        let part = arg_str(the, i);
        parts.push(part.to_string());
    }
    let joined = parts.join("/");
    // Normalize: resolve "." and ".." components.
    let mut components: Vec<&str> = Vec::new();
    let is_absolute = joined.starts_with('/');
    for component in joined.split('/') {
        match component {
            "" | "." => {}
            ".." => {
                if !components.is_empty() && *components.last().unwrap() != ".." {
                    components.pop();
                } else if !is_absolute {
                    components.push("..");
                }
            }
            other => components.push(other),
        }
    }
    let normalized = if is_absolute {
        format!("/{}", components.join("/"))
    } else if components.is_empty() {
        ".".to_string()
    } else {
        components.join("/")
    };
    set_result_string(the, &normalized);
}

/// `realPath(dirToken, path) -> string`
///
/// Resolves a path to its canonical form (resolving symlinks).
///
/// For the `"root"` token we use ambient `std::fs::canonicalize`
/// because cap-std refuses to follow symlinks whose targets are
/// absolute paths. The daemon's root token is intentionally an
/// ambient-authority handle (it maps to `/`), and the daemon itself
/// enforces any higher-level confinement (`isConfinedPath` in
/// `mount.js`). For other tokens we stay within cap-std's
/// capability-bounded `canonicalize`.
pub unsafe extern "C" fn host_real_path(the: *mut XsMachine) {
    let powers = &*((*the).context as *const HostPowers);
    let dir_token = arg_str(the, 0);
    let path = arg_str(the, 1);

    if dir_token == "root" {
        // The root token maps to "/"; daemon code passes a path that
        // is already relative to "/" (leading slash stripped). Turn
        // it back into an absolute path and resolve ambiently.
        let abs = if path.starts_with('/') {
            std::path::PathBuf::from(path)
        } else {
            std::path::PathBuf::from("/").join(path)
        };
        match std::fs::canonicalize(&abs) {
            Ok(canonical) => set_result_string(the, &canonical.to_string_lossy()),
            Err(e) => set_result_string(the, &format!("Error: {}", e)),
        }
        return;
    }

    match powers.get_dir(dir_token) {
        Some(dir) => match dir.canonicalize(path) {
            Ok(canonical) => set_result_string(the, &canonical.to_string_lossy()),
            Err(e) => set_result_string(the, &format!("Error: {}", e)),
        },
        None => set_result_string(
            the,
            &format!("Error: unknown directory token '{}'", dir_token),
        ),
    }
}

/// Register all process host functions on the machine.
pub unsafe fn register(machine: &crate::Machine) {
    machine.define_function("getPid", host_get_pid, 0);
    machine.define_function("getEnv", host_get_env, 1);
    machine.define_function("joinPath", host_join_path, 8);
    machine.define_function("realPath", host_real_path, 2);
}
