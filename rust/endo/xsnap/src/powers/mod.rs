//! Host powers backed by cap-std.
//!
//! Provides filesystem, cryptographic, network, and module loading
//! capabilities to JavaScript running in the XS engine. These are
//! registered as host functions on the XS machine and accessed
//! through the machine's context pointer.

pub mod crypto;
pub mod debug;
pub mod fs;
pub mod modules;
pub mod process;
pub mod sqlite;

use cap_std::fs::Dir;
use std::collections::HashMap;

/// Host powers for an XS worker.
///
/// Holds capability-bounded handles for filesystem, crypto, and
/// module operations. Stored in the XS machine's context pointer
/// so host functions can access it.
pub struct HostPowers {
    /// Named directory handles (e.g., "state", "ephemeral", "cache").
    /// Each Dir is scoped — cap-std rejects path traversal.
    pub dirs: HashMap<String, Dir>,
    /// Module source registry: specifier → source text.
    /// Populated at setup time; queried by the importHook.
    pub module_sources: HashMap<String, String>,
}

impl HostPowers {
    /// Create empty host powers (no directories, no modules).
    pub fn new() -> Self {
        HostPowers {
            dirs: HashMap::new(),
            module_sources: HashMap::new(),
        }
    }

    /// Add a directory handle with the given token name.
    pub fn add_dir(&mut self, token: &str, dir: Dir) {
        self.dirs.insert(token.to_string(), dir);
    }

    /// Get a directory handle by token name.
    pub fn get_dir(&self, token: &str) -> Option<&Dir> {
        self.dirs.get(token)
    }

    /// Register a module source by specifier.
    pub fn add_module(&mut self, specifier: &str, source: &str) {
        self.module_sources
            .insert(specifier.to_string(), source.to_string());
    }

    /// Get a module source by specifier.
    pub fn get_module(&self, specifier: &str) -> Option<&str> {
        self.module_sources.get(specifier).map(|s| s.as_str())
    }
}
