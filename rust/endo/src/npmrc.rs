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
//!    "nerf-dart" credential lines, matched by scheme-less URL
//!    prefix: `//host/path/:_authToken = xxx` (bearer token),
//!    `//host/path/:username = u` + `//host/path/:_password = b64`
//!    (basic auth; the password is base64-encoded, as npm stores
//!    it), and the legacy `//host/path/:_auth = b64(user:pass)`.
//!    The top-level `_auth` / `username` / `_password` keys bind the
//!    same way to the default registry only, mirroring npm.
//!
//! Sources layer in npm's precedence order — later sources override
//! earlier ones: user `~/.npmrc`, then project `.npmrc`, then the
//! `NPM_CONFIG_REGISTRY` environment variable. Parsing is
//! deliberately a subset of npm's ini dialect: comments (`#`, `;`),
//! `key = value` lines, and the key shapes above. Unrecognised
//! keys are ignored rather than fatal, so a real-world `.npmrc`
//! full of npm-CLI settings parses cleanly. `${VAR}` references in
//! consumed values expand from the environment as in npm, with one
//! deliberate deviation: where npm aborts on an unset variable, this
//! parser skips just that line (leaving earlier layers' value in
//! place), so a CI-only `.npmrc` line degrades instead of wedging
//! offline runs.

use std::collections::BTreeMap;
use std::path::Path;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;

use crate::fetch::DEFAULT_REGISTRY;

/// The credential fields configured for one nerf-dart prefix (or at
/// the top level, where they bind to the default registry). Within
/// one entry the resolution order is npm's: `_authToken` outranks
/// `username`+`_password`, which outrank the legacy `_auth`.
#[derive(Debug, Clone, Default)]
struct Credential {
    token: Option<String>,
    username: Option<String>,
    /// Base64-encoded password, exactly as npm stores `_password`.
    password_base64: Option<String>,
    /// Pre-encoded `base64(username:password)`, npm's legacy `_auth`.
    auth_base64: Option<String>,
}

impl Credential {
    fn is_empty(&self) -> bool {
        self.token.is_none()
            && self.username.is_none()
            && self.password_base64.is_none()
            && self.auth_base64.is_none()
    }

    /// The full `Authorization` header value this entry yields, if
    /// its fields complete one: `Bearer <token>`, else
    /// `Basic base64(username:password)`, else `Basic <_auth>`. A
    /// `_password` that does not decode as base64 UTF-8 disqualifies
    /// the pair (falling through to `_auth`) rather than sending a
    /// garbled credential.
    fn header_value(&self) -> Option<String> {
        if let Some(token) = &self.token {
            return Some(format!("Bearer {token}"));
        }
        if let (Some(username), Some(password_base64)) =
            (&self.username, &self.password_base64)
        {
            if let Ok(bytes) = BASE64.decode(password_base64) {
                if let Ok(password) = String::from_utf8(bytes) {
                    let pair = format!("{username}:{password}");
                    return Some(format!("Basic {}", BASE64.encode(pair)));
                }
            }
        }
        self.auth_base64
            .as_ref()
            .map(|auth| format!("Basic {auth}"))
    }
}

/// Registry-selection and credential configuration for npm fetches.
#[derive(Debug, Clone)]
pub struct NpmConfig {
    default_registry: String,
    /// `@scope` (including the `@`, no trailing slash) → registry URL.
    scoped_registries: BTreeMap<String, String>,
    /// Nerf-dart prefix (`//host/path`, no scheme, no trailing
    /// slash) → that prefix's credential fields.
    credentials: BTreeMap<String, Credential>,
    /// Top-level `_auth` / `username` / `_password`, honoured only
    /// for the default registry (npm's rule for un-nerfed keys).
    default_credential: Credential,
}

impl NpmConfig {
    /// Configuration with the built-in default registry and no
    /// credentials.
    pub fn new() -> Self {
        NpmConfig {
            default_registry: DEFAULT_REGISTRY.to_string(),
            scoped_registries: BTreeMap::new(),
            credentials: BTreeMap::new(),
            default_credential: Credential::default(),
        }
    }

    /// Configuration pinned to one registry URL (the pre-Phase-5
    /// constructor shape used throughout the resolver).
    pub fn with_registry(url: &str) -> Self {
        let mut config = NpmConfig::new();
        config.default_registry = url.to_string();
        config
    }

    /// Layer one `.npmrc` document over this configuration, reading
    /// `${VAR}` references from the process environment.
    /// Keys in `text` override values from earlier sources; keys the
    /// document does not mention are left alone.
    pub fn apply_npmrc(&mut self, text: &str) {
        self.apply_npmrc_with_env(text, &|name| std::env::var(name).ok());
    }

    /// [`apply_npmrc`](NpmConfig::apply_npmrc) with an explicit
    /// environment, so tests need not mutate the process environment
    /// (which would race the parallel test runner).
    pub fn apply_npmrc_with_env(
        &mut self,
        text: &str,
        env: &dyn Fn(&str) -> Option<String>,
    ) {
        for raw_line in text.lines() {
            let line = raw_line.trim();
            if line.is_empty() || line.starts_with('#') || line.starts_with(';') {
                continue;
            }
            let Some((raw_key, raw_value)) = line.split_once('=') else {
                continue;
            };
            let key = raw_key.trim();
            // A `${VAR}` referencing an unset variable skips the
            // line, leaving any earlier layer's value in place.
            let Some(value) = expand_env(unquote(raw_value.trim()), env) else {
                continue;
            };
            if value.is_empty() {
                continue;
            }
            if key == "registry" {
                self.default_registry = value;
            } else if key == "_auth" {
                self.default_credential.auth_base64 = Some(value);
            } else if key == "username" {
                self.default_credential.username = Some(value);
            } else if key == "_password" {
                self.default_credential.password_base64 = Some(value);
            } else if let Some(scope) = key.strip_suffix(":registry") {
                if scope.starts_with('@') && !scope.contains('/') {
                    self.scoped_registries.insert(scope.to_string(), value);
                }
            } else if let Some((prefix, field)) = key.rsplit_once(':') {
                if prefix.starts_with("//") {
                    let dart = prefix.trim_end_matches('/').to_string();
                    let entry = self.credentials.entry(dart).or_default();
                    match field {
                        "_authToken" => entry.token = Some(value),
                        "username" => entry.username = Some(value),
                        "_password" => entry.password_base64 = Some(value),
                        "_auth" => entry.auth_base64 = Some(value),
                        // Other nerf-darted keys (`:always-auth`,
                        // `:certfile`, …) are npm-CLI configuration
                        // this module does not consume.
                        _ => {}
                    }
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

    /// The credential entry for `url`, if any: the longest
    /// configured nerf-dart prefix that matches the URL's
    /// scheme-less form on a path-component boundary.
    fn credential_for(&self, url: &str) -> Option<&Credential> {
        let schemeless = format!("//{}", strip_scheme(url));
        let target = schemeless.trim_end_matches('/');
        self.credentials
            .iter()
            .filter(|(prefix, credential)| {
                !credential.is_empty()
                    && (target == prefix.as_str()
                        || target.starts_with(&format!("{prefix}/")))
            })
            .max_by_key(|(prefix, _)| prefix.len())
            .map(|(_, credential)| credential)
    }

    /// The bearer token accompanying a request to `url`, if any
    /// (nerf-dart `_authToken` lines only; basic-auth entries answer
    /// through [`auth_for`](NpmConfig::auth_for)).
    pub fn token_for(&self, url: &str) -> Option<&str> {
        self.credential_for(url)
            .and_then(|credential| credential.token.as_deref())
    }

    /// The full `Authorization` header value accompanying a request
    /// to `url`, if any: the matching nerf-dart entry's
    /// `Bearer <token>` / `Basic <b64>` per npm's field order, else —
    /// for URLs under the default registry only — the top-level
    /// `_auth` / `username` / `_password` credential.
    pub fn auth_for(&self, url: &str) -> Option<String> {
        if let Some(credential) = self.credential_for(url) {
            if let Some(header) = credential.header_value() {
                return Some(header);
            }
        }
        if url_is_under(url, &self.default_registry) {
            return self.default_credential.header_value();
        }
        None
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

/// Whether `url` sits at or under `base` in their scheme-less forms,
/// on a path-component boundary (the same matching rule as
/// nerf-darts, so `https://host.evil.example` is not under
/// `https://host`).
fn url_is_under(url: &str, base: &str) -> bool {
    let url = strip_scheme(url).trim_end_matches('/');
    let base = strip_scheme(base).trim_end_matches('/');
    !base.is_empty()
        && (url == base || url.starts_with(&format!("{base}/")))
}

/// Expand `${VAR}` references in `value` as npm does, reading each
/// variable through `env`. Returns `None` when any referenced
/// variable is unset (the caller skips the line — the resilient
/// counterpart of npm's hard error). A `$` not followed by `{`, or
/// an unterminated `${`, passes through literally.
fn expand_env(
    value: &str,
    env: &dyn Fn(&str) -> Option<String>,
) -> Option<String> {
    if !value.contains("${") {
        return Some(value.to_string());
    }
    let mut expanded = String::with_capacity(value.len());
    let mut rest = value;
    while let Some(start) = rest.find("${") {
        expanded.push_str(&rest[..start]);
        let after = &rest[start + 2..];
        let Some(end) = after.find('}') else {
            // Unterminated `${…`: keep it literally.
            expanded.push_str(&rest[start..]);
            return Some(expanded);
        };
        expanded.push_str(&env(&after[..end])?);
        rest = &after[end + 1..];
    }
    expanded.push_str(rest);
    Some(expanded)
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
    fn basic_auth_from_username_and_base64_password() {
        let mut config = NpmConfig::new();
        // "s3cret" base64-encoded, as npm stores `_password`.
        config.apply_npmrc(
            "//npm.acme.example/:username=alice\n\
             //npm.acme.example/:_password=czNjcmV0\n",
        );
        // base64("alice:s3cret")
        assert_eq!(
            config.auth_for("https://npm.acme.example/@acme/widgets"),
            Some("Basic YWxpY2U6czNjcmV0".to_string())
        );
        // No token configured: token_for stays empty.
        assert!(config
            .token_for("https://npm.acme.example/@acme/widgets")
            .is_none());
        // Unrelated hosts get no credential.
        assert!(config.auth_for("https://registry.npmjs.org/x").is_none());
    }

    #[test]
    fn legacy_auth_and_field_precedence() {
        let mut config = NpmConfig::new();
        config.apply_npmrc("//legacy.example/:_auth=dXNlcjpwdw==\n");
        assert_eq!(
            config.auth_for("https://legacy.example/pkg"),
            Some("Basic dXNlcjpwdw==".to_string())
        );

        // Within one nerf-dart, a token outranks basic-auth fields.
        let mut config = NpmConfig::new();
        config.apply_npmrc(
            "//both.example/:_authToken=tok\n\
             //both.example/:username=alice\n\
             //both.example/:_password=czNjcmV0\n\
             //both.example/:_auth=dXNlcjpwdw==\n",
        );
        assert_eq!(
            config.auth_for("https://both.example/pkg"),
            Some("Bearer tok".to_string())
        );

        // username+password outrank `_auth`; an undecodable
        // `_password` falls through to `_auth` instead of sending a
        // garbled pair.
        let mut config = NpmConfig::new();
        config.apply_npmrc(
            "//pair.example/:username=alice\n\
             //pair.example/:_password=%%not-base64%%\n\
             //pair.example/:_auth=dXNlcjpwdw==\n",
        );
        assert_eq!(
            config.auth_for("https://pair.example/pkg"),
            Some("Basic dXNlcjpwdw==".to_string())
        );
    }

    #[test]
    fn top_level_basic_auth_binds_to_default_registry_only() {
        let mut config = NpmConfig::new();
        config.apply_npmrc(
            "registry=https://corp.example/npm/\n\
             username=alice\n\
             _password=czNjcmV0\n\
             @acme:registry=https://npm.acme.example/\n",
        );
        assert_eq!(
            config.auth_for("https://corp.example/npm/lodash"),
            Some("Basic YWxpY2U6czNjcmV0".to_string())
        );
        // The scoped registry is NOT the default registry: un-nerfed
        // credentials must not leak to it.
        assert!(config
            .auth_for("https://npm.acme.example/@acme/widgets")
            .is_none());
        // Nor to lookalike hosts.
        assert!(config
            .auth_for("https://corp.example.evil.example/npm/x")
            .is_none());

        // A nerf-darted entry on the default registry outranks the
        // top-level credential.
        config.apply_npmrc("//corp.example/npm/:_authToken=tok\n");
        assert_eq!(
            config.auth_for("https://corp.example/npm/lodash"),
            Some("Bearer tok".to_string())
        );

        // Top-level `_auth` alone also completes a header.
        let mut config = NpmConfig::new();
        config.apply_npmrc("_auth=dXNlcjpwdw==\n");
        assert_eq!(
            config.auth_for(DEFAULT_REGISTRY),
            Some("Basic dXNlcjpwdw==".to_string())
        );
    }

    #[test]
    fn env_references_expand_and_unset_variables_skip_the_line() {
        let env = |name: &str| match name {
            "NPM_TOKEN" => Some("tok-from-env".to_string()),
            "REG_HOST" => Some("reg.example".to_string()),
            _ => None,
        };
        let mut config = NpmConfig::new();
        // Expansion applies to values (npm's rule); keys are literal.
        config.apply_npmrc_with_env(
            "registry=https://${REG_HOST}/\n\
             //reg.example/:_authToken=\"${NPM_TOKEN}\"\n\
             //unset.example/:_authToken=${MISSING_VAR}\n",
            &env,
        );
        assert_eq!(config.default_registry(), "https://reg.example/");
        assert_eq!(
            config.auth_for("https://reg.example/pkg"),
            Some("Bearer tok-from-env".to_string())
        );
        // The unset-variable line was skipped entirely.
        assert!(config.auth_for("https://unset.example/pkg").is_none());

        // A skipped line leaves an earlier layer's value in place.
        let mut config = NpmConfig::new();
        config.apply_npmrc_with_env("registry=https://kept.example/\n", &env);
        config.apply_npmrc_with_env("registry=https://${MISSING_VAR}/\n", &env);
        assert_eq!(config.default_registry(), "https://kept.example/");

        // `$` without `{` and an unterminated `${` pass through
        // literally.
        assert_eq!(
            expand_env("a$b", &env),
            Some("a$b".to_string())
        );
        assert_eq!(
            expand_env("x${REG_HOST", &env),
            Some("x${REG_HOST".to_string())
        );
        assert_eq!(
            expand_env("${REG_HOST}/${NPM_TOKEN}", &env),
            Some("reg.example/tok-from-env".to_string())
        );
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
