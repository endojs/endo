# Genie sandbox — slice → genie wiring in `main.js`

Sub-task of
[`TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md`](../TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md)
§ "Deliverables" — _Slice → genie wiring_ (per Decision 1, main-side).

`packages/genie/src/main.js` resolves the workspace mount and
sandbox factory from `powers` on boot, mints (or re-derefs) the
persistent slice, and threads the resulting `SandboxHandle` into the
tool registry it constructs.

- [ ] On boot, resolve `sandbox-factory` and `workspace-mount` from
  `powers` (the host agent's pet store).
- [ ] Call `E(factory).makePersistent('main-genie-sandbox', {
  rootfs: { kind: 'host-bind' },
  mounts: [{ cap: workspaceMount, innerPath: '/workspace', mode: 'rw' }],
  network: 'private',
  backend: 'auto',
  })`.
- [ ] Thread the resulting `SandboxHandle` into the tool registry
  factory (consumed by
  [`35_endo_genie_sandbox_tool_spawn.md`](./35_endo_genie_sandbox_tool_spawn.md)).
- [ ] Update `packages/genie/CLAUDE.md` § "Boot shape" so future
  readers see the slice in the boot picture (covered in detail by
  [`41_endo_genie_sandbox_docs.md`](./41_endo_genie_sandbox_docs.md)).

Depends on:
- [`31_endo_genie_sandbox_workspace_mount.md`](./31_endo_genie_sandbox_workspace_mount.md)
- [`32_endo_genie_sandbox_factory_register.md`](./32_endo_genie_sandbox_factory_register.md)
- [`33_endo_genie_sandbox_persist_slice.md`](./33_endo_genie_sandbox_persist_slice.md)

Blocks:
[`35_endo_genie_sandbox_tool_spawn.md`](./35_endo_genie_sandbox_tool_spawn.md),
[`36_endo_genie_sandbox_workspace_path.md`](./36_endo_genie_sandbox_workspace_path.md).
