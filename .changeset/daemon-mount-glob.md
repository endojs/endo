---
'@endo/daemon': minor
---

Add `glob(pattern)` to `EndoMount`, delegating to the `@endo/platform/fs/search`
engine.

`glob(pattern) -> Promise<string[]>` recursively enumerates paths within the
mount face's confined root that match a glob pattern, sorted by UTF-16 code unit
and capped at `GLOB_MAX_RESULTS`. The walk, the two-metacharacter dialect (`*`
matches within one segment including a leading dot but never `/`; `**` matches
zero or more whole segments; every other character — `?`, `[`, `]`, `{`, `}`,
`+` — is literal), the ReDoS-safe matcher, symlink-cycle termination, deny
filtering, and confinement all now live in the platform engine, so a Rust/XS
platform can substitute a native walk behind the same seam. The method is the
eager flatten-and-cap collector over the engine's batch generator; a `subView`'s
glob sees only its own sub-root and the revocation gate wraps the call. Denied
segments never appear in results even when named literally, and entries whose
symlinks escape the mount root are silently excluded. External surface unchanged.
