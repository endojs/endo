# Genie sandbox — heartbeat / observer / reflector continuity check

Sub-task of
[`TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md`](../TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md)
§ "Deliverables" — _Heartbeat / observer / reflector continuity_.

Verify that the `runHeartbeatTicker` self-send path
(`E(agentGuest).send('@self', …)`) and the observer / reflector
pi-agent calls work unchanged when tool spawns route through the
slice.
None of these themselves touch the host filesystem; they should be
invariant under the change, but the check is cheap and the regression
risk is non-zero (e.g. a side path that reads the rewritten
`GENIE_WORKSPACE` from
[`36_endo_genie_sandbox_workspace_path.md`](./36_endo_genie_sandbox_workspace_path.md)).

- [ ] Run the existing heartbeat / observer / reflector tests with the
  3.5a wiring active.
- [ ] If any of them grew an implicit dependency on host paths,
  add a regression test that pins the slice-internal vs host
  distinction (e.g. observer reads MEMORY.md from the host view, not
  through the slice).

Depends on:
[`35_endo_genie_sandbox_tool_spawn.md`](./35_endo_genie_sandbox_tool_spawn.md),
[`36_endo_genie_sandbox_workspace_path.md`](./36_endo_genie_sandbox_workspace_path.md).
