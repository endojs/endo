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
[`TADA/36_endo_genie_sandbox_workspace_path.md`](../TADA/36_endo_genie_sandbox_workspace_path.md)).

- [x] Run the existing heartbeat / observer / reflector tests with the
  3.5a wiring active.
  Ran `npx corepack yarn run test` from `packages/genie` against the
  current `main` (3.5a wiring shipped in
  [`TADA/35_…`](../TADA/35_endo_genie_sandbox_tool_spawn.md) /
  [`TADA/36_…`](../TADA/36_endo_genie_sandbox_workspace_path.md)).
  All 402 tests pass, including the dedicated host-view pin
  `heartbeat › runHeartbeat writes .heartbeats.log to the host
  workspaceDir, not process.env.GENIE_WORKSPACE` and the full
  observer / reflector unit suites
  (`packages/genie/test/{heartbeat,observer,reflector}.test.js`),
  the `loop › agents` makeGenieAgents wiring assertions, and the
  `loop › builtin-specials` `/observe` / `/reflect` dispatch
  coverage.
- [x] If any of them grew an implicit dependency on host paths,
  add a regression test that pins the slice-internal vs host
  distinction (e.g. observer reads MEMORY.md from the host view, not
  through the slice).
  None of them did.  Audit results below; no new test required
  beyond the existing `test/heartbeat.test.js` host-view pin (already
  shipped alongside the workspace-path rewrite, see TADA/36 § audit).

## Audit

Verified by `Grep` for `process\.env\.GENIE_WORKSPACE` /
`workspaceDir` / `GENIE_WORKSPACE` across `packages/genie/src` plus
`packages/genie/main.js`'s `runHeartbeatTicker`:

- `runHeartbeatTicker` (`main.js:504`) reads `workspaceDir` only as
  the captured parameter sourced from `runRootAgent`'s
  `config.workspace` local (host path from the launcher's `env`
  snapshot), and computes `intervalsDir = join(workspaceDir,
  '.genie', agentName, 'intervals')` against that host path.
  The `E(agentGuest).send('@self', [`/heartbeat ${tickID}`], [], [])`
  self-send rides CapTP and never touches the filesystem; the slice
  cannot interpose on it.
- `src/interval/scheduler.js` consumes the `persistDir` parameter
  passed in by the ticker; it never reads
  `process.env.GENIE_WORKSPACE`.
- `src/heartbeat/index.js` consumes the `workspaceDir` parameter
  passed in by `runHeartbeat`'s caller (the loop's `runHeartbeat`
  handler in `runRootAgent`); it writes `.heartbeats.log` and reads
  `.git/` against that host path.
  This is the contract the existing
  `test/heartbeat.test.js` regression test pins by setting
  `process.env.GENIE_WORKSPACE = '/workspace'` and asserting the log
  still lands at the supplied host `workspaceDir`.
- `src/observer/index.js` and `src/reflector/index.js` consume
  `workspaceDir` only as a constructor parameter, and forward it to
  `makePiAgent({ workspaceDir, ... })` so the sub-agent's prompt
  context names the host workspace.
  Neither module performs its own `fs` read or write keyed on
  `workspaceDir`; both delegate disk-touching work to the
  `memoryGet` / `memorySet` / `memorySearch` tools and the shared
  `searchBackend` (constructed against the captured `workspaceDir`
  in `buildTools`, so its host view is fixed at construction time
  and is invariant under the slice rewrite).
- `src/loop/agents.js` (`makeGenieAgents`) threads the captured
  `workspaceDir` straight into `makePiAgent` for the main /
  heartbeat agents and into `makeObserver` / `makeReflector` for
  the memory sub-agents.
  No `process.env` read.

Conclusion: the heartbeat / observer / reflector pack reads
`workspaceDir` only via captured parameters sourced from the
launcher's `env` snapshot, never via `process.env.GENIE_WORKSPACE`.
The 3.5a in-process rewrite of `process.env.GENIE_WORKSPACE` to
`/workspace` (per TADA/36) is therefore invisible to this pack — its
host view is captured before the rewrite fires and stays attached to
the host filesystem.
The existing `test/heartbeat.test.js` pin is sufficient regression
coverage; a parallel observer / reflector pin would only assert
"this module does not touch `process.env`," which the audit grep
already establishes.

Depends on:
[`TADA/35_endo_genie_sandbox_tool_spawn.md`](../TADA/35_endo_genie_sandbox_tool_spawn.md),
[`TADA/36_endo_genie_sandbox_workspace_path.md`](../TADA/36_endo_genie_sandbox_workspace_path.md).

## Status

- 2026-05-01: Audited, ran the existing test suite (402/402 passing),
  and confirmed the heartbeat / observer / reflector pack is
  invariant under the slice-internal `GENIE_WORKSPACE` rewrite.
  No new regression test required: the existing
  `test/heartbeat.test.js` host-view pin already covers the only
  module in the pack that writes to `workspaceDir` directly
  (`runHeartbeat`'s `.heartbeats.log` write), and observer /
  reflector do not perform filesystem access keyed on
  `workspaceDir` at all.
  Moving to `TADA/`.
