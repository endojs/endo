# Genie sandbox — `GENIE_WORKSPACE` host vs slice path resolution

Sub-task of
[`TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md`](../TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md)
§ "Deliverables" — _`GENIE_WORKSPACE` resolution_.

Two views of `GENIE_WORKSPACE` coexist after 3.5a:
- Outside the slice (the launcher and worker on the host):
  the operator-supplied host path.
- Inside the slice (every tool spawn): `/workspace`.

`main.js` reads the host path from `env`, hands it to `provideMount`
setup-side, and rewrites its in-process `GENIE_WORKSPACE` to the
slice-internal path before constructing tools — so MEMORY.md /
HEARTBEAT.md / `.genie/` paths the genie itself uses on the host
(workspace init, persisted-config read, fts5 backend) keep their host
view, while every spawn-through-slice call sees `/workspace`.

- [ ] Plumb the host path setup-side (already done by
  [`31_endo_genie_sandbox_workspace_mount.md`](./31_endo_genie_sandbox_workspace_mount.md)).
- [ ] In `main.js`, after slice mint, rewrite the in-process
  `GENIE_WORKSPACE` to `/workspace` before tool-registry construction.
- [ ] Audit on-host call sites (workspace init, persisted-config
  reader, fts5 search index) and confirm they still see the host path
  via the launcher's `env` snapshot, not the rewritten value.
  - Likely chokepoints: workspace-init helper, `.genie/config.json`
    loader, fts5 backend's index path resolution.
- [ ] Document the two views and the boundary in
  `packages/genie/CLAUDE.md` (covered by
  [`41_endo_genie_sandbox_docs.md`](./41_endo_genie_sandbox_docs.md)).

Depends on:
[`34_endo_genie_sandbox_main_wiring.md`](./34_endo_genie_sandbox_main_wiring.md).
