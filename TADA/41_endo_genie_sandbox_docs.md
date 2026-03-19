# Genie sandbox — documentation pass

Sub-task of
[`TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md`](../TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md)
§ "Deliverables" — _Docs_.

- [x] `packages/genie/CLAUDE.md` § "Boot shape" mentions the slice
  (`main-genie-sandbox`), the workspace mount endowment, and the
  host-vs-slice `GENIE_WORKSPACE` boundary documented in
  [`TADA/36_endo_genie_sandbox_workspace_path.md`](../TADA/36_endo_genie_sandbox_workspace_path.md).
  Landed in the new "Sandbox slice (Phase 3.5a)" subsection: names
  the two host pet-store endowments (`workspace-mount`,
  `sandbox-factory`), describes the `E(factory).makePersistent
  ('main-genie-sandbox', { rootfs, mounts: [{ innerPath:
  '/workspace' }], env: { GENIE_WORKSPACE: '/workspace' }, cwd:
  '/workspace', network: 'private', backend: 'auto' })` call
  `main.js` issues at boot, and explains the missing-cap fallback
  that leaves the host-spawn path engaged.  A "Host vs slice
  `GENIE_WORKSPACE`" sub-subsection documents the two coexisting
  views — host path outside, `/workspace` inside — and catalogues
  the on-host call sites (`initWorkspace`, `loadPersistedConfig` /
  `savePersistedConfig`, `makeFTS5Backend`, `makeFileTools`,
  `makeMemoryTools`) that consume the captured `workspaceDir` local
  rather than `process.env`, which is why the in-process rewrite to
  `/workspace` is purely defence-in-depth.

- [x] `packages/genie/README.md` adds (or expands, if
  [`TADA/37_endo_genie_sandbox_host_worker_residual.md`](../TADA/37_endo_genie_sandbox_host_worker_residual.md)
  already seeded it) a "Sandboxed workspace" section explaining the
  `network: 'private'` default and the workspace-mount endowment.
  Sub-task 37 already seeded the section (slice mint + residual
  exposure framing); this pass expanded it with two new paragraphs:
  one names `workspace-mount` as the single filesystem endowment
  beyond the host-bind rootfs and cross-links the
  `CLAUDE.md` § "Boot shape" → "Host vs slice `GENIE_WORKSPACE`"
  audit, and one documents the no-backend fallback (capabilities
  still pin, slice mint fails on first deref, host-spawn fallback
  engages, operator sees a worker-log warning).

- [x] `packages/genie/scripts/bottle.sh` banner notes the slice
  backend chosen at boot (`bwrap` / `podman`) and warns when no
  backend is available, so an operator on a missing-tool host sees
  the failure mode clearly.
  Implemented as a `command -v bwrap || command -v podman` probe
  that runs setup-side (operator's `PATH`, before the daemon
  starts) and surfaces the result as a new `sandbox : <backend>`
  line in the existing `=== genie in a bottle (Phase 0) — invoke
  ===` banner.  When neither backend is on `PATH`, the script
  prints a multi-line `[bottle] WARNING:` block that names what was
  searched, what the operator loses (workspace confinement +
  `network: 'private'` egress filter), what to install, and a
  pointer to `PLAN/endo_posix_sandbox.md` § "Phase 3.5a" for
  context.  The probe is advisory: it does not gate the boot, since
  the slice mint itself is the authoritative check inside `main.js`.

- [x] `PLAN/endo_posix_sandbox.md` § "Phase 3.5a" gets a "landed"
  pointer to `TADA/22_…` once this task closes.
  Added at the top of the `#### 3.5a — root-genie workspace slice`
  subsection: a **Landed** (2026-04 / 2026-05) note that points at
  `TADA/22_…` for the consolidated decision record, enumerates the
  per-deliverable landing TADAs (`31_…workspace_mount`,
  `32_…factory_register`, `33_…persist_slice`, `34_…main_wiring`,
  `35_…tool_spawn`, `36_…workspace_path`,
  `37_…host_worker_residual`), and cross-links
  `TADA/24_…worker_inside_slice` as the planned closure of the
  residual host-side exposure.  The original prose below the note
  is preserved so the historical "open" framing stays legible.

Depends on:
[`TADA/35_endo_genie_sandbox_tool_spawn.md`](../TADA/35_endo_genie_sandbox_tool_spawn.md)
(don't ship doc claiming confinement before the tool spawn is actually
routed through the slice).
Landed 2026-04-30 — the slice-aware branch in `command.js`'s
`makeCommandTool#execute` is the chokepoint the docs now describe.

## Status

- 2026-05-01: All four doc deliverables landed.  `CLAUDE.md` gained
  a "Sandbox slice (Phase 3.5a)" subsection plus a "Host vs slice
  `GENIE_WORKSPACE`" sub-subsection; `README.md`'s pre-existing
  "Sandboxed workspace" section grew an explicit `workspace-mount`
  endowment paragraph and a no-backend fallback paragraph;
  `bottle.sh`'s invoke banner advertises the detected sandbox
  backend (`bwrap` / `podman` / `none`) and prints a loud
  `[bottle] WARNING:` block when the host is missing a backend;
  `PLAN/endo_posix_sandbox.md` § "Phase 3.5a" carries a
  **Landed** pointer to `TADA/22_…` plus the per-sub-task TADA
  cross-links.  The worker-inside-slice follow-up
  ([`TADA/24_…`](../TADA/24_endo_posix_sandbox_phase3_5a_worker_inside_slice.md))
  is named as the planned closure of the residual host-side
  exposure throughout.
