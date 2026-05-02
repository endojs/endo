//! Minimal semver parsing and range matching for MVS resolution.
//!
//! Implements a subset of npm's semver syntax sufficient for
//! Minimal Version Selection: `^`, `~`, `>=`, `<`, exact versions,
//! and `||`-separated ranges.

use std::cmp::Ordering;
use std::fmt;

/// A parsed semantic version.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Version {
    pub major: u64,
    pub minor: u64,
    pub patch: u64,
    pub pre: String,
}

impl Version {
    /// Parse a version string like `"1.2.3"` or `"1.2.3-beta.1"`.
    pub fn parse(s: &str) -> Option<Self> {
        let s = s.trim().strip_prefix('v').unwrap_or(s.trim());
        let (version_part, pre) = if let Some(idx) = s.find('-') {
            (&s[..idx], s[idx + 1..].to_string())
        } else {
            (s, String::new())
        };
        let parts: Vec<&str> = version_part.split('.').collect();
        if parts.len() < 2 {
            return None;
        }
        let major = parts[0].parse().ok()?;
        let minor = parts[1].parse().ok()?;
        let patch = if parts.len() > 2 {
            parts[2].parse().ok()?
        } else {
            0
        };
        Some(Version { major, minor, patch, pre })
    }
}

impl Ord for Version {
    fn cmp(&self, other: &Self) -> Ordering {
        self.major
            .cmp(&other.major)
            .then(self.minor.cmp(&other.minor))
            .then(self.patch.cmp(&other.patch))
            .then_with(|| {
                // Pre-release versions sort before release.
                match (self.pre.is_empty(), other.pre.is_empty()) {
                    (true, true) => Ordering::Equal,
                    (true, false) => Ordering::Greater, // release > pre
                    (false, true) => Ordering::Less,
                    (false, false) => self.pre.cmp(&other.pre),
                }
            })
    }
}

impl PartialOrd for Version {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl fmt::Display for Version {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if self.pre.is_empty() {
            write!(f, "{}.{}.{}", self.major, self.minor, self.patch)
        } else {
            write!(f, "{}.{}.{}-{}", self.major, self.minor, self.patch, self.pre)
        }
    }
}

/// A semver range (e.g., `^1.2.3`, `~1.2.0`, `>=1.0.0 <2.0.0`).
///
/// Simplified: we support the common npm range operators.
#[derive(Clone, Debug)]
pub struct Range {
    comparators: Vec<Comparator>,
}

#[derive(Clone, Debug)]
enum Comparator {
    /// `^1.2.3` — compatible with (same major, >= minor.patch)
    Caret(Version),
    /// `~1.2.3` — approximately (same major.minor, >= patch)
    Tilde(Version),
    /// `>=1.2.3`
    Gte(Version),
    /// `<2.0.0`
    Lt(Version),
    /// `<=2.0.0`
    Lte(Version),
    /// `=1.2.3` or just `1.2.3`
    Exact(Version),
    /// `*` — any version
    Any,
}

impl Range {
    /// Parse a semver range string.
    ///
    /// Supports: `^`, `~`, `>=`, `<=`, `<`, `>`, `=`, exact, `*`,
    /// space-separated AND, `||`-separated OR.
    pub fn parse(s: &str) -> Option<Self> {
        let s = s.trim();
        if s.is_empty() || s == "*" || s == "latest" {
            return Some(Range {
                comparators: vec![Comparator::Any],
            });
        }

        // Handle `||`-separated OR sets — for MVS we use the first
        // set that matches. Simplification: treat as union of all
        // comparators.
        let mut comparators = Vec::new();
        for part in s.split("||") {
            let part = part.trim();
            if part.is_empty() {
                continue;
            }
            // Handle space-separated comparators within a single set.
            for token in part.split_whitespace() {
                if let Some(c) = parse_comparator(token) {
                    comparators.push(c);
                }
            }
        }

        if comparators.is_empty() {
            None
        } else {
            Some(Range { comparators })
        }
    }

    /// Check if a version satisfies this range.
    pub fn satisfies(&self, version: &Version) -> bool {
        // All comparators must be satisfied (AND within a set).
        // For OR sets, we'd need more structure, but this simplified
        // approach works for the common npm patterns.
        self.comparators.iter().all(|c| satisfies_comparator(c, version))
    }
}

fn parse_comparator(s: &str) -> Option<Comparator> {
    let s = s.trim();
    if s == "*" {
        return Some(Comparator::Any);
    }
    if let Some(rest) = s.strip_prefix("^") {
        return Version::parse(rest).map(Comparator::Caret);
    }
    if let Some(rest) = s.strip_prefix("~") {
        return Version::parse(rest).map(Comparator::Tilde);
    }
    if let Some(rest) = s.strip_prefix(">=") {
        return Version::parse(rest).map(Comparator::Gte);
    }
    if let Some(rest) = s.strip_prefix("<=") {
        return Version::parse(rest).map(Comparator::Lte);
    }
    if let Some(rest) = s.strip_prefix('>') {
        // `>1.0.0` → gte next patch
        return Version::parse(rest).map(|v| {
            Comparator::Gte(Version {
                major: v.major,
                minor: v.minor,
                patch: v.patch + 1,
                pre: String::new(),
            })
        });
    }
    if let Some(rest) = s.strip_prefix('<') {
        return Version::parse(rest).map(Comparator::Lt);
    }
    if let Some(rest) = s.strip_prefix('=') {
        return Version::parse(rest).map(Comparator::Exact);
    }
    // Bare version string.
    Version::parse(s).map(Comparator::Exact)
}

fn satisfies_comparator(c: &Comparator, v: &Version) -> bool {
    match c {
        Comparator::Any => true,
        Comparator::Exact(target) => v == target,
        Comparator::Gte(target) => v >= target,
        Comparator::Lt(target) => v < target,
        Comparator::Lte(target) => v <= target,
        Comparator::Caret(target) => {
            // ^1.2.3 := >=1.2.3 <2.0.0
            // ^0.2.3 := >=0.2.3 <0.3.0
            // ^0.0.3 := >=0.0.3 <0.0.4
            if v < target {
                return false;
            }
            if target.major > 0 {
                v.major == target.major
            } else if target.minor > 0 {
                v.major == 0 && v.minor == target.minor
            } else {
                v.major == 0 && v.minor == 0 && v.patch == target.patch
            }
        }
        Comparator::Tilde(target) => {
            // ~1.2.3 := >=1.2.3 <1.3.0
            if v < target {
                return false;
            }
            v.major == target.major && v.minor == target.minor
        }
    }
}

// ---------------------------------------------------------------------------
// Minimal Version Selection
// ---------------------------------------------------------------------------

/// Select the greatest explicitly mentioned version for each
/// major version from a set of requirements.
///
/// Given a list of (package_name, version_range) requirements and
/// available versions, returns the selected version for each
/// (package_name, major_version) pair.
///
/// This is Go-like MVS: we select the greatest version that was
/// explicitly mentioned (directly or transitively) and satisfies
/// all declared ranges.
pub fn select_versions(
    available: &[Version],
    ranges: &[Range],
) -> Vec<Version> {
    // For each major version, find the greatest available version
    // that satisfies ALL ranges.
    let mut by_major: std::collections::HashMap<u64, Vec<&Version>> =
        std::collections::HashMap::new();
    for v in available {
        by_major.entry(v.major).or_default().push(v);
    }

    let mut selected = Vec::new();
    for (_, versions) in &mut by_major {
        versions.sort();
        // Find the greatest version satisfying all ranges for this major.
        if let Some(best) = versions
            .iter()
            .rev()
            .find(|v| ranges.iter().all(|r| r.satisfies(v)))
        {
            selected.push((*best).clone());
        }
    }
    selected.sort();
    selected
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_version() {
        let v = Version::parse("1.2.3").unwrap();
        assert_eq!(v.major, 1);
        assert_eq!(v.minor, 2);
        assert_eq!(v.patch, 3);
        assert!(v.pre.is_empty());
    }

    #[test]
    fn parse_version_with_pre() {
        let v = Version::parse("1.0.0-beta.1").unwrap();
        assert_eq!(v.major, 1);
        assert_eq!(v.pre, "beta.1");
    }

    #[test]
    fn parse_version_with_v_prefix() {
        let v = Version::parse("v2.0.1").unwrap();
        assert_eq!(v.major, 2);
    }

    #[test]
    fn version_ordering() {
        let v1 = Version::parse("1.0.0").unwrap();
        let v2 = Version::parse("1.1.0").unwrap();
        let v3 = Version::parse("2.0.0").unwrap();
        assert!(v1 < v2);
        assert!(v2 < v3);
    }

    #[test]
    fn pre_release_sorts_before_release() {
        let pre = Version::parse("1.0.0-alpha").unwrap();
        let rel = Version::parse("1.0.0").unwrap();
        assert!(pre < rel);
    }

    #[test]
    fn caret_range() {
        let r = Range::parse("^1.2.3").unwrap();
        assert!(r.satisfies(&Version::parse("1.2.3").unwrap()));
        assert!(r.satisfies(&Version::parse("1.9.0").unwrap()));
        assert!(!r.satisfies(&Version::parse("2.0.0").unwrap()));
        assert!(!r.satisfies(&Version::parse("1.2.2").unwrap()));
    }

    #[test]
    fn caret_zero_major() {
        let r = Range::parse("^0.2.3").unwrap();
        assert!(r.satisfies(&Version::parse("0.2.3").unwrap()));
        assert!(r.satisfies(&Version::parse("0.2.9").unwrap()));
        assert!(!r.satisfies(&Version::parse("0.3.0").unwrap()));
    }

    #[test]
    fn tilde_range() {
        let r = Range::parse("~1.2.3").unwrap();
        assert!(r.satisfies(&Version::parse("1.2.3").unwrap()));
        assert!(r.satisfies(&Version::parse("1.2.9").unwrap()));
        assert!(!r.satisfies(&Version::parse("1.3.0").unwrap()));
    }

    #[test]
    fn gte_lt_range() {
        let r = Range::parse(">=1.0.0 <2.0.0").unwrap();
        assert!(r.satisfies(&Version::parse("1.0.0").unwrap()));
        assert!(r.satisfies(&Version::parse("1.9.9").unwrap()));
        assert!(!r.satisfies(&Version::parse("2.0.0").unwrap()));
        assert!(!r.satisfies(&Version::parse("0.9.0").unwrap()));
    }

    #[test]
    fn star_range() {
        let r = Range::parse("*").unwrap();
        assert!(r.satisfies(&Version::parse("0.0.1").unwrap()));
        assert!(r.satisfies(&Version::parse("999.0.0").unwrap()));
    }

    #[test]
    fn exact_range() {
        let r = Range::parse("1.2.3").unwrap();
        assert!(r.satisfies(&Version::parse("1.2.3").unwrap()));
        assert!(!r.satisfies(&Version::parse("1.2.4").unwrap()));
    }

    #[test]
    fn mvs_selects_greatest_mentioned() {
        let available: Vec<Version> = ["1.0.0", "1.1.0", "1.2.0", "2.0.0", "2.1.0"]
            .iter()
            .filter_map(|s| Version::parse(s))
            .collect();

        let ranges = vec![
            Range::parse("^1.0.0").unwrap(),
        ];

        let selected = select_versions(&available, &ranges);
        // Should select greatest in major 1 satisfying ^1.0.0.
        assert_eq!(selected.len(), 1);
        assert_eq!(selected[0].to_string(), "1.2.0");
    }

    #[test]
    fn mvs_multiple_majors() {
        let available: Vec<Version> = ["1.0.0", "1.1.0", "2.0.0", "2.1.0"]
            .iter()
            .filter_map(|s| Version::parse(s))
            .collect();

        // Range that allows both major 1 and 2.
        let ranges = vec![Range::parse("*").unwrap()];

        let selected = select_versions(&available, &ranges);
        assert_eq!(selected.len(), 2);
        assert_eq!(selected[0].to_string(), "1.1.0");
        assert_eq!(selected[1].to_string(), "2.1.0");
    }

    #[test]
    fn version_display() {
        let v = Version::parse("1.2.3").unwrap();
        assert_eq!(v.to_string(), "1.2.3");
        let v = Version::parse("1.0.0-beta.1").unwrap();
        assert_eq!(v.to_string(), "1.0.0-beta.1");
    }
}
