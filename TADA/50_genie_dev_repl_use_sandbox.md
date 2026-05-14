# Genie dev-repl: route tools through `@endo/sandbox`

Bring the dev-repl in line with the daemon-hosted genie's sandbox
slice integration (see `packages/genie/CLAUDE.md` § "Spawning rules"
and TADA/40 ff.) so `bash` / `exec` / `git` run inside a confined
slice rather than directly on the host kernel.

- [x] design and plan changes to `packages/genie/dev-repl.js` to make
  it also use a sandboxed workspace and tools; write follow `TODO/`
  tasks to implement this plan

## How `main.js` uses `@endo/sandbox` today

`packages/genie/main.js`'s `runLoop` looks up two host-introduced
caps under fixed pet names (set up by `setup.js`):

| Pet name in genie guest | Origin                                                        |
| ----------------------- | ------------------------------------------------------------- |
| `workspace`             | `E(host).provideMount(GENIE_WORKSPACE, 'workspace-mount')`    |
| `sandboxes`             | `E(host).makeUnconfined('@main', '@endo/sandbox/agent.js', …)` |

Both are optional during the rollout — when either is missing, the
agent falls through to direct host spawning with a warning logged.

`spawnAgent` then assembles the per-agent slice:

1. Validates form input (`backend`, `network`, `rootfs`) against
   `ALLOWED_BACKENDS` / `ALLOWED_NETWORK_PROFILES` / `ALLOWED_ROOTFS_KINDS`.
2. Resolves `rootfs` via `parseRootfsValue` (host-bind / minimal /
   `oci:<ref>` / pet-name → Mount cap), with cross-validation against
   the backend selector via `assertRootfsBackendCompatible`.
3. Probes backends via `E(sandboxFactory).listBackends()` and refuses
   to start when no backend is available (PLAN § "Security boundary
   clarity" — explicit confinement, no implicit relaxation).
4. Calls `E(sandboxFactory).make({ rootfs, mounts: [{ cap:
   workspaceMount, innerPath: SLICE_WORKSPACE_PATH, mode: 'rw' }],
   network, env, cwd: SLICE_WORKSPACE_PATH, backend })`.
5. Wraps the resulting `SandboxHandle` in `makeSandboxSpawner({ handle })`
   from `src/tools/sandbox-spawner.js` and threads the spawner into
   `buildGenieTools({ workspaceDir, spawner, workspaceMount, … })`.
6. Wires slice teardown to the agent's `cancelledP` (bwrap subprocess
   and scratch upper layer reclaimed on cancellation, before GC).

The slice's `cwd: '/workspace'` view and the daemon-side tools'
`workspaceDir` host path land on the same bytes (the slice's
bind-mount mirrors the host directory), so file / memory / web tools
that still run daemon-side stay in lockstep with the slice's view.

## What the dev-repl needs to do differently

`dev-repl.js` runs **outside** the daemon:

- It has no `host-agent` and no `provideMount` / `provideHostPath`
  capability; it owns its workspace as an ambient host path.
- It already imports `@endo/init/debug.js` so SES is locked down,
  `harden` / `makeExo` / `E` work, and the same `makeBwrapDriver` /
  `makePodmanDriver` constructors `agent.js` registers can be wired
  in-process.
- It currently builds `genieTools` with `include: ['bash', 'exec',
  'git', 'files', 'memory', 'webFetch', 'webSearch']` and **no**
  spawner / no workspaceMount, so command tools fall through to the
  host spawner baked into `command.js`.

The integration shape that mirrors `main.js` without a daemon:

- Build an **in-process `SandboxPowers`** modeled on the
  `makeStubScratchProvider` fixture in
  `packages/sandbox/test/bwrap.test.js`:
  - `provideScratchMount(petName)` mints a fresh `fs.mkdtemp` and
    returns a Mount-shaped exo;
  - `provideHostPath(cap)` resolves via a `WeakMap<cap, hostPath>`;
  - tracks the tmpdirs it creates so `.exit` can rm-rf them.
- Build a **workspace Mount cap** from the dev-repl's host workspace
  path using the same stub-Mount surface, so it can be passed into
  `factory.make({ mounts: [{ cap, innerPath: '/workspace', mode: 'rw' }] })`.
- Construct the factory directly: `makeSandboxFactory({ drivers:
  [bwrap, podman], scratchProvider: stubPowers })`.
- Probe via `listBackends()` and decide based on availability +
  user CLI selection.
- When a backend is available, mint the slice with the workspace
  Mount cap, build a `Spawner` via `makeSandboxSpawner({ handle })`,
  and pass the spawner (and the same Mount cap as `workspaceMount`)
  into `buildGenieTools` — exactly the shape `main.js` uses.
- When no backend is available, log a clear warning and continue
  with the existing host-spawn path (the dev-repl is also the
  development affordance for non-Linux contributors).
- On `.exit` / EOF / SIGINT, `E(slice).dispose()` and rm-rf the
  scratch tmpdirs.

CLI surface (new flags; defaults match the daemon path):

| Flag                     | Values                                                 | Default     |
| ------------------------ | ------------------------------------------------------ | ----------- |
| `--sandbox <selector>`   | `auto` \| `bwrap` \| `podman` \| `off`                 | `auto`      |
| `--network <profile>`    | `none` \| `private` \| `host-loopback` \| `host-lan` \| `host-net` | `private` |
| `--rootfs <kind>`        | `host-bind` \| `minimal` \| `oci:<ref>`                | `host-bind` |

`--sandbox off` short-circuits the slice-mint path entirely (legacy
direct host spawn).  `auto` falls back to host spawning when no
backend is available, with a one-line warning so the user sees why.

## Refactoring opportunity

A meaningful slice of `spawnAgent` is sandbox-specific (not
daemon-specific): the probe / validation / mint / dispose sequence
that consumes `parseRootfsValue` and `assertRootfsBackendCompatible`.
Extracting a shared helper avoids duplicating ~80 lines of validation
and error wording between `main.js` and `dev-repl.js`, and keeps
future knobs (e.g. resource `limits`) in one place.

## Sub-tasks

The integration breaks down into focused TODO files, in dependency
order:

| File | Scope |
| ---- | ----- |
| [`51_genie_dev_repl_local_sandbox_powers.md`](./51_genie_dev_repl_local_sandbox_powers.md) | Daemon-free `SandboxPowers` stub usable by `dev-repl.js` (and any future host-only caller).  Lives in `packages/genie/src/sandbox/local-powers.js`. |
| [`52_genie_dev_repl_slice_factory_helper.md`](./52_genie_dev_repl_slice_factory_helper.md) | Extract the probe + validate + mint + dispose sequence from `main.js`'s `spawnAgent` into a shared helper consumed by both `main.js` and `dev-repl.js`. |
| [`53_genie_dev_repl_sandbox_wiring.md`](./53_genie_dev_repl_sandbox_wiring.md) | Wire the local `SandboxPowers` + slice helper into `dev-repl.js`; add `--sandbox` / `--network` / `--rootfs` CLI knobs; route the `Spawner` and `workspaceMount` cap through `buildGenieTools`. |
| [`54_genie_dev_repl_sandbox_dispose.md`](./54_genie_dev_repl_sandbox_dispose.md) | Wire slice / tmpdir teardown for `.exit`, EOF, and SIGINT / SIGTERM so the bwrap subprocess and scratch upper layer are reclaimed on every exit path. |
| [`55_genie_dev_repl_sandbox_test.md`](./55_genie_dev_repl_sandbox_test.md) | Integration test that drives the dev-repl via `-c` and verifies `bash` runs inside the slice (via `mount` / `id` / `/proc/1/status` probes), skipping cleanly when no backend is available. |
| [`56_genie_dev_repl_sandbox_docs.md`](./56_genie_dev_repl_sandbox_docs.md) | Update `packages/genie/README.md` (operator-facing flags) and `packages/genie/CLAUDE.md` (contributor view of the dev-repl's local-powers seam). |

## Critical path

Land in this order to keep each step independently mergeable:

1. **51** — local powers utility lands as a no-op (no consumer yet).
2. **52** — refactor `main.js` to use the shared slice helper; the
   daemon's behaviour is unchanged but the helper is now reusable.
3. **53** + **54** — together turn on slice routing in `dev-repl.js`.
4. **55** — integration test gates the rollout (mirrors
   `test:integration:sandbox-slice` for the daemon path).
5. **56** — docs follow the test landing.

## Non-goals

- Replicating the daemon's per-agent identity / pet namespace.  The
  dev-repl is a single-process REPL; the workspace Mount cap is owned
  by the REPL itself.
- Cross-OS sandbox support beyond what `@endo/sandbox` already ships
  (Linux + bwrap / podman in v1).  Other platforms keep falling
  through to the host spawn path with a one-line warning.
- Restoring conversation history across runs (already a separate
  TODO in `dev-repl.js`).
- Replacing the host spawner.  The slice is opt-in; the host spawner
  remains the fallback so non-Linux contributors and CI on macOS keep
  working.
