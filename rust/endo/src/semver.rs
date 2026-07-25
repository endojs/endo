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
        Some(Version {
            major,
            minor,
            patch,
            pre,
        })
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
            write!(
                f,
                "{}.{}.{}-{}",
                self.major, self.minor, self.patch, self.pre
            )
        }
    }
}

/// A semver range (e.g., `^1.2.3`, `~1.2.0`, `>=1.0.0 <2.0.0`,
/// `^17.0.0 || ^18.0.0`).
///
/// Simplified: we support the common npm range operators.
#[derive(Clone, Debug)]
pub struct Range {
    /// `||`-separated alternatives; each alternative is a
    /// space-separated AND set of comparators. A version satisfies
    /// the range when it satisfies every comparator of at least one
    /// alternative.
    alternatives: Vec<Vec<Comparator>>,
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
    /// A partial version's whole prefix (`2`, `2.x`, `~0`):
    /// `floor <= v < ceiling`.
    Prefix { floor: Version, ceiling: Version },
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
                alternatives: vec![vec![Comparator::Any]],
            });
        }

        // `||`-separated alternatives, each a space-separated AND set
        // of comparators. `^17 || ^18` therefore matches either
        // major, where flattening the alternatives into one AND set
        // would match neither.
        let mut alternatives = Vec::new();
        for part in s.split("||") {
            let part = part.trim();
            if part.is_empty() {
                continue;
            }
            let mut comparators = Vec::new();
            for token in part.split_whitespace() {
                if let Some(c) = parse_comparator(token) {
                    comparators.push(c);
                }
            }
            if !comparators.is_empty() {
                alternatives.push(comparators);
            }
        }

        if alternatives.is_empty() {
            None
        } else {
            Some(Range { alternatives })
        }
    }

    /// Check if a version satisfies this range: every comparator of
    /// at least one `||` alternative.
    pub fn satisfies(&self, version: &Version) -> bool {
        self.alternatives
            .iter()
            .any(|set| set.iter().all(|c| satisfies_comparator(c, version)))
    }
}

/// A possibly partial version: the numeric segments that were
/// explicitly written (`"2"`, `"2.1"`, `"2.x"`, `"2.1.3"`), with
/// unwritten segments zero-filled and `specified` recording how many
/// were given. Wildcard segments (`x`, `X`, `*`) end the specified
/// prefix.
struct Partial {
    version: Version,
    specified: u8,
}

fn parse_partial(s: &str) -> Option<Partial> {
    let s = s.trim();
    let s = s.strip_prefix('v').unwrap_or(s);
    if s.is_empty() {
        return None;
    }
    let (version_part, pre) = if let Some(idx) = s.find('-') {
        (&s[..idx], s[idx + 1..].to_string())
    } else {
        (s, String::new())
    };
    let mut nums = [0u64; 3];
    let mut specified: u8 = 0;
    for part in version_part.split('.').take(3) {
        if matches!(part, "x" | "X" | "*") {
            break;
        }
        nums[specified as usize] = part.parse().ok()?;
        specified += 1;
    }
    if specified == 0 {
        return None;
    }
    // A pre-release tag only makes sense on a full version.
    if !pre.is_empty() && specified < 3 {
        return None;
    }
    Some(Partial {
        version: Version {
            major: nums[0],
            minor: nums[1],
            patch: nums[2],
            pre,
        },
        specified,
    })
}

impl Partial {
    /// The smallest version strictly above every version sharing
    /// this partial's written prefix: increment the last specified
    /// segment and zero the rest (`2` → `3.0.0`, `2.1` → `2.2.0`,
    /// `2.1.3` → `2.1.4`).
    fn bump(&self) -> Version {
        let mut v = Version {
            major: self.version.major,
            minor: self.version.minor,
            patch: self.version.patch,
            pre: String::new(),
        };
        match self.specified {
            1 => {
                v.major += 1;
                v.minor = 0;
                v.patch = 0;
            }
            2 => {
                v.minor += 1;
                v.patch = 0;
            }
            _ => v.patch += 1,
        }
        v
    }

    /// The half-open interval covering every version sharing this
    /// partial's written prefix (`2` / `2.x` → `>=2.0.0 <3.0.0`).
    /// Correct for major 0, where the Caret comparator's
    /// leftmost-nonzero rule would collapse `0` to `0.0.0` only.
    fn prefix_comparator(&self) -> Comparator {
        Comparator::Prefix {
            floor: self.version.clone(),
            ceiling: self.bump(),
        }
    }
}

fn parse_comparator(s: &str) -> Option<Comparator> {
    let s = s.trim();
    if matches!(s, "*" | "x" | "X") {
        return Some(Comparator::Any);
    }
    if let Some(rest) = s.strip_prefix("^") {
        // `^2` / `^0` denote the whole written prefix (npm expands
        // the wildcard before applying the leftmost-nonzero rule).
        return parse_partial(rest).map(|p| {
            if p.specified == 1 {
                p.prefix_comparator()
            } else {
                Comparator::Caret(p.version)
            }
        });
    }
    if let Some(rest) = s.strip_prefix("~") {
        // npm: `~2` accepts all of major 2; `~2.1` and deeper pin
        // the minor.
        return parse_partial(rest).map(|p| {
            if p.specified == 1 {
                p.prefix_comparator()
            } else {
                Comparator::Tilde(p.version)
            }
        });
    }
    if let Some(rest) = s.strip_prefix(">=") {
        return parse_partial(rest).map(|p| Comparator::Gte(p.version));
    }
    if let Some(rest) = s.strip_prefix("<=") {
        // A partial upper bound is inclusive of its whole prefix:
        // `<=2.1` accepts any 2.1.x, i.e. `<2.2.0`.
        return parse_partial(rest).map(|p| {
            if p.specified < 3 {
                Comparator::Lt(p.bump())
            } else {
                Comparator::Lte(p.version)
            }
        });
    }
    if let Some(rest) = s.strip_prefix('>') {
        // Strictly above the whole written prefix: `>2` → `>=3.0.0`,
        // `>1.0.0` → `>=1.0.1`.
        return parse_partial(rest).map(|p| Comparator::Gte(p.bump()));
    }
    if let Some(rest) = s.strip_prefix('<') {
        return parse_partial(rest).map(|p| Comparator::Lt(p.version));
    }
    // Bare or `=`-prefixed version, possibly partial: a full version
    // is exact; `2.1` accepts any 2.1.x; `2` / `2.x` accepts all of
    // major 2.
    let rest = s.strip_prefix('=').unwrap_or(s);
    parse_partial(rest).map(|p| match p.specified {
        1 => p.prefix_comparator(),
        2 => Comparator::Tilde(p.version),
        _ => Comparator::Exact(p.version),
    })
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
        Comparator::Prefix { floor, ceiling } => v >= floor && v < ceiling,
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
pub fn select_versions(available: &[Version], ranges: &[Range]) -> Vec<Version> {
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
    fn or_range_matches_either_alternative() {
        // The peer-dependency staple: `^17 || ^18` must match both
        // majors, not the (empty) intersection of the two carets.
        let r = Range::parse("^17.0.0 || ^18.0.0").unwrap();
        assert!(r.satisfies(&Version::parse("17.0.2").unwrap()));
        assert!(r.satisfies(&Version::parse("18.3.1").unwrap()));
        assert!(!r.satisfies(&Version::parse("16.14.0").unwrap()));
        assert!(!r.satisfies(&Version::parse("19.0.0").unwrap()));
    }

    #[test]
    fn or_range_alternatives_keep_and_sets() {
        // Each alternative is still an AND set of its own.
        let r = Range::parse(">=1.0.0 <1.5.0 || >=2.0.0 <2.5.0").unwrap();
        assert!(r.satisfies(&Version::parse("1.2.0").unwrap()));
        assert!(r.satisfies(&Version::parse("2.4.9").unwrap()));
        assert!(!r.satisfies(&Version::parse("1.7.0").unwrap()));
        assert!(!r.satisfies(&Version::parse("2.5.0").unwrap()));
        assert!(!r.satisfies(&Version::parse("3.0.0").unwrap()));
    }

    #[test]
    fn mvs_selects_greatest_mentioned() {
        let available: Vec<Version> = ["1.0.0", "1.1.0", "1.2.0", "2.0.0", "2.1.0"]
            .iter()
            .filter_map(|s| Version::parse(s))
            .collect();

        let ranges = vec![Range::parse("^1.0.0").unwrap()];

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

    fn accepts(range: &str, version: &str) -> bool {
        Range::parse(range)
            .unwrap()
            .satisfies(&Version::parse(version).unwrap())
    }

    #[test]
    fn bare_major_accepts_whole_major() {
        assert!(accepts("2", "2.0.0"));
        assert!(accepts("2", "2.9.1"));
        assert!(!accepts("2", "3.0.0"));
        assert!(!accepts("2", "1.9.0"));
        // Major 0 covers all of 0.x, not just 0.0.0.
        assert!(accepts("0", "0.4.2"));
        assert!(!accepts("0", "1.0.0"));
    }

    #[test]
    fn wildcard_partials() {
        assert!(accepts("2.x", "2.5.0"));
        assert!(!accepts("2.x", "3.0.0"));
        assert!(accepts("1.2.x", "1.2.7"));
        assert!(!accepts("1.2.x", "1.3.0"));
        assert!(accepts("x", "9.9.9"));
        assert!(accepts("2.X", "2.1.0"));
        assert!(accepts("2.*", "2.1.0"));
    }

    #[test]
    fn bare_major_minor_accepts_patch_level() {
        assert!(accepts("2.1", "2.1.0"));
        assert!(accepts("2.1", "2.1.9"));
        assert!(!accepts("2.1", "2.2.0"));
    }

    #[test]
    fn operator_partials() {
        assert!(accepts(">=2", "2.0.0"));
        assert!(accepts(">=2", "5.1.0"));
        assert!(!accepts(">=2", "1.9.9"));
        assert!(accepts("<3", "2.9.9"));
        assert!(!accepts("<3", "3.0.0"));
        // `>2` excludes all of major 2.
        assert!(!accepts(">2", "2.9.9"));
        assert!(accepts(">2", "3.0.0"));
        // `<=2.1` includes every 2.1.x patch.
        assert!(accepts("<=2.1", "2.1.9"));
        assert!(!accepts("<=2.1", "2.2.0"));
        assert!(accepts(">=1 <2", "1.5.0"));
        assert!(!accepts(">=1 <2", "2.0.0"));
    }

    #[test]
    fn tilde_and_caret_partials() {
        // `~2` and `^2` both cover the whole major.
        assert!(accepts("~2", "2.9.0"));
        assert!(!accepts("~2", "3.0.0"));
        assert!(accepts("^2", "2.9.0"));
        // `^0` covers all of 0.x (wildcard expansion precedes the
        // leftmost-nonzero caret rule).
        assert!(accepts("^0", "0.4.2"));
        assert!(!accepts("^0", "1.0.0"));
        assert!(accepts("~2.1", "2.1.5"));
        assert!(!accepts("~2.1", "2.2.0"));
        assert!(accepts("^0.2", "0.2.9"));
        assert!(!accepts("^0.2", "0.3.0"));
    }
}
