# Genie: provision a `SandboxFactory` and workspace `Mount`

Sub-task of [`40_genie_sandbox.md`](./40_genie_sandbox.md).

Today `setup.js` provisions the genie guest with a single introduced
name (`@agent` → `host-agent`) and a string `GENIE_WORKSPACE`.
For the workspace-as-slice integration, the genie guest needs:

1. A `Mount` capability rooted at the operator-supplied workspace
   directory (so `slice.mount(...)` accepts it).
2. A `SandboxFactory` capability minted from the `@endo/sandbox`
   plugin's `make-unconfined` entry point.

Both must be introduced into the genie guest's namespace so `main.js`
can look them up alongside `host-agent` and `workspace-mount`.

## Deliverables

- [x] **Mint the workspace mount in `setup.js`.**
  - Use `E(hostAgent).provideMount(workspacePath, 'workspace-mount')`
    (or the `provideMount` shape that ships at the time of
    implementation — confirm against
    [`packages/daemon/src/host.js`](../packages/daemon/src/host.js)).
  - Skip when the operator did not pass `GENIE_WORKSPACE`, so the
    legacy "workspace = host cwd, no slice" code path keeps working
    during rollout.
  - Idempotency: guard with `E(hostAgent).has('workspace-mount')` so
    daemon restarts do not re-mint.

- [x] **Mint the sandbox factory in `setup.js`.**
  - Pattern after the `lal` plugin's setup or the existing
    `makeUnconfined('@main', genieSpecifier, ...)` call —
    register the factory under a stable host-side pet name
    (e.g. `sandbox-factory`).
  - Idempotency guard via `E(hostAgent).has('sandbox-factory')`.
  - Decision: `setup.js` mints the factory inline via
    `E(hostAgent).makeUnconfined('@main', sandboxSpecifier, {
      powersName: '@agent', resultName: 'sandbox-factory' })`,
    so a fresh `endo run setup.js` fully bootstraps the integration.

- [x] **Introduce both into the genie guest.**
  - `setup.js` builds the `introducedNames` map dynamically, mapping
    `'workspace-mount' → 'workspace'` and
    `'sandbox-factory' → 'sandboxes'` whenever the corresponding host
    cap is present (so rollouts that skip `GENIE_WORKSPACE` still work).
  - `main.js`'s `spawnAgent` mirrors the same mapping when forking
    child agents, so children see the same names regardless of who
    spawned them.

- [x] **Update `main.js` to look up both caps.**
  - `runLoop` now resolves `host-agent`, `workspace`, and `sandboxes`.
    Each of the latter two is wrapped in a structured-error fallback
    via `@endo/errors`'s `makeError` / `q` / `X` so partial rollouts
    log a clear warning instead of silently dropping back to direct
    host spawning.
  - The resolved values are deliberately retained as `void` for now;
    [`43_genie_sandbox_spawner_power.md`](./43_genie_sandbox_spawner_power.md)
    and [`44_genie_sandbox_workspace_slice.md`](./44_genie_sandbox_workspace_slice.md)
    will thread them through to `spawnAgent`.

- [x] **Document the new env-var contract in `setup.js`'s header
  comment** and in
  [`packages/genie/README.md`](../packages/genie/README.md).
  - `GENIE_WORKSPACE` continues to be a host filesystem path (the
    workspace directory the daemon mounts).
  - Added a note in the README that the workspace contents become
    reachable inside the slice at the slice-internal path
    (`/workspace`); see
    [`44_genie_sandbox_workspace_slice.md`](./44_genie_sandbox_workspace_slice.md)
    for the cwd plumbing.

## Status notes

- Depends on
  [`41_genie_sandbox_provide_host_path.md`](./41_genie_sandbox_provide_host_path.md)
  for the factory to actually resolve the mount cap, but the
  introduction wiring itself can land first.
- The `agentDirectory` config field stays unchanged; child-agent
  tracking uses the same pet namespace as before.
  Sub-slice `fork()` for child agents is tracked separately in
  [`46_genie_sandbox_fork_children.md`](./46_genie_sandbox_fork_children.md).

## Cross-references

- [`packages/genie/setup.js`](../packages/genie/setup.js).
- [`packages/genie/main.js`](../packages/genie/main.js)
  § `spawnAgent` / `runLoop` for the existing introducedNames pattern.
- [`packages/sandbox/README.md`](../packages/sandbox/README.md)
  § "Driver auto-registration".
- [`packages/daemon/CLAUDE.md`](../packages/daemon/CLAUDE.md)
  § "Guest Provisioning / introducedNames".
