# Genie dev-repl `local-powers`: harden against symlink and absolute-path escapes

Follow-up from
[`60_genie_sandbox_review.md`](./60_genie_sandbox_review.md)
saboteur findings 1, 2, and 4.  All three concern the dev-repl-only
`makeLocalSandboxPowers` exo in
[`packages/genie/src/sandbox/local-powers.js`](../packages/genie/src/sandbox/local-powers.js)
and they compose: a symlink-traversal `lookup` produces a sub-Mount that
`provideHostPath` then resolves into a bind into the slice.

This is **dev-repl-only** — the daemon path (`packages/daemon/src/mount.js`
and `packages/daemon/src/host.js`) already rejects both shapes.  The
choice is between hardening the dev-repl exo to match or pinning the
divergence as a documented "trusts the operator's tree" stance.
The plan below prefers hardening because the dev-repl is meant to be
behaviourally equivalent to the daemon path for purposes of confinement
review (see PR #148's central claim).

## Plan

- [x] **`Mount.lookup` realpath check.**
  `local-powers.js:236-253` currently calls `fs.stat(target)` which
  follows symlinks.  After the stat, before returning the sub-Mount,
  call `fs.realpath(target)` and assert the resolved path is still
  under `hostPath` (textually, with a trailing separator check to avoid
  `${hostPath}sibling` matching `${hostPath}/...`).  On mismatch, throw
  the same shape as the daemon: `local Mount.lookup: ${target} escapes
  mount root`.
  Landed: `lookup` now realpaths both the target and (lazily,
  cached) the mount root before deciding whether to return a
  sub-Mount.  The cached-root step handles macOS where `/tmp` is a
  symlink to `/private/tmp` and would otherwise trip the textual
  prefix check for legitimate sub-paths.

- [x] **Reject sub-Mounts in `provideHostPath`.**
  Today `makeLocalMountCap` registers *every* mint (root and sub-Mounts
  from `lookup`) in the same `capToHostPath` `WeakMap`.  The daemon's
  `EndoHost.provideHostPath` rejects sub-Mounts explicitly (see
  `packages/daemon/src/host.js:290-297`).  Two viable shapes:
  - **Tag the cap origin.**  Keep a separate `Set<MountCap>` of
    "top-level" caps (those minted by `provideScratchMount` and
    `makeMountCapForPath`) and reject in `provideHostPath` when the cap
    is in `capToHostPath` but **not** in the top-level set.
  - **Drop sub-Mount registration entirely.**  Remove the
    `capToHostPath.set(cap, hostPath)` call inside `makeLocalMountCap`
    when it is invoked from `lookup` (thread a `{ topLevel: boolean }`
    parameter).  Caller-facing impact: callers that expect to bind a
    sub-Mount into a slice must mint a fresh top-level Mount via
    `makeMountCapForPath(subPath)` instead.
  Prefer the tagging shape; the explicit-mint workflow is what the
  daemon already enforces.
  Landed: implemented the tagging shape via a `topLevelCaps`
  `WeakSet`.  `makeLocalMountCap` accepts a `{ topLevel: boolean }`
  option; only the two top-level call sites
  (`provideScratchMount`, `makeMountCapForPath`) pass `true`.
  `provideHostPath` rejects strangers with the existing `not a
  local-minted mount` wording and sub-Mount views with `cap is a
  sub-Mount view, not a top-level mount; mint a fresh top-level
  Mount via makeMountCapForPath instead`.

- [x] **Veto absolute-path segments in `assertNoEscape`.**
  `local-powers.js:137-150` only rejects `..` and `\0`.  Add
  `segment.startsWith('/')` (and `segment.startsWith('\\')` for the
  Windows / dual-separator case) to the veto.  POSIX `path.join` happens
  to neutralize `/etc/passwd` today, but a future swap to `path.resolve`
  or `path.win32` would promote the segment.  Defense in depth.
  Landed.

- [x] **Pin all three rejections with tests.**
  Added under "Confinement hardening" in
  `packages/genie/test/local-sandbox-powers.test.js`:
  - `Mount.lookup rejects a symlink that points outside the mount
    root` — builds `${tmp}/ws/escape -> ${tmp}/sibling` and asserts
    the lookup rejects with `escapes mount root`.
  - `Mount.lookup allows a symlink whose target stays inside the
    mount root` — the symmetric positive case so the rejection
    above does not silently break operator-set-up workspace trees.
  - `provideHostPath rejects sub-Mounts minted by Mount.lookup` —
    asserts the new `sub-Mount view, not a top-level mount`
    rejection and verifies the recommended workaround
    (`makeMountCapForPath(subPath)`) resolves normally.
  - `Mount path-segment veto rejects absolute path segments` —
    covers string and array forms, the Windows `\\` separator, and
    multiple call sites (`readText` and `lookup`).
  All 13 tests in the file pass.

- [x] **Update `packages/genie/CLAUDE.md` § "Dev REPL local powers"** to
  state the new posture explicitly: "the dev-repl's local powers reject
  sub-Mounts and symlink escapes to mirror the daemon's
  `EndoHost.provideHostPath` rejection surface — adversarially-shaped
  workspace trees cannot widen the slice's bind set".
  Landed: added a paragraph and a three-bullet list under the
  existing "Dev REPL local powers" subsection that summarises the
  realpath, sub-Mount, and absolute-segment constraints and points
  at the new test cluster.

## Out of scope

- Any change to the daemon path; those rejections already exist.
- Replacing the textual escape check with a full canonical-path
  walker — `fs.realpath` is sufficient for the symlink case and the
  textual escape veto remains useful as a cheap early reject.
