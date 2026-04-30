# Genie sandbox — documentation pass

Sub-task of
[`TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md`](../TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md)
§ "Deliverables" — _Docs_.

- [ ] `packages/genie/CLAUDE.md` § "Boot shape" mentions the slice
  (`main-genie-sandbox`), the workspace mount endowment, and the
  host-vs-slice `GENIE_WORKSPACE` boundary documented in
  [`36_endo_genie_sandbox_workspace_path.md`](./36_endo_genie_sandbox_workspace_path.md).
- [ ] `packages/genie/README.md` adds (or expands, if
  [`37_endo_genie_sandbox_host_worker_residual.md`](./37_endo_genie_sandbox_host_worker_residual.md)
  already seeded it) a "Sandboxed workspace" section explaining the
  `network: 'private'` default and the workspace-mount endowment.
- [ ] `packages/genie/scripts/bottle.sh` banner notes the slice
  backend chosen at boot (`bwrap` / `podman`) and warns when no
  backend is available, so an operator on a missing-tool host sees
  the failure mode clearly.
- [ ] `PLAN/endo_posix_sandbox.md` § "Phase 3.5a" gets a "landed"
  pointer to `TADA/22_…` once this task closes.

Depends on:
[`35_endo_genie_sandbox_tool_spawn.md`](./35_endo_genie_sandbox_tool_spawn.md)
(don't ship doc claiming confinement before the tool spawn is actually
routed through the slice).
