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

- [ ] Resolve `GENIE_WORKSPACE` from `env` setup-side.
- [ ] Call `E(hostAgent).provideMount(GENIE_WORKSPACE, 'workspace-mount', { readOnly: false })`.
- [ ] Make the call idempotent on re-run, mirroring the existing
  `has('main-genie')` short-circuit pattern.
- [ ] Verify the daemon reincarnates the mount on restart without
  operator intervention (uses existing `Mount` formula reincarnation).

Depends on: nothing new (uses today's daemon surface).

Blocks: `32_endo_genie_sandbox_factory_register.md`,
`34_endo_genie_sandbox_main_wiring.md`.
