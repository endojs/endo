# Endo genie sandbox — Phase 3.5a follow-up tracking

Parent TADA:
[`TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md`](../TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md).

- [x] create `TODO/` task follow-ups for the deliverables in
  `TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md`

## Follow-ups

One file per non-struck deliverable in TADA/22 § "Deliverables".
Ordered roughly by dependency (top-to-bottom can be picked up in
sequence; siblings within a level are independent).

- [ ] [`31_endo_genie_sandbox_workspace_mount.md`](./31_endo_genie_sandbox_workspace_mount.md)
  — workspace `Mount` provisioning in `setup.js`.
- [ ] [`32_endo_genie_sandbox_factory_register.md`](./32_endo_genie_sandbox_factory_register.md)
  — register `@endo/sandbox` plugin under `sandbox-factory`.
- [ ] [`33_endo_genie_sandbox_persist_slice.md`](./33_endo_genie_sandbox_persist_slice.md)
  — `SandboxFactory.makePersistent` formula in `packages/sandbox`.
- [ ] [`34_endo_genie_sandbox_main_wiring.md`](./34_endo_genie_sandbox_main_wiring.md)
  — `main.js` mints / re-derefs the slice, threads it into tools.
- [ ] [`35_endo_genie_sandbox_tool_spawn.md`](./35_endo_genie_sandbox_tool_spawn.md)
  — re-route `command.js:346` through `E(slice).spawn`.
- [ ] [`36_endo_genie_sandbox_workspace_path.md`](./36_endo_genie_sandbox_workspace_path.md)
  — `GENIE_WORKSPACE` host vs slice path resolution.
- [ ] [`37_endo_genie_sandbox_host_worker_residual.md`](./37_endo_genie_sandbox_host_worker_residual.md)
  — document host-side worker residual exposure.
- [ ] [`38_endo_genie_sandbox_heartbeat_continuity.md`](./38_endo_genie_sandbox_heartbeat_continuity.md)
  — heartbeat / observer / reflector continuity check.
- [ ] [`39_endo_genie_sandbox_gc_order.md`](./39_endo_genie_sandbox_gc_order.md)
  — slice-before-worker reincarnation on daemon restart.
- [ ] [`40_endo_genie_sandbox_tests.md`](./40_endo_genie_sandbox_tests.md)
  — acceptance tests (host-file invisibility, private network,
  restart, stdio).
- [ ] [`41_endo_genie_sandbox_docs.md`](./41_endo_genie_sandbox_docs.md)
  — `CLAUDE.md` / `README.md` / `bottle.sh` / `PLAN` doc updates.

The struck "worker placement (worker-inside-slice variant)"
deliverable in TADA/22 is tracked separately by
[`TADA/24_endo_posix_sandbox_phase3_5a_worker_inside_slice.md`](../TADA/24_endo_posix_sandbox_phase3_5a_worker_inside_slice.md);
no TODO file is created for it here.
