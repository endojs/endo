# Genie sandbox — slice → genie wiring in `main.js`

Sub-task of
[`TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md`](../TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md)
§ "Deliverables" — _Slice → genie wiring_ (per Decision 1, main-side).

`packages/genie/src/main.js` resolves the workspace mount and
sandbox factory from `powers` on boot, mints (or re-derefs) the
persistent slice, and threads the resulting `SandboxHandle` into the
tool registry it constructs.

- [x] On boot, resolve `sandbox-factory` and `workspace-mount` from
  `powers` (the host agent's pet store).
  Implemented in `runRootAgent` (`packages/genie/main.js`): both
  capabilities are looked up by their `pet-names.js` constants
  (`SANDBOX_FACTORY_NAME`, `WORKSPACE_MOUNT_NAME`) inside an
  `E(rootPowers).has(...)` guard so deployments without the sandbox
  plugin (and the `self-boot.test.js` harness, which bypasses
  `setup.js`) downgrade cleanly to `slice = undefined`.
- [x] Call `E(factory).makePersistent('main-genie-sandbox', {
  rootfs: { kind: 'host-bind' },
  mounts: [{ cap: workspaceMount, innerPath: '/workspace', mode: 'rw' }],
  network: 'private',
  backend: 'auto',
  })`.
  Same call site; the slice name is centralised as
  `SANDBOX_SLICE_NAME` in `pet-names.js`.  Mint failures are caught
  and logged via `console.warn` so the bottle still boots into a
  no-slice configuration the operator can correlate with the
  `listBackends()` probe output (sub-task 35 will tighten the policy
  at the `makeCommandTool` chokepoint).
- [x] Thread the resulting `SandboxHandle` into the tool registry
  factory (consumed by
  [`35_endo_genie_sandbox_tool_spawn.md`](./35_endo_genie_sandbox_tool_spawn.md)).
  `runRootAgent` captures `workspaceSlice` in its closure and passes
  it through `buildTools(workspaceDir, workspaceSlice)` inside
  `activatePiAgent`, so both the cold-boot piAgent path and the
  primordial → piAgent hand-off get the same handle.  `buildTools`
  forwards `slice` into `buildGenieTools`'s `BuildGenieToolsOptions`,
  matching the `SandboxSlice` typedef on the tool registry.
  `spawnAgent` (the legacy child-agent path) intentionally leaves
  `slice` absent — a per-child slice is the 23 / sub-agent follow-up.
- [x] Update `packages/genie/CLAUDE.md` § "Boot shape" so future
  readers see the slice in the boot picture (covered in detail by
  [`41_endo_genie_sandbox_docs.md`](./41_endo_genie_sandbox_docs.md)).
  Deferred to sub-task 41 per its scope; this sub-task only owns the
  main-side wiring code.

Depends on:
- [`31_endo_genie_sandbox_workspace_mount.md`](./31_endo_genie_sandbox_workspace_mount.md)
- [`32_endo_genie_sandbox_factory_register.md`](./32_endo_genie_sandbox_factory_register.md)
- [`33_endo_genie_sandbox_persist_slice.md`](./33_endo_genie_sandbox_persist_slice.md)

Blocks:
[`35_endo_genie_sandbox_tool_spawn.md`](./35_endo_genie_sandbox_tool_spawn.md),
[`36_endo_genie_sandbox_workspace_path.md`](./36_endo_genie_sandbox_workspace_path.md).
