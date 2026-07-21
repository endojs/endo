//! npm client configuration: registry selection, `.npmrc` parsing,
//! scoped registries, and auth tokens.
//!
//! This is the configuration half of Phase 5 of
//! `designs/endor-npm-registry-proxy.md`. It answers two questions
//! for the fetch layer ([`crate::fetch`]) and the resolver
//! ([`crate::npm_resolve`]):
//!
//! 1. **Which registry serves this package?** The default registry
//!    (`registry = ...`, or `NPM_CONFIG_REGISTRY`), overridden per
//!    scope by `@scope:registry = ...` lines.
//! 2. **Which credential accompanies this request?** npm's
//!    "nerf-dart" token lines, `//host/path/:_authToken = xxx`,
//!    matched by scheme-less URL prefix.
//!
//! Sources layer in npm's precedence order — later sources override
//! earlier ones: user `~/.npmrc`, then project `.npmrc`, then the
//! `NPM_CONFIG_REGISTRY` environment variable. Parsing is
//! deliberately a subset of npm's ini dialect: comments (`#`, `;`),
//! `key = value` lines, and the three key shapes above. Unrecognised
//! keys are ignored rather than fatal, so a real-world `.npmrc`
//! full of npm-CLI settings parses cleanly. `${VAR}` value expansion
//! is not performed (a known gap, listed in the design).

use std::collections::BTreeMap;
use std::path::Path;

use crate::fetch::DEFAULT_REGISTRY;

/// Registry-selection and credential configuration for npm fetches.
#[derive(Debug, Clone)]
pub struct NpmConfig {
    default_registry: String,
    /// `@scope` (including the `@`, no trailing slash) → registry URL.
    scoped_registries: BTreeMap<String, String>,
    /// Nerf-dart prefix (`//host/path`, no scheme, no trailing
    /// slash) → token.
    auth_tokens: BTreeMap<String, String>,
}

impl NpmConfig {
    /// Configuration with the built-in default registry and no
    /// credentials.
    pub fn new() -> Self {
        NpmConfig {
            default_registry: DEFAULT_REGISTRY.to_string(),
            scoped_registries: BTreeMap::new(),
            auth_tokens: BTreeMap::new(),
        }
    }

    /// Configuration pinned to one registry URL (the pre-Phase-5
    /// constructor shape used throughout the resolver).
    pub fn with_registry(url: &str) -> Self {
        let mut config = NpmConfig::new();
        config.default_registry = url.to_string();
        config
    }

    /// Layer one `.npmrc` document over this configuration.
    /// Keys in `text` override values from earlier sources; keys the
    /// document does not mention are left alone.
    pub fn apply_npmrc(&mut self, text: &str) {
        for raw_line in text.lines() {
            let line = raw_line.trim();
            if line.is_empty() || line.starts_with('#') || line.starts_with(';') {
                continue;
            }
            let Some((raw_key, raw_value)) = line.split_once('=') else {
                continue;
            };
            let key = raw_key.trim();
            let value = unquote(raw_value.trim());
            if value.is_empty() {
                continue;
            }
            if key == "registry" {
                self.default_registry = value.to_string();
            } else if let Some(scope) = key.strip_suffix(":registry") {
                if scope.starts_with('@') && !scope.contains('/') {
                    self.scoped_registries
                        .insert(scope.to_string(), value.to_string());
                }
            } else if let Some(prefix) = key.strip_suffix(":_authToken") {
                if prefix.starts_with("//") {
                    self.auth_tokens.insert(
                        prefix.trim_end_matches('/').to_string(),
                        value.to_string(),
                    );
                }
            }
            // Every other key is npm-CLI configuration this module
            // does not consume.
        }
    }

    /// Build a configuration from explicit sources, layering in
    /// npm's precedence order: `user_npmrc`, then `project_npmrc`,
    /// then `env_registry` (`NPM_CONFIG_REGISTRY`). Any source may
    /// be absent.
    pub fn from_sources(
        env_registry: Option<&str>,
        project_npmrc: Option<&str>,
        user_npmrc: Option<&str>,
    ) -> Self {
        let mut config = NpmConfig::new();
        if let Some(text) = user_npmrc {
            config.apply_npmrc(text);
        }
        if let Some(text) = project_npmrc {
            config.apply_npmrc(text);
        }
        if let Some(url) = env_registry {
            let url = url.trim();
            if !url.is_empty() {
                config.default_registry = url.to_string();
            }
        }
        config
    }

    /// Build a configuration from the process environment:
    /// `{home_dir}/.npmrc`, then `{project_dir}/.npmrc`, then the
    /// `NPM_CONFIG_REGISTRY` environment variable. Missing files are
    /// simply skipped; unreadable ones are treated as missing (a
    /// broken `.npmrc` should degrade to defaults, not wedge the
    /// resolver).
    pub fn load(project_dir: Option<&Path>, home_dir: Option<&Path>) -> Self {
        let read = |dir: Option<&Path>| {
            dir.map(|d| d.join(".npmrc"))
                .and_then(|p| std::fs::read_to_string(p).ok())
        };
        let env_registry = std::env::var("NPM_CONFIG_REGISTRY").ok();
        NpmConfig::from_sources(
            env_registry.as_deref(),
            read(project_dir).as_deref(),
            read(home_dir).as_deref(),
        )
    }

    /// The registry serving `package_name`: the scope's registry for
    /// a scoped name (`@scope/pkg`) when one is configured, the
    /// default registry otherwise.
    pub fn registry_for(&self, package_name: &str) -> &str {
        if package_name.starts_with('@') {
            if let Some((scope, _)) = package_name.split_once('/') {
                if let Some(url) = self.scoped_registries.get(scope) {
                    return url;
                }
            }
        }
        &self.default_registry
    }

    /// The default registry URL (unscoped packages).
    pub fn default_registry(&self) -> &str {
        &self.default_registry
    }

    /// Override the default registry (the `--registry` CLI flag,
    /// which outranks every `.npmrc` and environment source).
    pub fn set_default_registry(&mut self, url: &str) -> &mut Self {
        self.default_registry = url.to_string();
        self
    }

    /// The auth token accompanying a request to `url`, if any: the
    /// longest configured nerf-dart prefix that matches the URL's
    /// scheme-less form on a path-component boundary.
    pub fn token_for(&self, url: &str) -> Option<&str> {
        let schemeless = format!("//{}", strip_scheme(url));
        let target = schemeless.trim_end_matches('/');
        self.auth_tokens
            .iter()
            .filter(|(prefix, _)| {
                target == prefix.as_str()
                    || target.starts_with(&format!("{prefix}/"))
            })
            .max_by_key(|(prefix, _)| prefix.len())
            .map(|(_, token)| token.as_str())
    }

}

impl Default for NpmConfig {
    fn default() -> Self {
        NpmConfig::new()
    }
}

/// Strip a `scheme://` prefix, leaving `host/path`.
fn strip_scheme(url: &str) -> &str {
    url.split_once("://").map_or(url, |(_, rest)| rest)
}

/// Strip one layer of matching single or double quotes, as npm's
/// ini parser does for values like `_authToken="xxx"`.
fn unquote(value: &str) -> &str {
    let bytes = value.as_bytes();
    if bytes.len() >= 2
        && (bytes[0] == b'"' || bytes[0] == b'\'')
        && bytes[bytes.len() - 1] == bytes[0]
    {
        &value[1..value.len() - 1]
    } else {
        value
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_to_public_registry() {
        let config = NpmConfig::new();
        assert_eq!(config.default_registry(), DEFAULT_REGISTRY);
        assert_eq!(config.registry_for("left-pad"), DEFAULT_REGISTRY);
        assert!(config.token_for("https://registry.npmjs.org/x").is_none());
    }

    #[test]
    fn parses_registry_scoped_registry_and_token() {
        let mut config = NpmConfig::new();
        config.apply_npmrc(
            "# corporate mirror\n\
             registry = https://mirror.example.com/npm/\n\
             ; team scope goes to the private registry\n\
             @acme:registry=https://npm.acme.example/\n\
             //npm.acme.example/:_authToken = s3cret\n\
             fund=false\n",
        );
        assert_eq!(
            config.default_registry(),
            "https://mirror.example.com/npm/"
        );
        assert_eq!(config.registry_for("lodash"), "https://mirror.example.com/npm/");
        assert_eq!(
            config.registry_for("@acme/widgets"),
            "https://npm.acme.example/"
        );
        // A scoped name whose scope has no override falls back to
        // the default registry.
        assert_eq!(
            config.registry_for("@other/thing"),
            "https://mirror.example.com/npm/"
        );
        assert_eq!(
            config.token_for("https://npm.acme.example/@acme/widgets"),
            Some("s3cret")
        );
        assert!(config
            .token_for("https://mirror.example.com/npm/lodash")
            .is_none());
    }

    #[test]
    fn unquotes_values_and_skips_malformed_lines() {
        let mut config = NpmConfig::new();
        config.apply_npmrc(
            "//registry.npmjs.org/:_authToken=\"quoted-token\"\n\
             this line has no equals sign\n\
             registry=\n\
             @bad/scope:registry=https://ignored.example/\n",
        );
        assert_eq!(
            config.token_for("https://registry.npmjs.org/left-pad"),
            Some("quoted-token")
        );
        // Empty value and malformed lines leave prior state alone.
        assert_eq!(config.default_registry(), DEFAULT_REGISTRY);
        // A scope key containing `/` is not a scope; ignored.
        assert_eq!(config.registry_for("@bad/scope"), DEFAULT_REGISTRY);
    }

    #[test]
    fn sources_layer_in_precedence_order() {
        let user = "registry=https://user.example/\n\
                    //user.example/:_authToken=user-token\n";
        let project = "registry=https://project.example/\n";

        // Project overrides user.
        let config = NpmConfig::from_sources(None, Some(project), Some(user));
        assert_eq!(config.default_registry(), "https://project.example/");
        // The user token survives: layering merges, not replaces.
        assert_eq!(
            config.token_for("https://user.example/pkg"),
            Some("user-token")
        );

        // Environment overrides both.
        let config =
            NpmConfig::from_sources(Some("https://env.example/"), Some(project), Some(user));
        assert_eq!(config.default_registry(), "https://env.example/");

        // A blank environment value does not clobber.
        let config = NpmConfig::from_sources(Some("  "), Some(project), None);
        assert_eq!(config.default_registry(), "https://project.example/");
    }

    #[test]
    fn token_matching_respects_path_boundaries_and_prefers_longest() {
        let mut config = NpmConfig::new();
        config.apply_npmrc(
            "//registry.example.com/:_authToken=broad\n\
             //registry.example.com/private/:_authToken=narrow\n",
        );
        // Longest matching nerf-dart wins.
        assert_eq!(
            config.token_for("https://registry.example.com/private/pkg"),
            Some("narrow")
        );
        assert_eq!(
            config.token_for("https://registry.example.com/pkg"),
            Some("broad")
        );
        // Host match is on a path boundary, not a string prefix:
        // registry.example.com.evil.example must not match.
        assert!(config
            .token_for("https://registry.example.com.evil.example/pkg")
            .is_none());
        // Exact host with no path also matches.
        assert_eq!(
            config.token_for("https://registry.example.com/"),
            Some("broad")
        );
    }

    #[test]
    fn load_reads_files_and_skips_missing_ones() {
        let project = tempfile::tempdir().unwrap();
        let home = tempfile::tempdir().unwrap();
        std::fs::write(
            home.path().join(".npmrc"),
            "registry=https://home.example/\n//home.example/:_authToken=tok\n",
        )
        .unwrap();
        std::fs::write(
            project.path().join(".npmrc"),
            "registry=https://proj.example/\n",
        )
        .unwrap();

        let config = NpmConfig::from_sources(
            None,
            std::fs::read_to_string(project.path().join(".npmrc"))
                .ok()
                .as_deref(),
            std::fs::read_to_string(home.path().join(".npmrc"))
                .ok()
                .as_deref(),
        );
        assert_eq!(config.default_registry(), "https://proj.example/");
        assert_eq!(config.token_for("https://home.example/x"), Some("tok"));

        // `load` itself: point both dirs at an empty tempdir; the
        // absent files are skipped and defaults survive. (The
        // NPM_CONFIG_REGISTRY branch is covered via `from_sources`;
        // mutating the process environment in a test would race the
        // parallel test runner.)
        let empty = tempfile::tempdir().unwrap();
        if std::env::var("NPM_CONFIG_REGISTRY").is_err() {
            let config = NpmConfig::load(Some(empty.path()), Some(empty.path()));
            assert_eq!(config.default_registry(), DEFAULT_REGISTRY);
        }
    }

    #[test]
    fn cli_registry_override_outranks_all_sources() {
        let mut config = NpmConfig::from_sources(
            Some("https://env.example/"),
            Some("registry=https://project.example/\n"),
            None,
        );
        config.set_default_registry("https://flag.example/");
        assert_eq!(config.default_registry(), "https://flag.example/");
        assert_eq!(config.registry_for("left-pad"), "https://flag.example/");
    }
}
