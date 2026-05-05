# `@endo/genie` Contributor Conventions

This file collects the genie-specific conventions a future contributor
needs to know on top of the repo-root [`CLAUDE.md`](../../CLAUDE.md).
The repo-root file documents the SES / harden / @ts-check rules that
apply everywhere; the rules below are specific to the genie package
and especially to the **sandbox slice** integration.

The architecture lives in [`DESIGN.md`](./DESIGN.md) §
"Sandbox slice integration"; the operator-facing surface lives in
[`README.md`](./README.md) § "Sandboxed workspace".
This file is the implementer's lens on the same boundary.

## Spawning rules

### Never call `child_process.spawn` directly from a tool

The only place `child_process.spawn` is allowed is inside
[`src/tools/spawner.js`](./src/tools/spawner.js)'s `makeHostSpawner`.
Every command-style tool (`bash`, `exec`, `git`, anything that runs an
external program) must accept a `Spawner` and forward to it instead.

The reason is the slice integration: the daemon-hosted genie swaps
`makeHostSpawner` for `makeSandboxSpawner({ handle })` so the same
tool runs inside a `bwrap` slice instead of on the host kernel.
A tool that calls `child_process.spawn` inline silently bypasses the
slice and re-opens the exfiltration surface the sandbox is meant to
close.

```js
// ❌ Wrong — bypasses the slice:
import { spawn } from 'child_process';
const child = spawn('git', ['log']);

// ✅ Right — forwards to the slice when one is bound:
import { makeCommandTool } from './command.js';
const git = makeCommandTool({
  name: 'git',
  program: 'git',
  // spawner is injected by buildGenieTools; the tool body calls
  // `await spawner(argv, opts)` rather than child_process.
});
```

The lint that enforces this is informal — there is no ESLint rule for
it (yet) — so reviewers must check by hand when a new tool lands.
If you do need a new spawn-shaped tool, route it through
`makeCommandTool` (or add a sibling factory in `tools/command.js`)
so the `Spawner` seam is respected uniformly.

### Tools that need host fs access stay daemon-side

`readFile`, `writeFile`, `editFile`, `memory_get`, `memory_search`,
`webFetch`, `webSearch` all run inside the daemon worker, against the
**host** workspace path, not against the slice's view.
This is by design — the slice's bind-mount lands on the same bytes the
daemon-side tools see, so the two views stay in lockstep without
needing a CapTP round-trip per file read.

When a new daemon-side tool needs filesystem access:

- It must consume a **`Mount` capability**, not a raw host path.
  `setup.js` mints `workspace-mount` via
  `E(host).provideMount(GENIE_WORKSPACE, 'workspace-mount')` and
  introduces it into the genie guest as `workspace`; downstream tools
  resolve paths *under* that cap rather than accepting strings from
  the model.
- The cap-to-host-path resolution lives in `provideHostPath` on the
  daemon side (see
  [`packages/sandbox/README.md` § `SandboxPowers.provideHostPath`](../sandbox/README.md#sandboxpowersprovidehostpath)).
  Tool code never calls it directly; the sandbox factory does, when
  assembling a `SliceSpec`.
- Raw string paths from a tool argument are a code-review smell.
  If a tool truly needs to address something outside the workspace
  cap, mint a sibling cap on the host side and introduce it into the
  guest with its own pet name.

### `GENIE_WORKSPACE` is a host path; the slice's cwd is `/workspace`

`GENIE_WORKSPACE` is the **host** filesystem path the operator hands
to `setup.js`.
`setup.js` turns it into a `Mount` cap; `spawnAgent` in `main.js`
binds that cap to the slice-internal path `/workspace`.

Inside a slice, the agent's `bash` / `exec` / `git` tools see
`cwd: /workspace`, never the host path.
Inside the daemon worker, the daemon-side tools (`readFile`, etc.)
see the host path.

When writing a new tool or doc that mentions the workspace path,
remember which side of the fence you are on:

- Tool body that runs **inside the slice** (i.e. routed through the
  spawner): refer to `/workspace`.
- Tool body that runs **inside the daemon** (file / memory / web):
  refer to the operator-supplied `GENIE_WORKSPACE` path.

The mismatch is intentional — confusing the two would either leak the
host path into the slice's process environment or send the daemon
hunting for `/workspace` on its own filesystem.

## Capabilities the genie guest receives

`setup.js` introduces two host-side caps under fixed pet names:

| Pet name (in guest) | Origin                                                        | Consumer                          |
| ------------------- | ------------------------------------------------------------- | --------------------------------- |
| `workspace`         | `E(host).provideMount(GENIE_WORKSPACE, 'workspace-mount')`    | `spawnAgent` (bound to `/workspace`); also passed to daemon-side fs tools as the canonical workspace cap. |
| `sandboxes`         | `E(host).makeUnconfined('@main', '@endo/sandbox/agent.js', { powersName: '@agent', resultName: 'sandbox-factory' })` | `spawnAgent` calls `E(sandboxes).make({...})` to mint a `SandboxHandle` per agent. |

Both lookups in `main.js` are guarded with structured-error fallbacks
so a partial rollout (factory present but no workspace mount, or vice
versa) surfaces clearly rather than silently dropping back to direct
host spawning.

If you need an additional cap inside the genie guest, follow the same
shape: mint host-side in `setup.js`, gate behind `E(host).has(...)`
for idempotency, introduce under a stable pet name, and look it up by
that pet name in `main.js` with a structured error on miss.

## Testing protocol when you change the slice wiring

The slice integration spans three packages (`@endo/sandbox`,
`@endo/genie`, `@endo/daemon`).
A change in any one of them needs the chain re-validated.

### Quick path (every commit)

```sh
# Genie unit tests (spawners, command tool, memory, etc.)
cd packages/genie && npx ava

# Sandbox unit tests (factory, drivers, blocked ranges)
cd packages/sandbox && npx ava
```

These run on any OS and do not require `bubblewrap`.
They cover the spawner adapter, the `shell: true` translation, the
backend-agnostic factory contract, and the egress filter regression.

### Integration path (Linux + bubblewrap)

```sh
# Workspace tool scenario — daemon + setup.js + LLM round-trip.
cd packages/genie && yarn test:integration

# Sandbox slice scenario — verifies bash actually runs in a slice.
cd packages/genie && yarn test:integration:sandbox-slice
```

The `sandbox-slice` scenario boots a real Endo daemon, runs `setup.js`
with `GENIE_WORKSPACE=$tmpdir`, waits for the agent to announce
readiness, then asks the agent to probe its own bind mount, mount
table, host filesystem isolation, and network profile.
It is **Linux-only** and skips cleanly with `SKIP:` when
`bwrap --version` fails or the kernel rejects unprivileged user
namespaces.

When it skips on your machine, install bubblewrap and confirm the
kernel:

```sh
sudo apt install bubblewrap
bwrap --version
cat /proc/sys/kernel/unprivileged_userns_clone   # must be 1 on Debian
```

### Daemon-side checks

Slice-mint failures surface in two places:

1. **Daemon log** — `packages/daemon/tmp/<test>/state/worker/<id>/worker.log`.
   The log records every `E(sandboxes).make(...)` failure verbatim;
   check there first when a scenario hangs silently.
2. **Configuration form reply** — the agent guest sends
   `Error creating agent: …` back through the inbox.
   `endo inbox` shows it; the integration scenarios fail loudly with
   the same string.

Between runs, kill leftover daemons and clean state to avoid
slice-handle leaks across tests:

```sh
pkill -f "daemon-node.*packages/daemon/tmp"
rm -rf packages/daemon/tmp/ packages/genie/tmp/
```

### Cross-package coupling

When you change …

- `packages/sandbox/src/factory.js` (capability surface) — re-run the
  sandbox unit tests **and** the genie integration scenario, since
  `spawnAgent` exercises the factory contract end-to-end.
- `packages/genie/src/tools/spawner.js` or
  `sandbox-spawner.js` — re-run the genie unit tests; the host
  spawner has its own coverage and the sandbox spawner is exercised
  by `test:integration:sandbox-slice`.
- `packages/genie/main.js`'s `spawnAgent` — re-run both integration
  scenarios; the workspace-tool scenario covers the legacy
  direct-spawn path, the sandbox-slice scenario covers the slice
  path.
- `packages/genie/setup.js` — re-run `yarn test:integration` (the
  setup script is part of the integration boot sequence) and verify
  the `Minted workspace-mount` / `Minted sandbox-factory` log lines
  appear on a fresh daemon.

### When you add a new sandbox backend

If you wire a new driver (lima, containerization, wsl…) into
`@endo/sandbox` and want the genie to be able to select it:

1. Add the new name to `ALLOWED_BACKENDS` in
   [`packages/genie/main.js`](./main.js).
2. Update the form-field label string under `name: 'backend'` so
   operators see the new option.
3. Update the [`README.md`](./README.md) form-field table.
4. Add a scenario probe under `test/scenarios/` that verifies the new
   backend selector reaches the slice (and skips gracefully when the
   driver's binary is absent).

Never widen `ALLOWED_NETWORK_PROFILES` without a corresponding update
to the sandbox plugin's profile list — the genie defers to the plugin
for the actual semantics, and a profile the plugin does not implement
is a hard error at slice-mint time.

## See also

- [`packages/sandbox/README.md`](../sandbox/README.md) — the
  capability surface, network profiles, and operator prerequisites
  for the underlying slice.
- [`PLAN/endo_posix_sandbox.md`](../../PLAN/endo_posix_sandbox.md) —
  the design that the slice integration consumes.
- Repo-root [`CLAUDE.md`](../../CLAUDE.md) — SES, harden, JSDoc, and
  exo conventions that apply to every file in the genie package.
