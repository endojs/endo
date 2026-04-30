# Genie sandbox — `SandboxFactory.makePersistent` formula

Sub-task of
[`TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md`](../TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md)
§ "Deliverables" — _Sandbox slice formula_ (per Decision 3, owned by
`packages/sandbox`).

Add a `SandboxFactory.makePersistent(name, opts)` (exact name TBD) that
mints a `SandboxHandle` and reincarnates it deterministically on daemon
restart, following the `provideMount` / `provideScratchMount` pattern
but living in `packages/sandbox` rather than the daemon host (decision
3 — keep the daemon ignorant of the plugin's spec shape; preserve
"plugins are leaves" layering).

- [x] Design the persistence shape: record the resolved spec on disk
  under the host's daemon-state directory, keyed by `name`.
  - Spec fields: `rootfs`, `mounts` (cap refs + inner paths + modes),
    `network`, `backend`.
- [x] On first deref, re-mint the slice via the existing `make()` path
  in `packages/sandbox/src/factory.js`.
- [x] GC-pin by `name` so a daemon restart re-mints from the same spec
  without operator intervention.
- [x] Add `SandboxFactory.makePersistent` to the agent's `M.interface`
  guard and harden the result.
- [x] Add a `packages/sandbox/test/` smoke test: mint, write a sentinel
  file into a scratch mount, kill + restart, re-deref by name, verify
  the slice came back with the same spec.

Depends on: nothing new (uses today's `SandboxFactory.make()`).

Blocks: `34_endo_genie_sandbox_main_wiring.md`.

## Status

- 2026-04-30: Landed.
  `SandboxFactory` grew three new methods —
  `makePersistent(name, opts)`, `listPersistent()`, and
  `forgetPersistent(name)` — added to both the JSDoc-typed `SandboxFactory`
  shape (`packages/sandbox/src/types.d.ts`) and the runtime
  `SandboxFactoryInterface` guard
  (`packages/sandbox/src/interfaces.js`).  `makePersistent` resolves
  the caller's `SandboxMakeOpts` once via the existing
  `assembleSliceFromMakeOpts` helper, writes a versioned `spec.json`
  record (host-resolved mount paths, network, backend, seccomp
  summary, env, cwd, limits) into a scratch mount keyed
  `sandbox-persistent-<name>`, then mints the slice through a newly
  factored `buildHandleFromAssembly` helper that `make()` now also
  delegates to.  In-memory tracking is a `Map<name, PersistentEntry>`;
  pet-name validation matches the daemon's
  `/^[a-z0-9][a-z0-9-]{0,127}$/` shape so a future daemon-side wiring
  can adopt the same identifiers.

  Test coverage in
  [`packages/sandbox/test/persistent.test.js`](../packages/sandbox/test/persistent.test.js)
  (six tests, all passing under `npx ava`):
  pet-name boundary validation; in-memory caching idempotency
  (`prepareSlice` runs once across two `makePersistent` calls);
  on-disk record contents (host paths round-trip through `spec.json`);
  `forgetPersistent` evicts and the next call re-mints; **fresh
  factory + same powers re-mints from the same recorded spec**
  (the daemon-restart smoke); CapTP `__getMethodNames__()`
  introspection sees the new surface.  The pre-existing
  `factory.test.js` introspection assertion was updated to match.

  Lint + tsc both pass (`yarn lint`).  No SES runtime regressions.

  Residual gaps for future work, not in scope here:
  - The on-disk record is best-effort: a stub `provideScratchMount`
    that lacks `writeText` (such as the `bwrap.test.js` fixture) emits
    a `console.warn` and skips the write; the in-memory pin remains
    authoritative.  Production daemons supply a writeable Mount, so
    the warn path is defensive only.
  - The daemon's `provideScratchMount` mints a fresh formula on each
    call, so on a real daemon restart the underlying scratch directory
    moves.  The factory still re-mints the slice from the caller's
    re-supplied opts (the contract this slice promises); a follow-up
    will be needed if we want byte-identical disk state across
    bounces, which would require either `provideMount`-style pet-name
    indirection or a daemon-side `provideSandboxRecord` power.  The
    test simulates byte-identical persistence by sharing one
    idempotent stub powers object across two factory instances; the
    real-world story matches that simulation only after the daemon
    upgrade lands.
