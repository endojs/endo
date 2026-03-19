# Genie sandbox — workspace `Mount` provisioning

Sub-task of
[`TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md`](../TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md)
§ "Deliverables" — _Workspace `Mount` provisioning_.

Update `packages/genie/setup.js` (or its successor) to ensure a
`workspace-mount` `Mount` capability exists for `GENIE_WORKSPACE` and
is pinned in the host agent's pet store.
Reuses the daemon's existing `provideMount` /
`provideScratchMount` plumbing
(`packages/daemon/src/host.js:253` and `:274`) — no new mount
primitive.

- [x] Resolve `GENIE_WORKSPACE` from `env` setup-side.
- [x] Call `E(hostAgent).provideMount(GENIE_WORKSPACE, 'workspace-mount', { readOnly: false })`.
- [x] Make the call idempotent on re-run, mirroring the existing
  `has('main-genie')` short-circuit pattern.
- [x] Verify the daemon reincarnates the mount on restart without
  operator intervention (uses existing `Mount` formula reincarnation).

Depends on: nothing new (uses today's daemon surface).

Blocks: `32_endo_genie_sandbox_factory_register.md`,
`34_endo_genie_sandbox_main_wiring.md`.

## Status

- 2026-04-30: Landed in `packages/genie/setup.js` —
  `setup.js` now validates `GENIE_WORKSPACE` setup-side (loud
  `makeError` when unset), guards on `has('workspace-mount')`, and
  pins the workspace via `E(hostAgent).provideMount(workspace,
  'workspace-mount', { readOnly: false })` before the existing
  `makeUnconfined('@main', …)` call.
  The pet name is hoisted to a `WORKSPACE_MOUNT_NAME` constant so
  `main.js` (sub-task 34) can import a single source of truth when
  it threads the cap into the sandbox slice.
  Mount reincarnation on daemon restart is handled by the daemon's
  existing `Mount` formula plumbing
  (`packages/daemon/src/host.js:253` →
  `packages/daemon/src/daemon.js:2897` `formulateMount`); no new
  reincarnation hook needed — the pet store re-resolves
  `workspace-mount` to the persisted formula and the daemon
  re-mints the live exo on first deref, so the
  `has('workspace-mount')` guard short-circuits subsequent
  `setup.js` runs after a restart too.
  `node --check` passes; no module-loading test possible without a
  running daemon (SES `harden` is daemon-supplied, see top-level
  CLAUDE.md § "Build and Test").
