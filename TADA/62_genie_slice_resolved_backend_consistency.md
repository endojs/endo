# Genie slice mint: use `resolvedBackend` consistently and re-check rootfs compatibility

Follow-up from
[`60_genie_sandbox_review.md`](./60_genie_sandbox_review.md)
saboteur finding 5 and juror finding on `slice.js:357`.  Both surface
the same bug: `mintGenieSlice` resolves `backend === 'auto'` into a
concrete driver but the resolution does not flow back into either the
factory call or the rootfs-compatibility cross-check.

## Plan

- [x] **Use `resolvedBackend` in the factory call.**
  `packages/genie/src/sandbox/slice.js:357` builds `backendSelector`
  from the *unresolved* `backend` string ("auto") and passes it to
  `factory.make({ backend: backendSelector })`.  The factory accepts
  `'auto'` so the call succeeds, but the operator-grep log line
  (`sliceLabel`, computed off `resolvedBackend`) and the slice spec
  disagree.  Change the cast to derive from `resolvedBackend` so the
  spec, the log line, and the post-mint cross-check (next item) agree.

  **Done.**  `slice.js` now derives `backendSelector` from
  `resolvedBackend` (the cast appears immediately after the probe /
  select block), so the spec passed into `factory.make`, the
  readiness log line, and the post-resolution cross-check all agree
  on which driver runs the slice.  Verified by
  `test/sandbox-slice-mint.test.js` →
  *"mintGenieSlice — passes the resolved backend to factory.make"*
  which asserts `makeCalls[0].backend === 'bwrap'` (not `'auto'`)
  when the operator left the form value at its default.

- [x] **Re-run `assertRootfsBackendCompatible` post-resolution.**
  `main.js:1215` invokes the form-side helper against `backend ==
  'auto'`, which short-circuits the bwrap-rejects-oci rule.  Move (or
  duplicate) the cross-check inside `mintGenieSlice` so it fires
  against `resolvedBackend` **after** the probe / select step:

  ```js
  // slice.js, just after resolvedBackend is computed
  assertRootfsBackendCompatible(parsedRootfs, resolvedBackend, { agentName });
  ```

  This needs `parsedRootfs` (the `ParsedRootfsValue`, not the resolved
  `RootfsSpec`) threaded into `MintGenieSliceOptions`.  The existing
  `rootfsLabel` already encodes `parsedRootfs.kind`; passing the parse
  alongside is the minimal-surface change.  Alternative: move the
  helper into `slice.js` next to `ALLOWED_*` (where the juror suggests
  hoisting it) and accept the parse as an option.

  **Done.**  `parsedRootfs` is now a documented field of
  `MintGenieSliceOptions` (alongside the resolved `rootfs` so the
  daemon's pet-name → MountCap resolution still lands a cap into the
  factory) and `mintGenieSlice` calls
  `assertRootfsBackendCompatible(parsedRootfs, resolvedBackend, …)`
  immediately after the `'auto'` resolution.  The helper itself
  already lives in `slice.js` (the form-side parse helpers were
  hoisted earlier), so `main.js` re-exports the symbol to preserve
  the public test surface.

- [x] **Test: `rootfs: 'oci:alpine'` + `backend: 'auto'` resolving to
  `bwrap` fails with the form-side error string.**  Today this combo
  passes the form-side check (because `'auto'` is bwrap-compatible)
  and then fails inside `factory.make` with a different error.  Mint a
  slice with the combination on a host where `bwrap` is available but
  podman is not, assert the rejection matches the form-side helper's
  fix string verbatim (`set backend to podman or pick a non-oci
  rootfs`).

  **Done.**  `test/sandbox-slice-mint.test.js` →
  *"mintGenieSlice — auto -> bwrap with oci rootfs rejects with the
  form-side fix string"* uses a hand-rolled `SandboxFactory` stub
  (so the test runs on platforms without a backend) that reports
  `bwrap` available and `podman` unavailable; the assertion matches
  the friendly error verbatim
  (`set "backend" to "podman" or pick a non-oci rootfs`) and
  additionally checks `makeCalls.length === 0` to prove the
  cross-check fires *before* `factory.make` is ever reached.  A
  sibling test (*"auto -> podman with oci rootfs passes the
  cross-check"*) guards the other half: when the resolution lands
  on a compatible backend the slice mints normally.  All three
  tests pass via `npx corepack yarn ava test/sandbox-slice-mint.test.js`.

- [x] **`mintGenieSlice` JSDoc** — note the cross-check fires twice on
  purpose (form-side names the agent; slice-side covers `'auto'`
  resolution) so future contributors don't dedupe one of them away.

  **Done.**  `mintGenieSlice`'s JSDoc carries a two-bullet block
  ("fires twice on purpose, and the duplication is intentional —
  please do not dedupe one of the call sites away") that names each
  caller, why the form-side pass short-circuits under `'auto'`, and
  why the slice-side pass catches the resolved-backend mismatch.
  The matching prose in `packages/genie/CLAUDE.md` § "`rootfs`
  form field" mirrors the same explanation from the
  operator/integration side.

## Out of scope

- Renaming `assertRootfsBackendCompatible`.
- Promoting `parsedRootfs` to the `MintGenieSliceOptions` surface in a
  way that breaks the existing test-only export — keep both
  `rootfs` (resolved) and `parsedRootfs` available so the daemon path's
  pet-name resolution still lands a `MountCap` into the factory.
