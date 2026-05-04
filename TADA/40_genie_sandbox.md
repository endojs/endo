# Genie + Sandbox integration (umbrella)

- [x] review `TADA/10_endo_posix_sandbox.md` and the current state of
  `packages/genie/`

- [x] plan and create `TODO/` tasks to implement the genie integration
  of the current `packages/sandbox/` plugin to isolate the genie
  workspace

## Review summary

The sandbox plugin (`packages/sandbox/`) has Phases 0, 1, 1.5, and 2
landed:

- typed `SandboxFactory` / `SandboxHandle` / `ProcessHandle` /
  `MountHandle` interfaces with `M.interface()` guards,
- a `bwrap` driver on Linux with `none` / `private` / `host-*`
  network profiles, scratch-mount-backed writable upper layer,
  `prlimit` resource caps, Landlock and cgroup v2 detection, and a
  rebased seccomp profile,
- a rootless `podman` driver with OCI image rootfs and
  `slirp4netns` / `pasta` rootless networking,
- factory-side cap-to-path resolution via a `provideHostPath` power
  the caller currently has to supply (the daemon does not yet ship
  it out of the box).

The genie package (`packages/genie/`) wires its workspace as a string
path:

- `setup.js` provisions the genie guest with one introduced name
  (`@agent` → `host-agent`) and passes `GENIE_WORKSPACE` as a string
  via the configuration form,
- `main.js`'s `spawnAgent` introduces `workspace-mount` opportunistically
  (when present on the host agent) but does not yet mint a sandbox slice,
- `tools/command.js`'s `bash` / `exec` / `git` tools call
  `child_process.spawn` directly — there is no spawner abstraction
  the daemon could swap for `slice.spawn`,
- `dev-repl.js` runs the same tools without a slice, by design.

The `PLAN/endo_posix_sandbox.md` "Genie integration shape" section is
already opinionated about how this ties together: the genie's workspace
becomes a `Mount` granted to a `SandboxHandle`, and `bash` / `exec` /
`git` spawn through that handle so existing tools execute under
confinement transparently.

## Sub-tasks

The integration breaks down into the following focused TODO files,
roughly in dependency order.

| File | Scope |
| ---- | ----- |
| [`41_genie_sandbox_provide_host_path.md`](./41_genie_sandbox_provide_host_path.md) | Daemon-side `provideHostPath` wiring so the sandbox factory can resolve a `Mount` cap to a host path without a per-caller stub. |
| [`42_genie_sandbox_factory_powers.md`](./42_genie_sandbox_factory_powers.md) | Mint a `SandboxFactory` and a workspace `Mount` in `setup.js`; introduce both into the genie guest as `sandboxes` / `workspace`. |
| [`43_genie_sandbox_spawner_power.md`](./43_genie_sandbox_spawner_power.md) | Refactor `tools/command.js` around an injectable `Spawner`; ship a default host spawner and a slice-backed adapter. |
| [`44_genie_sandbox_workspace_slice.md`](./44_genie_sandbox_workspace_slice.md) | Mint a per-agent slice in `spawnAgent`, route the slice into `buildGenieTools`, surface `backend` / `network` knobs, dispose on cancellation. |
| [`45_genie_sandbox_integration_test.md`](./45_genie_sandbox_integration_test.md) | End-to-end integration scenario proving `bash` runs inside the slice, with a clean skip when `bwrap` is absent. |
| [`46_genie_sandbox_fork_children.md`](./46_genie_sandbox_fork_children.md) | Deferred follow-up: route child agents through `slice.fork()` once sandbox Phase 3 lands. |
| [`47_genie_sandbox_docs.md`](./47_genie_sandbox_docs.md) | Operator-facing docs: README, DESIGN, CLAUDE.md, failure-mode cookbook. |

## Critical path

Land in this order to keep each step independently mergeable:

1. **41** (daemon `provideHostPath`) unblocks every consumer of the
   sandbox plugin without touching the genie.
2. **43** (spawner abstraction) lands as a no-op refactor in the genie
   — host spawner stays the default, dev-repl unchanged.
3. **42** (factory + workspace mount in setup) and **44** (slice in
   `spawnAgent`) land together; **42** alone has no observable effect
   because nothing yet consumes `sandboxes`.
4. **45** (integration test) gates the rollout.
5. **47** (docs) follows the test landing.
6. **46** (sub-slice fork) waits on sandbox Phase 3.

## Non-goals

Out of scope for this umbrella, captured here so they do not creep in:

- Replacing the existing `bash` / `exec` / `git` tools with new
  `sandbox.spawn` / `sandbox.exec` tools.
  The integration is a workspace swap, not a tool-surface rewrite —
  see [`PLAN/endo_posix_sandbox.md`](../PLAN/endo_posix_sandbox.md)
  § "Genie integration shape".
- Familiar / Electron renderer access to the sandbox plugin.
  Deferred per the same plan document.
- Cross-OS support.
  Linux + bwrap (and podman) only in v1; macOS / Windows arrive with
  sandbox Phases 4–6.
- Shipping a rootfs.
  Genie uses `rootfs: { kind: 'host-bind' }` in v1; OCI rootfs is a
  caller-driven opt-in via the podman backend.
