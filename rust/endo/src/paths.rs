use std::env;
use std::path::PathBuf;

use crate::error::EndoError;

pub struct EndoPaths {
    pub state_path: PathBuf,
    pub ephemeral_path: PathBuf,
    pub sock_path: PathBuf,
    pub cache_path: PathBuf,
    pub log_path: PathBuf,
}

pub fn resolve_paths() -> Result<EndoPaths, EndoError> {
    // If ENDO_STATE_PATH is set, use environment variables for all paths.
    if let Ok(state) = env::var("ENDO_STATE_PATH") {
        let state_path = PathBuf::from(&state);
        let ephemeral_path = env::var("ENDO_EPHEMERAL_STATE_PATH")
            .map(PathBuf::from)
            .unwrap_or_else(|_| state_path.clone());
        let sock_path = env::var("ENDO_SOCK_PATH")
            .map(PathBuf::from)
            .unwrap_or_else(|_| ephemeral_path.join("captp0.sock"));
        let cache_path = env::var("ENDO_CACHE_PATH")
            .map(PathBuf::from)
            .unwrap_or_else(|_| state_path.join("cache"));
        let log_path = state_path.join("endo.log");
        return Ok(EndoPaths {
            state_path,
            ephemeral_path,
            sock_path,
            cache_path,
            log_path,
        });
    }

    // Platform-specific defaults.
    let home = env::var("HOME")
        .map_err(|_| EndoError::Config("HOME not set".to_string()))?;
    let username = env::var("USER")
        .or_else(|_| env::var("LOGNAME"))
        .unwrap_or_else(|_| "unknown".to_string());

    let state_path = if cfg!(target_os = "macos") {
        PathBuf::from(&home).join("Library/Application Support/Endo")
    } else {
        env::var("XDG_STATE_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from(&home).join(".local/state"))
            .join("endo")
    };

    let ephemeral_path = env::var("XDG_RUNTIME_DIR")
        .map(|d| PathBuf::from(d).join("endo"))
        .unwrap_or_else(|_| {
            PathBuf::from(env::temp_dir()).join(format!("endo-{username}"))
        });

    let sock_path = env::var("ENDO_SOCK")
        .map(PathBuf::from)
        .unwrap_or_else(|_| ephemeral_path.join("captp0.sock"));

    let cache_path = if cfg!(target_os = "macos") {
        PathBuf::from(&home).join("Library/Caches/Endo")
    } else {
        env::var("XDG_CACHE_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from(&home).join(".cache"))
            .join("endo")
    };

    let log_path = state_path.join("endo.log");

    Ok(EndoPaths {
        state_path,
        ephemeral_path,
        sock_path,
        cache_path,
        log_path,
    })
}
