# Genie: address sandbox use feedback

- [x] review the PR feedback pasted below, analyze, consider, plan; then create
  follow-up `TODO/` tasks to address feedback; do not change code in this
  session

## Follow-ups created

Each finding from the saboteur and juror blocks below has been broken out into
a focused `TODO/` task.  Tasks are independent and can land in any order, but
the suggested merge order is **65 → 66 → 67 → 62 → 63 → 64 → 68 → 61**:
housekeeping first (65, 66), then the cheap inline fixes (67, 62, 63, 64, 68),
then the dev-repl `local-powers` hardening (61) which is the deepest change.

| Follow-up                                                                                | Source finding(s)                                                          | Posture       |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------- |
| [`61_genie_local_powers_symlink_realpath.md`](./61_genie_local_powers_symlink_realpath.md) | Saboteur 1 (symlink follow), 2 (sub-Mount registration), 4 (absolute-path veto) | Real concern  |
| [`62_genie_slice_resolved_backend_consistency.md`](./62_genie_slice_resolved_backend_consistency.md) | Saboteur 5 (TOCTOU) + juror `slice.js:357` (`backendSelector` mismatch)    | Should-fix    |
| [`63_genie_slice_env_deep_harden.md`](./63_genie_slice_env_deep_harden.md)               | Saboteur 6 (`env` proxy gap)                                               | Should-fix    |
| [`64_genie_mount_cap_validation_helper.md`](./64_genie_mount_cap_validation_helper.md)   | Juror `main.js:1125/1223` dedupe + saboteur 3 (pin rejection surface)      | Should-fix    |
| [`65_genie_repro_scripts_cleanup.md`](./65_genie_repro_scripts_cleanup.md)               | Juror **must-fix** (`tmp-repro-sandbox*.mjs`)                              | Must-fix      |
| [`66_pr148_changeset.md`](./66_pr148_changeset.md)                                       | Juror should-fix (no changeset entry)                                      | Should-fix    |
| [`67_genie_slice_cancelled_rejection_handler.md`](./67_genie_slice_cancelled_rejection_handler.md) | Juror `slice.js:386` (unhandled rejection)                                | Should-fix    |
| [`68_genie_command_tool_cwd_segment_validation.md`](./68_genie_command_tool_cwd_segment_validation.md) | Juror `command.js:455` (`..` substring check)                              | Should-fix    |

The saboteur's "scoping the central claim to `command` / `bash` / `exec` /
`git` tools" suggestion is **not** broken out into a separate TODO — it is a
PR-description edit, not a code change, and the reviewer's wording can land
directly in the PR conversation.

## Saboteur (panel adversarial slot) — PR #148

## Saboteur (panel adversarial slot) — PR #148

Attacks against the central claim "@endo/genie tools cannot escape the
@endo/sandbox confinement boundary." The juror covers substance (in particular,
the `files` / `memory` / `web` tool groups by design never traverse the slice —
the claim needs scoping to the `command` / `bash` / `exec` / `git` tools). This
slot covers attack vectors against the boundary as constructed.

10 attacks; verdict split: 2 real concern, 4 should-fix, 4 mitigated (defensive
coverage worth pinning).

### Real concern

1. **`local-powers` Mount.lookup follows symlinks; the daemon's `Mount.lookup`
   calls `realPath` first.**
   `packages/genie/src/sandbox/local-powers.js:236-253` — `fs.stat(target)`
   follows symlinks, then `makeLocalMountCap(target, capToHostPath)` registers
   a sub-Mount whose subsequent `list` / `readText` / `writeText` go through
   `${workspaceRoot}/escape` and the kernel resolves the symlink at exec time.
   Compare `packages/daemon/src/mount.js:217-233` which calls `assertConfined`
   → `filePowers.realPath` first. Gotcha test: place `${workspaceDir}/escape ->
   /etc`, call `E(localMount).lookup('escape').list()`, assert the call rejects
   with "Path escapes mount root" (it currently returns `/etc` contents).
   Either harden `assertNoEscape` to call `realPath`, or pin the divergence
   with a test naming the dev-repl path as "trusts operator-supplied tree to
   contain no hostile symlinks".

2. **`local-powers.provideHostPath` accepts sub-Mounts minted by `lookup`; the
   daemon's rejects them.** `local-powers.js:369` registers every sub-Mount in
   the same `WeakMap` `provideHostPath` consults. Compare
   `packages/daemon/src/host.js:290-297` which explicitly rejects "subdirectory
   views minted by Mount.lookup() and read-only attenuations". Gotcha test:
   `const sub = await E(workspaceMount).lookup('subdir');
   E(powers).provideHostPath(sub)` resolves on local-powers, rejects with "not
   a daemon-minted mount" on the daemon. Composed with finding 1, a caller can
   mint a `MountCap` for any directory reachable via a workspace-internal
   symlink and bind-mount it into the slice.

### Should-fix

3. **`__getMethodNames__()` is the only authentication on a pet-name Mount
   cap.** `main.js:1125-1144` (workspace) and `:1223-1242` (rootfs). A
   remotable returning the right method names passes the validation regardless
   of behaviour. Downstream `factory.make` → `provideHostPath` still rejects
   via the formula-id check, so the bypass is shallow on the daemon; on the
   dev-repl with finding 2 it is not shallow. Pin the rejection surface in a
   test.

4. **`assertNoEscape` permits absolute-path segments (`'/etc/passwd'`).**
   `local-powers.js:137-150` only vetoes `..` and `\0`. POSIX
   `path.join(hostPath, '/etc/passwd')` evaluates to `${hostPath}/etc/passwd`
   so the textual escape is contained, but any future swap to `path.resolve` or
   to `path.win32` semantics promotes the segment. Add
   `segment.startsWith('/')` to the veto for defense in depth.

5. **TOCTOU between `assertRootfsBackendCompatible` and the resolved backend.**
   `spawnAgent` (`main.js:1215`) cross-checks `parsedRootfs` against the
   unresolved `'auto'` selector; `mintGenieSlice` resolves `'auto'` to
   `available[0].name` (`slice.js:348`). `rootfs: 'oci:...'` + `backend:
   'auto'` passes the form check; if `'auto'` resolves to `bwrap`, the
   slice-mint fails with a different error string than the form check promised.
   `mintGenieSlice` should re-run the cross-check post-resolution.

6. **`mintGenieSlice` does not deep-harden the inner `env` object.**
   `slice.js:362-370` `harden`s the outer spec but the caller's `env` is left
   as-is. A Proxy `env` with a per-access getter could differentiate "what
   `factory.make` saw" from "what the driver wrote into the slice". Cheap:
   deep-harden `env` at the boundary.

## Juror review (general posture)

Substantive, in-scope review of PR #148 against base `llm` at head `3c6d6b477`.
The saboteur covers adversarial / invariant-attack angles in a sibling review;
this block focuses on design, code quality, testing, and documentation of the
confinement boundary itself.

### Verdict: comment (one must-fix housekeeping item, several should-fix)

### Findings

**Must-fix before merge**

- `packages/genie/tmp-repro-sandbox.mjs`, `tmp-repro-sandbox2.mjs`,
  `tmp-repro-sandbox3.mjs` are debugging-reproduction scripts that should not
  land. They top-level `console.log`, are not in `.gitignore`, and are not
  referenced from any committed flow. Either delete them or move them under a
  clearly-marked `test/repro/` with a one-line README explaining the scenario
  each one pins. They were added in the last commit (`3c6d6b477`) alongside the
  bug-hunt that produced TADA/57-62. Drop them in the same commit that lands
  the fix they were investigating.

**Should-fix in this PR**

- No changeset entry. The PR touches three published packages (`@endo/genie`,
  `@endo/sandbox`, `@endo/daemon`) and adds a new public method
  `EndoHost.provideHostPath` on the daemon's interface; that warrants a
  `.changeset/*.md` per the project's existing pattern (see
  `.changeset/add-endo-hex.md` for shape).
- `packages/genie/src/sandbox/slice.js:386`. `cancelledP.then(...)` has no
  rejection handler. Today `main.js` only ever calls `cancel(undefined)`
  (resolve path) so the slice is reliably disposed, but a future caller that
  rejects the kit will leak the slice silently and trip an unhandled-rejection
  log. Either chain a `.catch(...)` on the `.then` itself or use
  `Promise.allSettled([cancelledP])` to make the resolve-only intent explicit.
- `packages/genie/src/sandbox/slice.js:357`. `backendSelector` is built from
  the *unvalidated* `backend` string rather than the `resolvedBackend` computed
  three lines above. The probe loop already narrowed `backend === 'auto'` to a
  concrete driver, but the cast still carries `'auto'` into `factory.make({
  backend })`. The factory accepts `'auto'` so the call succeeds, but the
  operator-grep log line further down (`sliceLabel`) correctly reports
  `resolvedBackend`. Use `resolvedBackend` for the factory call too so logs and
  slice spec agree.
- `packages/genie/main.js:1125` and `1223` duplicate the same Mount-cap
  method-set validation block (the `required = ['readText', 'writeText',
  'makeDirectory', 'has', 'list']` filter against `__getMethodNames__()`).
  Hoist into a `assertIsMountCap(cap, { agentName, role })` helper next to the
  rootfs-form helpers in `src/sandbox/slice.js` (where `ALLOWED_*` already
  live) so the workspace and rootfs pet-name branches stay in lockstep.
- `packages/genie/src/tools/command.js:455`. The preexisting
  `cwd.includes('..')` traversal check rejects legitimate relative paths like
  `foo/..bar` (the textual substring matches the `..bar` filename). Not
  introduced by this PR but the new sandbox-spawner path makes the check more
  visible. Worth a follow-up issue to switch to segment-level validation.
