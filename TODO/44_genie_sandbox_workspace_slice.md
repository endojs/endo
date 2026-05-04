# Genie: mint a workspace slice in `spawnAgent`

Sub-task of [`40_genie_sandbox.md`](./40_genie_sandbox.md).

Once the genie guest receives a `SandboxFactory` and a workspace
`Mount` (see
[`42_genie_sandbox_factory_powers.md`](./42_genie_sandbox_factory_powers.md))
and the tool registry accepts an injected spawner (see
[`43_genie_sandbox_spawner_power.md`](./43_genie_sandbox_spawner_power.md)),
`main.js`'s `spawnAgent` must mint one slice per agent and route the
agent's tools through it.

## Deliverables

- [ ] **Mint a slice per `spawnAgent` call.**
  After looking up `sandboxes` and `workspace`, call:
  ```js
  const slice = await E(sandboxes).make({
    rootfs: { kind: 'host-bind' },
    mounts: [
      { cap: workspace, innerPath: '/workspace', mode: 'rw' },
    ],
    network: 'private',
    cwd: '/workspace',
  });
  ```
  - Pin the handle on the agent's lifetime (closure capture is enough;
    GC on the agent's formula tears the slice down).
  - On agent cancellation (`cancelledP` resolves), call
    `E(slice).dispose()` so the bwrap subprocess and scratch upper
    layer are reclaimed promptly even before the GC sweep.

- [ ] **Backend selection and fallback.**
  Accept an optional `backend` field on the `AgentConfig` form
  (default `'auto'`).
  When `listBackends()` reports nothing available, log a clear
  warning and refuse to start the agent rather than silently falling
  back to direct host spawning — the operator should see the slice
  failure explicitly.

- [ ] **Network-profile knob.**
  Expose `network` on the form (default `'private'`).
  Reject unknown profiles up-front rather than passing them through
  to the factory (the factory rejects them too, but a form-side check
  produces a friendlier error to the user).

- [ ] **Thread the slice into the tool registry.**
  Pass the slice-backed spawner from
  [`43_genie_sandbox_spawner_power.md`](./43_genie_sandbox_spawner_power.md)
  into `buildGenieTools({ ..., spawner: makeSliceSpawner(slice) })`.
  - `workspaceDir` for daemon-side fs / memory tools stays the host
    path so `fs.readFile` keeps working.
  - The slice's `cwd: '/workspace'` is what `bash`/`exec`/`git` see;
    `command.js` should not hard-code the host path inside its env
    pass-through.

- [ ] **`initWorkspace` ordering.**
  Confirm that `initWorkspace(workspaceDir)` still runs against the
  host path before the slice is minted.
  The slice exposes those seed files via the `Mount` (the daemon-side
  copy lands on the same bytes the slice sees), so no slice-internal
  `cp` is needed.

- [ ] **Slice-aware `ready` message.**
  Extend the "Genie agent ready" message to include backend and
  network so operators can grep for which slice mode is in effect:
  ```
  Genie agent ready (model: ..., workspace: /workspace, backend: bwrap,
                     network: private, heartbeat: 30s).
  ```

- [ ] **Refuse to start without a slice when one was configured.**
  If `setup-genie` minted a `sandbox-factory`, an agent that fails to
  obtain a slice must error out — not fall back to direct spawning.
  This preserves the "explicit confinement, no implicit relaxation"
  rule from PLAN § "Security boundary clarity".

## Status notes

- The dev-repl path (`packages/genie/dev-repl.js`) should continue to
  work without a slice for fast local iteration; the slice is
  daemon-only in v1.
  The repl already uses the host spawner from
  [`43`](./43_genie_sandbox_spawner_power.md); no change required.
- `fork()` for child agents lands separately in
  [`46_genie_sandbox_fork_children.md`](./46_genie_sandbox_fork_children.md);
  for now child agents inherit a fresh top-level slice each.

## Cross-references

- [`packages/genie/main.js`](../packages/genie/main.js) §
  `spawnAgent`.
- [`packages/sandbox/src/factory.js`](../packages/sandbox/src/factory.js)
  § `make()` / `dispose()`.
- [`PLAN/endo_posix_sandbox.md`](../PLAN/endo_posix_sandbox.md)
  § "Genie integration shape".
