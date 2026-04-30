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

- [ ] Design the persistence shape: record the resolved spec on disk
  under the host's daemon-state directory, keyed by `name`.
  - Spec fields: `rootfs`, `mounts` (cap refs + inner paths + modes),
    `network`, `backend`.
- [ ] On first deref, re-mint the slice via the existing `make()` path
  in `packages/sandbox/src/factory.js`.
- [ ] GC-pin by `name` so a daemon restart re-mints from the same spec
  without operator intervention.
- [ ] Add `SandboxFactory.makePersistent` to the agent's `M.interface`
  guard and harden the result.
- [ ] Add a `packages/sandbox/test/` smoke test: mint, write a sentinel
  file into a scratch mount, kill + restart, re-deref by name, verify
  the slice came back with the same spec.

Depends on: nothing new (uses today's `SandboxFactory.make()`).

Blocks: `34_endo_genie_sandbox_main_wiring.md`.
