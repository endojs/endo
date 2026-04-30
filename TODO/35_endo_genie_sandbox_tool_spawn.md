# Genie sandbox — re-route tool spawn through the slice

Sub-task of
[`TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md`](../TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md)
§ "Deliverables" — _Tool spawn channel_.

The single host `child_process.spawn` chokepoint at
`packages/genie/src/tools/command.js:346` (used by `bash` / `exec` /
`git`) becomes `E(slice).spawn([exe, ...spawnArgs], { cwd, env })`.
The agent-visible result-shape contract
(`{ success, command, stdout, stderr, exitCode, path? }`) is preserved.

- [ ] `makeCommandTool`'s factory grows a `slice` parameter; tool-
  registry construction in `main.js` passes the freshly-minted handle
  through (depends on
  [`34_endo_genie_sandbox_main_wiring.md`](./34_endo_genie_sandbox_main_wiring.md)).
- [ ] Replace the `spawn(exe, spawnArgs, …)` call at line 346 with
  `E(slice).spawn([exe, ...spawnArgs], { cwd, env })`.
- [ ] Adapt the existing tool stdio plumbing onto the slice's
  `ProcessHandle.stdin / stdout / stderr` `reader-ref` /
  `writer-ref` adapters.
  - Collect streams into the same buffers the current code uses.
  - Verify byte-stream fidelity (no UTF-8 / netstring corruption).
- [ ] Confirm no other `child_process.spawn` call site exists in the
  genie source tree (re-check on implementation; today the chokepoint
  is the only one).
- [ ] Tool surface visible to the agent does not change.

Depends on:
[`34_endo_genie_sandbox_main_wiring.md`](./34_endo_genie_sandbox_main_wiring.md).

Blocks:
[`38_endo_genie_sandbox_heartbeat_continuity.md`](./38_endo_genie_sandbox_heartbeat_continuity.md),
[`40_endo_genie_sandbox_tests.md`](./40_endo_genie_sandbox_tests.md).
