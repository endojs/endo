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

- [x] In `packages/genie/setup.js`, after `provideMount`, call
  `E(hostAgent).makeUnconfined('@agent', sandboxAgentSpecifier, {
  powersName: '@agent', resultName: 'sandbox-factory' })`.
  - The plugin entry point is `packages/sandbox/src/agent.js`
    (already exports the `make(powers, context, { env })` shape).
  - Implemented at `packages/genie/setup.js` lines 112–130; the
    specifier is resolved via `new URL('../sandbox/src/agent.js',
    import.meta.url).href` (lines 24–27) so the launcher never
    statically imports `@endo/sandbox`.
- [x] Idempotent on re-run via the same `has('sandbox-factory')`
  short-circuit pattern.
  - The pet name is centralised as `SANDBOX_FACTORY_NAME =
    'sandbox-factory'` (lines 47–57) so the launcher and `main.js`
    cannot drift; the guard at line 120 short-circuits when the
    formula is already pinned.
- [x] Confirm the resulting `SandboxFactory` ref survives daemon
  restart (formula-pinned via `make-unconfined`).
  - `makeUnconfined` synthesises a `make-unconfined` formula that the
    daemon reincarnates on bounce, so the `sandbox-factory` ref is
    available to `main.js` at boot without re-running `setup.js`.

Depends on: `31_endo_genie_sandbox_workspace_mount.md` (done).

Blocks: `34_endo_genie_sandbox_main_wiring.md`.

## Status

Done — the launcher pins the `@endo/sandbox` agent under the
`sandbox-factory` pet name once the workspace mount is in place, and
the registration is idempotent across re-runs and daemon restarts.
