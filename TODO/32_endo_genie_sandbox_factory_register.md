# Genie sandbox — `@endo/sandbox` factory registration in `setup.js`

Sub-task of
[`TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md`](../TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md)
§ "Deliverables" — _Sandbox plugin registration in `setup.js`_.

After the workspace mount is pinned, the launcher exposes the
`@endo/sandbox` plugin's `SandboxFactory` to the host agent under a
stable pet name so `main.js` can resolve it from `powers` without
threading a cap through `makeUnconfined`'s `env`
(decision 1 in TADA/22 — main-side minting; `MakeCapletOptionsShape`
has no `introducedNames` channel today).

- [ ] In `packages/genie/setup.js`, after `provideMount`, call
  `E(hostAgent).makeUnconfined('@agent', sandboxAgentSpecifier, {
  powersName: '@agent', resultName: 'sandbox-factory' })`.
  - The plugin entry point is `packages/sandbox/src/agent.js`
    (already exports the `make(powers, context, { env })` shape).
- [ ] Idempotent on re-run via the same `has('sandbox-factory')`
  short-circuit pattern.
- [ ] Confirm the resulting `SandboxFactory` ref survives daemon
  restart (formula-pinned via `make-unconfined`).

Depends on: `31_endo_genie_sandbox_workspace_mount.md`.

Blocks: `34_endo_genie_sandbox_main_wiring.md`.
