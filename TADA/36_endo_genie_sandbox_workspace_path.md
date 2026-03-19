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

- [x] Plumb the host path setup-side (already done by
  [`31_endo_genie_sandbox_workspace_mount.md`](./31_endo_genie_sandbox_workspace_mount.md)).
- [x] In `main.js`, after slice mint, rewrite the in-process
  `GENIE_WORKSPACE` to `/workspace` before tool-registry construction.
  Implemented at `packages/genie/main.js`'s `runRootAgent` mint block
  (≈ line 1447): `process.env.GENIE_WORKSPACE = '/workspace'` runs
  immediately after `E(factory).makePersistent(...)` resolves and
  before the cancellation kit / `activatePiAgent` call chain that
  invokes `buildTools(workspaceDir, workspaceSlice)`.  The rewrite is
  guarded by the slice-mint success branch so the missing-cap and
  mint-failure paths leave `process.env.GENIE_WORKSPACE` pointing at
  the launcher-supplied host path — that branch's host-spawn fallback
  in `tools/command.js` (`...process.env`) needs the host view to
  keep matching the workspace files on disk.
  Companion change: the `makePersistent` opts also bake
  `env: { GENIE_WORKSPACE: '/workspace' }` and `cwd: '/workspace'`
  into the slice's construction-time spec so the bwrap driver renders
  `--setenv GENIE_WORKSPACE /workspace` and `--chdir /workspace`
  (`packages/sandbox/src/drivers/bwrap.js` `assembleSliceArgv`).
  Without this, `bwrap --clearenv` would drop `GENIE_WORKSPACE`
  entirely from the slice's child processes — the in-process rewrite
  alone does not propagate because `command.js`'s slice branch
  restricts per-spawn env to `{ PATH }` (sub-task 35 decision).
- [x] Audit on-host call sites (workspace init, persisted-config
  reader, fts5 search index) and confirm they still see the host path
  via the launcher's `env` snapshot, not the rewritten value.
  - Likely chokepoints: workspace-init helper, `.genie/config.json`
    loader, fts5 backend's index path resolution.

  Audit results (`grep -nE 'process\.env\.GENIE_WORKSPACE|GENIE_WORKSPACE'
  packages/genie/src packages/genie/main.js`):
  - `main.js` `make()` reads `env.GENIE_WORKSPACE` from the launcher
    `env` argument (NOT `process.env`) at line 1779 and binds the
    host path into the local `workspace` constant before the rewrite
    can fire; that constant becomes `config.workspace` →
    `runRootAgent`'s `workspaceDir` parameter, which is the only
    workspace handle threaded into every on-host site.
  - `initWorkspace(workspaceDir)` (`runRootAgent` line ≈ 1355) runs
    BEFORE the slice mint and the rewrite — even if it ran after,
    its argument is the captured local, not `process.env`.  ✓
  - `loadPersistedConfig(workspace)` in `resolveBootMode` (≈ 1809)
    runs inside the IIFE before `runRootAgent` is invoked, so
    `process.env.GENIE_WORKSPACE` is still the host path; the
    primordial-mode re-read (`loadPersistedConfig(workspaceDir)` at
    ≈ 1645) and the piAgent-mode `savePersistedConfig(workspaceDir,
    …)` at ≈ 1601 / 1738 likewise consume the captured local.  ✓
  - `makeFTS5Backend({ dbDir: workspaceDir })` inside `buildTools`
    consumes the parameter (the captured local).  ✓
  - `makeFileTools({ root: workspaceDir })` and `makeMemoryTools
    ({ root: workspaceDir, ... })` in `buildGenieTools`
    (`packages/genie/src/tools/registry.js` lines 219 / 226) likewise
    consume the threaded parameter, not `process.env`.  ✓
  - The only other `process.env.GENIE_WORKSPACE` references in the
    repo are documentation strings in `TADA/10_genie_self.md` and
    `TADA/12_genie_self_setup_launcher.md` describing how `setup.js`
    forwards the launcher's value — not a runtime read.

  Conclusion: the rewrite is purely defence-in-depth.  No current
  on-host call site reads `process.env.GENIE_WORKSPACE`; all of them
  go through the captured `workspaceDir` local sourced from the
  launcher's `env` argument.  The rewrite covers a future tool /
  third-party module that might read `process.env.GENIE_WORKSPACE`
  while running inside the worker so it sees the same view a
  spawn-through-slice child does.
- [x] Document the two views and the boundary in
  `packages/genie/CLAUDE.md` (covered by
  [`41_endo_genie_sandbox_docs.md`](./41_endo_genie_sandbox_docs.md)).
  In-source documentation lives in `main.js`'s mint block as a
  `// ── In-process GENIE_WORKSPACE rewrite ──` comment that names
  every on-host call site and explains why the missing-slice path
  intentionally does NOT rewrite; the operator-facing prose in
  `CLAUDE.md` is the responsibility of sub-task 41.

Depends on:
[`34_endo_genie_sandbox_main_wiring.md`](./34_endo_genie_sandbox_main_wiring.md).

## Status

- 2026-04-30: Landed.  `runRootAgent` now passes
  `env: { GENIE_WORKSPACE: '/workspace' }` and `cwd: '/workspace'`
  into `E(factory).makePersistent(...)` so the bwrap driver bakes
  the slice-internal view into every spawn, and rewrites
  `process.env.GENIE_WORKSPACE` to `/workspace` immediately after the
  mint resolves (slice-mint success branch only — missing-cap and
  mint-failure paths leave the host path in place for the host-spawn
  fallback).  On-host call sites audited: every one of them
  (`initWorkspace`, `loadPersistedConfig`, `savePersistedConfig`,
  `makeFTS5Backend`, `makeFileTools`, `makeMemoryTools`) consumes the
  captured `workspaceDir` local sourced from the launcher's `env`
  argument, not `process.env`, so the host view survives the
  rewrite.  Operator-facing CLAUDE.md prose deferred to sub-task 41.
  `node --check packages/genie/main.js` passes; the genie package's
  pre-existing lint backlog is unchanged by this edit.
