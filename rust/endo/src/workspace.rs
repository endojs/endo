//! Workspace discovery for the npm-via-CAS registry proxy
//! (`designs/endor-npm-registry-proxy.md`, the "workspace-protocol
//! resolution" known gap).
//!
//! A workspace is a monorepo whose root `package.json` declares
//! member packages under a `workspaces` field (an array of glob
//! patterns, or npm's `{ "packages": [...] }` object form). Members
//! are local, typically unpublished packages; a dependency edge from
//! one member to another must resolve to the sibling's working tree,
//! never the registry — both for `workspace:` protocol ranges
//! (`workspace:*`, `workspace:^`, `workspace:~`,
//! `workspace:1.2.3`), which no registry can serve, and for plain
//! semver ranges the sibling's local version satisfies, matching
//! npm's own linking behaviour.
//!
//! This module is the discovery half: walk up from a package root to
//! the nearest ancestor whose `package.json` declares `workspaces`,
//! expand the member patterns, and index the members by name. The
//! resolution half — ingesting member trees into the CAS and folding
//! their dependencies into the transitive graph — lives in
//! [`crate::assemble`], which consults the discovered workspace
//! while classifying each dependency edge as local or registry.
//!
//! Deliberate scope limits: patterns support literal segments, `*`
//! wildcards within a segment, and a whole-segment `**` recursive
//! descent; negation patterns (`!pkg`) and the `?`/`[`/`{` glob
//! forms are rejected rather than silently misread. A matched
//! directory without a `package.json`, or whose manifest lacks a
//! `name`, is skipped (it is not an addressable package). Members
//! without a `version` default to `0.0.0`, as Yarn does for
//! versionless workspaces.

use std::collections::BTreeMap;
use std::fmt;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

/// Directory names never descended into during pattern expansion.
const EXCLUDED_DIRS: &[&str] = &["node_modules", ".git"];

/// One workspace member: a local package directory addressable by
/// its manifest `name`.
#[derive(Debug, Clone)]
pub struct WorkspaceMember {
    pub name: String,
    pub version: String,
    /// Canonicalized member directory.
    pub dir: PathBuf,
}

/// A discovered workspace: the root directory that declared
/// `workspaces`, and its members indexed by package name.
#[derive(Debug)]
pub struct Workspace {
    /// Canonicalized workspace root (the `workspaces`-declaring
    /// `package.json`'s directory).
    pub root: PathBuf,
    members: BTreeMap<String, WorkspaceMember>,
}

impl Workspace {
    pub fn member(&self, name: &str) -> Option<&WorkspaceMember> {
        self.members.get(name)
    }

    pub fn members(&self) -> impl Iterator<Item = &WorkspaceMember> {
        self.members.values()
    }

    pub fn len(&self) -> usize {
        self.members.len()
    }

    pub fn is_empty(&self) -> bool {
        self.members.is_empty()
    }
}

/// Errors from workspace discovery.
#[derive(Debug)]
pub enum WorkspaceError {
    /// Filesystem I/O failed.
    Io(io::Error),
    /// A `package.json` on the ancestor walk or in a member did not
    /// parse, or its `workspaces` field has an unexpected shape.
    BadManifest(String),
    /// A `workspaces` pattern uses an unsupported glob form.
    BadPattern(String),
    /// Two member directories claim the same package name; a
    /// by-name workspace edge would be ambiguous.
    DuplicateMember { name: String, dirs: [PathBuf; 2] },
}

impl fmt::Display for WorkspaceError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            WorkspaceError::Io(e) => write!(f, "workspace I/O: {e}"),
            WorkspaceError::BadManifest(msg) => write!(f, "bad workspace manifest: {msg}"),
            WorkspaceError::BadPattern(pattern) => {
                write!(f, "unsupported workspaces pattern: {pattern:?}")
            }
            WorkspaceError::DuplicateMember { name, dirs } => write!(
                f,
                "duplicate workspace member {name:?} in {} and {}",
                dirs[0].display(),
                dirs[1].display()
            ),
        }
    }
}

impl std::error::Error for WorkspaceError {}

impl From<io::Error> for WorkspaceError {
    fn from(e: io::Error) -> Self {
        WorkspaceError::Io(e)
    }
}

/// The `workspaces` patterns out of a parsed root manifest: either
/// an array of strings or npm's `{ "packages": [...] }` object.
/// `None` when the manifest declares no workspaces.
fn workspace_patterns(doc: &serde_json::Value) -> Result<Option<Vec<String>>, WorkspaceError> {
    let field = match doc.get("workspaces") {
        Some(field) => field,
        None => return Ok(None),
    };
    let list = match field {
        serde_json::Value::Array(list) => list,
        serde_json::Value::Object(obj) => match obj.get("packages") {
            Some(serde_json::Value::Array(list)) => list,
            Some(_) => {
                return Err(WorkspaceError::BadManifest(
                    "\"workspaces\".\"packages\" is not an array".to_string(),
                ))
            }
            None => return Ok(Some(Vec::new())),
        },
        _ => {
            return Err(WorkspaceError::BadManifest(
                "\"workspaces\" is neither an array nor an object".to_string(),
            ))
        }
    };
    let mut patterns = Vec::with_capacity(list.len());
    for entry in list {
        let s = entry.as_str().ok_or_else(|| {
            WorkspaceError::BadManifest("\"workspaces\" entry is not a string".to_string())
        })?;
        patterns.push(s.to_string());
    }
    Ok(Some(patterns))
}

/// Match one path segment against one pattern segment supporting
/// `*` wildcards (any run of characters within the segment).
fn segment_matches(pattern: &str, name: &str) -> bool {
    // Greedy backtracking wildcard match over bytes; package
    // directory names are effectively ASCII and `*` boundaries fall
    // on literal bytes, so byte-wise matching is exact.
    let p = pattern.as_bytes();
    let n = name.as_bytes();
    let (mut pi, mut ni) = (0, 0);
    let mut star: Option<(usize, usize)> = None;
    while ni < n.len() {
        if pi < p.len() && (p[pi] == n[ni]) {
            pi += 1;
            ni += 1;
        } else if pi < p.len() && p[pi] == b'*' {
            star = Some((pi, ni));
            pi += 1;
        } else if let Some((star_pi, star_ni)) = star {
            pi = star_pi + 1;
            ni = star_ni + 1;
            star = Some((star_pi, star_ni + 1));
        } else {
            return false;
        }
    }
    while pi < p.len() && p[pi] == b'*' {
        pi += 1;
    }
    pi == p.len()
}

/// Expand one pattern's remaining segments under `dir`, appending
/// matched directories to `out`.
fn expand_segments(
    dir: &Path,
    segments: &[&str],
    out: &mut Vec<PathBuf>,
) -> Result<(), WorkspaceError> {
    let (first, rest) = match segments.split_first() {
        Some(split) => split,
        None => {
            out.push(dir.to_path_buf());
            return Ok(());
        }
    };
    if *first == "**" {
        // Zero directories...
        expand_segments(dir, rest, out)?;
        // ...or descend one level and recurse with `**` retained.
        for child in read_child_dirs(dir)? {
            expand_segments(&child, segments, out)?;
        }
        return Ok(());
    }
    if first.contains('*') {
        for child in read_child_dirs(dir)? {
            let name = match child.file_name().and_then(|n| n.to_str()) {
                Some(name) => name,
                None => continue,
            };
            if segment_matches(first, name) {
                expand_segments(&child, rest, out)?;
            }
        }
        return Ok(());
    }
    let child = dir.join(first);
    if child.is_dir() {
        expand_segments(&child, rest, out)?;
    }
    Ok(())
}

/// Child directories of `dir`, sorted by name, minus the excluded
/// set (a workspace member never lives under `node_modules`).
fn read_child_dirs(dir: &Path) -> Result<Vec<PathBuf>, WorkspaceError> {
    let mut children = Vec::new();
    let mut entries: Vec<_> = fs::read_dir(dir)?.collect::<Result<_, _>>()?;
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if EXCLUDED_DIRS.contains(&name.as_ref()) {
            continue;
        }
        // Symlinked directories are skipped, as in tree ingestion: a
        // member is content in place, not a filesystem alias.
        if entry.file_type()?.is_dir() {
            children.push(entry.path());
        }
    }
    Ok(children)
}

/// Validate a pattern against the supported subset before expansion.
fn check_pattern(pattern: &str) -> Result<(), WorkspaceError> {
    if pattern.starts_with('!')
        || pattern.contains('?')
        || pattern.contains('[')
        || pattern.contains('{')
    {
        return Err(WorkspaceError::BadPattern(pattern.to_string()));
    }
    for segment in pattern.split('/') {
        // `**` is only supported as a whole segment (as in glob).
        if segment.contains("**") && segment != "**" {
            return Err(WorkspaceError::BadPattern(pattern.to_string()));
        }
    }
    Ok(())
}

/// Enumerate the workspace members declared by `root`'s patterns:
/// matched directories holding a `package.json` with a `name`,
/// indexed by that name.
fn enumerate_members(
    root: &Path,
    patterns: &[String],
) -> Result<BTreeMap<String, WorkspaceMember>, WorkspaceError> {
    let mut dirs = Vec::new();
    for pattern in patterns {
        check_pattern(pattern)?;
        let trimmed = pattern.trim_matches('/');
        if trimmed.is_empty() {
            continue;
        }
        let segments: Vec<&str> = trimmed.split('/').filter(|s| !s.is_empty()).collect();
        expand_segments(root, &segments, &mut dirs)?;
    }
    dirs.sort();
    dirs.dedup();

    let mut members = BTreeMap::new();
    for dir in dirs {
        let manifest_path = dir.join("package.json");
        if !manifest_path.is_file() {
            continue;
        }
        let text = fs::read_to_string(&manifest_path)?;
        let doc: serde_json::Value = serde_json::from_str(&text).map_err(|e| {
            WorkspaceError::BadManifest(format!("parse {}: {e}", manifest_path.display()))
        })?;
        let name = match doc.get("name").and_then(|v| v.as_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };
        let version = doc
            .get("version")
            .and_then(|v| v.as_str())
            .unwrap_or("0.0.0")
            .to_string();
        let dir = dir.canonicalize()?;
        if let Some(previous) = members.insert(
            name.clone(),
            WorkspaceMember {
                name: name.clone(),
                version,
                dir: dir.clone(),
            },
        ) {
            return Err(WorkspaceError::DuplicateMember {
                name,
                dirs: [previous.dir, dir],
            });
        }
    }
    Ok(members)
}

/// Discover the workspace enclosing `package_root`, if any: walk up
/// from `package_root` (inclusive) to the nearest ancestor whose
/// `package.json` declares `workspaces`, expand its member patterns,
/// and return the workspace when `package_root` is the workspace
/// root itself or one of its members. A `workspaces`-declaring
/// ancestor that does not list `package_root` as a member does not
/// apply to it (matching npm, which only treats a directory as part
/// of a workspace it belongs to), and the walk stops there.
pub fn find_workspace(package_root: &Path) -> Result<Option<Workspace>, WorkspaceError> {
    let package_root = package_root.canonicalize()?;
    let mut dir = package_root.as_path();
    loop {
        let manifest_path = dir.join("package.json");
        if manifest_path.is_file() {
            let text = fs::read_to_string(&manifest_path)?;
            let doc: serde_json::Value = serde_json::from_str(&text).map_err(|e| {
                WorkspaceError::BadManifest(format!("parse {}: {e}", manifest_path.display()))
            })?;
            if let Some(patterns) = workspace_patterns(&doc)? {
                let root = dir.canonicalize()?;
                let members = enumerate_members(&root, &patterns)?;
                let applies =
                    package_root == root || members.values().any(|m| m.dir == package_root);
                return Ok(if applies {
                    Some(Workspace { root, members })
                } else {
                    None
                });
            }
        }
        match dir.parent() {
            Some(parent) => dir = parent,
            None => return Ok(None),
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn write_member(root: &Path, rel: &str, name: &str, version: &str) {
        let dir = root.join(rel);
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join("package.json"),
            format!(r#"{{"name":"{name}","version":"{version}"}}"#),
        )
        .unwrap();
    }

    fn write_root(root: &Path, workspaces_json: &str) {
        fs::write(
            root.join("package.json"),
            format!(r#"{{"name":"mono","workspaces":{workspaces_json}}}"#),
        )
        .unwrap();
    }

    #[test]
    fn segment_wildcards_match() {
        assert!(segment_matches("*", "anything"));
        assert!(segment_matches("pkg-*", "pkg-a"));
        assert!(segment_matches("*-suffix", "long-suffix"));
        assert!(segment_matches("a*b*c", "aXbYc"));
        assert!(!segment_matches("pkg-*", "other"));
        assert!(!segment_matches("a*b", "ac"));
        assert!(segment_matches("literal", "literal"));
        assert!(!segment_matches("literal", "literally"));
    }

    #[test]
    fn discovers_members_from_entry_member_dir() {
        let tmp = tempfile::tempdir().unwrap();
        write_root(tmp.path(), r#"["packages/*"]"#);
        write_member(tmp.path(), "packages/app", "app", "1.0.0");
        write_member(tmp.path(), "packages/lib", "lib", "2.1.0");

        let ws = find_workspace(&tmp.path().join("packages/app"))
            .unwrap()
            .expect("workspace");
        assert_eq!(ws.root, tmp.path().canonicalize().unwrap());
        assert_eq!(ws.len(), 2);
        assert_eq!(ws.member("lib").unwrap().version, "2.1.0");
        assert_eq!(
            ws.member("app").unwrap().dir,
            tmp.path().join("packages/app").canonicalize().unwrap()
        );
    }

    #[test]
    fn workspace_root_itself_is_in_scope() {
        let tmp = tempfile::tempdir().unwrap();
        write_root(tmp.path(), r#"["packages/*"]"#);
        write_member(tmp.path(), "packages/lib", "lib", "1.0.0");

        let ws = find_workspace(tmp.path()).unwrap().expect("workspace");
        assert_eq!(ws.len(), 1);
        assert!(ws.member("lib").is_some());
    }

    #[test]
    fn non_member_directory_is_not_in_scope() {
        let tmp = tempfile::tempdir().unwrap();
        write_root(tmp.path(), r#"["packages/*"]"#);
        write_member(tmp.path(), "packages/lib", "lib", "1.0.0");
        write_member(tmp.path(), "unrelated/app", "app", "1.0.0");

        let ws = find_workspace(&tmp.path().join("unrelated/app")).unwrap();
        assert!(ws.is_none());
    }

    #[test]
    fn object_form_and_explicit_paths() {
        let tmp = tempfile::tempdir().unwrap();
        write_root(tmp.path(), r#"{"packages":["tools/cli"]}"#);
        write_member(tmp.path(), "tools/cli", "cli", "0.3.0");

        let ws = find_workspace(&tmp.path().join("tools/cli"))
            .unwrap()
            .expect("workspace");
        assert_eq!(ws.len(), 1);
        assert_eq!(ws.member("cli").unwrap().version, "0.3.0");
    }

    #[test]
    fn double_star_descends_recursively() {
        let tmp = tempfile::tempdir().unwrap();
        write_root(tmp.path(), r#"["packages/**"]"#);
        write_member(tmp.path(), "packages/group/deep", "deep", "1.0.0");
        write_member(tmp.path(), "packages/shallow", "shallow", "1.0.0");

        let ws = find_workspace(&tmp.path().join("packages/shallow"))
            .unwrap()
            .expect("workspace");
        assert_eq!(ws.len(), 2);
        assert!(ws.member("deep").is_some());
    }

    #[test]
    fn dirs_without_manifest_or_name_are_skipped() {
        let tmp = tempfile::tempdir().unwrap();
        write_root(tmp.path(), r#"["packages/*"]"#);
        write_member(tmp.path(), "packages/lib", "lib", "1.0.0");
        fs::create_dir_all(tmp.path().join("packages/empty")).unwrap();
        fs::create_dir_all(tmp.path().join("packages/nameless")).unwrap();
        fs::write(
            tmp.path().join("packages/nameless/package.json"),
            r#"{"version":"1.0.0"}"#,
        )
        .unwrap();

        let ws = find_workspace(&tmp.path().join("packages/lib"))
            .unwrap()
            .expect("workspace");
        assert_eq!(ws.len(), 1);
    }

    #[test]
    fn node_modules_is_never_a_member() {
        let tmp = tempfile::tempdir().unwrap();
        write_root(tmp.path(), r#"["*", "**"]"#);
        write_member(tmp.path(), "lib", "lib", "1.0.0");
        write_member(tmp.path(), "node_modules/impostor", "impostor", "9.9.9");

        let ws = find_workspace(&tmp.path().join("lib"))
            .unwrap()
            .expect("workspace");
        assert!(ws.member("impostor").is_none());
        assert!(ws.member("lib").is_some());
    }

    #[test]
    fn duplicate_member_names_are_an_error() {
        let tmp = tempfile::tempdir().unwrap();
        write_root(tmp.path(), r#"["packages/*"]"#);
        write_member(tmp.path(), "packages/a", "same", "1.0.0");
        write_member(tmp.path(), "packages/b", "same", "2.0.0");

        let err = find_workspace(&tmp.path().join("packages/a")).unwrap_err();
        assert!(matches!(err, WorkspaceError::DuplicateMember { .. }));
    }

    #[test]
    fn unsupported_patterns_are_an_error() {
        for bad in [
            "!excluded",
            "pkg-?",
            "packages/[ab]",
            "packages/{a,b}",
            "a**b",
        ] {
            let tmp = tempfile::tempdir().unwrap();
            write_root(tmp.path(), &format!(r#"["{bad}"]"#));
            write_member(tmp.path(), "packages/lib", "lib", "1.0.0");
            // Probe from the root itself: pattern validation runs
            // before membership is decided.
            let err = find_workspace(tmp.path()).unwrap_err();
            assert!(
                matches!(err, WorkspaceError::BadPattern(_)),
                "expected BadPattern for {bad:?}"
            );
        }
    }

    #[test]
    fn missing_version_defaults() {
        let tmp = tempfile::tempdir().unwrap();
        write_root(tmp.path(), r#"["lib"]"#);
        fs::create_dir_all(tmp.path().join("lib")).unwrap();
        fs::write(tmp.path().join("lib/package.json"), r#"{"name":"lib"}"#).unwrap();

        let ws = find_workspace(&tmp.path().join("lib"))
            .unwrap()
            .expect("workspace");
        assert_eq!(ws.member("lib").unwrap().version, "0.0.0");
    }

    #[test]
    fn no_workspace_anywhere_is_none() {
        let tmp = tempfile::tempdir().unwrap();
        write_member(tmp.path(), "app", "app", "1.0.0");
        // The walk from `app` may pass through ancestors outside the
        // temp dir; none of them should declare workspaces that list
        // it, so the result is None (or a workspace that does not
        // contain `app`, which find_workspace already filters).
        let ws = find_workspace(&tmp.path().join("app")).unwrap();
        assert!(ws.is_none());
    }
}
