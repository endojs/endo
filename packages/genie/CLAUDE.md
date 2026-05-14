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

### Slice-spec boundary: deep-harden every structured input

`mintGenieSlice` in
[`src/sandbox/slice.js`](./src/sandbox/slice.js) is the single place
that hands a slice spec to `E(sandboxFactory).make(...)`.
Structured object inputs from a potentially adversarial caller (the
agent's configuration form) must be **deep-copied and hardened on
entry** before the value flows into `factory.make`.
Today the only such field is `env`:

```js
/** @type {Record<string, string>} */
const safeEnv = harden({ __proto__: null, ...env });
// then validate non-string values up front and pass `safeEnv` (never
// `env`) into `E(sandboxFactory).make({ env: safeEnv, … })`.
```

The reason is a time-of-check / time-of-use seam under the central
confinement claim: a `Proxy`-backed `env` whose getter returns
different values on successive reads can differentiate the value
`mintGenieSlice` (or anything else along the path) reads from the
value the driver eventually injects into the slice.
The shallow spread reads every own-enumerable property exactly once,
and `__proto__: null` + `harden` prevents prototype-chain or property
drift after entry.

Pin the rule when adding new structured inputs to the slice spec
(future `labels`, `secrets`, anything that takes a fresh object from
form data): defensively copy + harden at the `mintGenieSlice`
boundary rather than trusting the factory's `M.interface()` guard to
re-read the same bytes the helper read.
`rootfs` is already a tagged union with each arm validated, and
`mounts` is shaped by the factory's guard — neither needs a separate
copy — but anything taking a free-form object map does.
See [`TODO/63_genie_slice_env_deep_harden.md`](../../TODO/63_genie_slice_env_deep_harden.md)
for the original analysis.

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
| `workspace`         | `E(host).provideMount(GENIE_WORKSPACE, 'workspace-mount')`    | `spawnAgent` (bound to `/workspace`); also passed to daemon-side fs tools as the canonical workspace cap.  Downstream agents inherit the same cap (rather than minting their own per-agent mount) when the configuration form's `workspace` field is set to a pet name introduced into the agent's namespace; see § "Workspace form-field shapes" in the README. |
| `sandboxes`         | `E(host).makeUnconfined('@main', '@endo/sandbox/agent.js', { powersName: '@agent', resultName: 'sandbox-factory' })` | `spawnAgent` calls `E(sandboxes).make({...})` to mint a `SandboxHandle` per agent. |

Both lookups in `main.js` are guarded with structured-error fallbacks
so a partial rollout (factory present but no workspace mount, or vice
versa) surfaces clearly rather than silently dropping back to direct
host spawning.

The `workspace` row deserves a closer note: `spawnAgent` accepts the
form's `workspace` value as either an absolute host path (legacy —
mints a fresh per-agent `${name}-workspace` Mount) or a pet name that
was already introduced into the agent guest's namespace (recommended
— resolves via `E(agentGuest).lookup(petName)` and reuses the
`workspace-mount` cap that `setup.js` minted on the host).
The pet-name path collapses the two-Mount-per-agent footprint to a
single daemon-minted Mount that all agents share, and validates the
looked-up cap against the `MountInterface` method surface so a typo
surfaces as a structured error rather than a duck-typing failure
deep in `initWorkspace` or the slice-mint call.
`setup.js` auto-submits `workspace: 'workspace'` when
`GENIE_WORKSPACE` was set at boot.

The cap validation is a two-layer gate; the layering matters because
either layer alone is insufficient:

- **Shape gate** — `assertIsMountCap` in
  [`src/sandbox/slice.js`](./src/sandbox/slice.js) probes
  `E(cap).__getMethodNames__()` and checks for the
  `['readText', 'writeText', 'makeDirectory', 'has', 'list']` subset.
  This produces a friendly, agent-named error when the operator
  pet-names something that isn't a Mount (a guest, a value blob, a
  typo).  It is **not** an identity check: any `makeExo` / `Far` exo
  advertising the right method names satisfies it.
- **Identity gate** — `E(hostAgent).provideHostPath(cap)` (daemon
  path; see `packages/daemon/src/host.js` `provideHostPath` ~line
  302) or `E(powers).provideHostPath(cap)` (dev-repl path; see
  `local-powers.js`'s `WeakMap` lookup) consults the authoritative
  registry of mints and rejects strangers with
  `not a daemon-minted mount` / `not a local-minted mount`.  This is
  the only authentication standing between a spoofed exo and
  `factory.make`'s bind-mount surface.

The order is "friendly shape error first, authoritative identity
error second"; both must remain in place.  The pin tests live at
`packages/daemon/test/endo.test.js` ("provideHostPath rejects a spoof
that passes the genie shape gate") and
`packages/genie/test/local-sandbox-powers.test.js`
("assertIsMountCap is a shape gate; provideHostPath is the identity
gate").

### `rootfs` form field — four shapes plus a backend cross-check

The configuration form's `rootfs` field selects the userland tree the
slice's bwrap (or podman) driver mounts as `/`.
`spawnAgent` accepts four shapes and routes each one through
`parseRootfsValue` in `main.js` (synchronous form-side parse) before
constructing the `RootfsSpec` payload passed into
`E(sandboxFactory).make({ rootfs })`:

| Form value (`rootfs`)              | `ParsedRootfsValue`                | Resulting `RootfsSpec` arm                                       |
| ---------------------------------- | ---------------------------------- | ---------------------------------------------------------------- |
| `host-bind` (default)              | `{ kind: 'host-bind' }`            | Same kind, passed through.  Bwrap and podman both accept it.     |
| `minimal`                          | `{ kind: 'minimal' }`              | Same kind, passed through.  Bwrap and podman both accept it.     |
| `oci:<ref>`                        | `{ kind: 'oci', ref }`             | Same kind, passed through.  **Podman only — bwrap rejects.**     |
| `<pet-name>`                       | `{ kind: 'pet-name', petName }`    | Resolved via `E(agentGuest).lookup(petName)`, validated against `MountInterface`, and inserted as the `MountCap` arm.  Bwrap and podman both accept it. |

The keyword arms (`host-bind`, `minimal`) and the pet-name arm pass
through to whichever driver the resolved backend selects.
The `'oci:<ref>'` arm is the only one with a backend constraint, and
the constraint surfaces twice on purpose:

- `assertRootfsBackendCompatible` (in `main.js`) front-runs the check
  on the form-side and throws a structured error naming the agent
  *before* `E(sandboxFactory).make(...)` is reached.  The fix string
  ("set `backend` to `podman` or pick a non-oci rootfs") is exactly
  what the operator sees on the configuration form's reply.
- The bwrap driver (in
  [`packages/sandbox/src/drivers/bwrap.js`](../sandbox/src/drivers/bwrap.js))
  rejects `rootfs.kind === 'oci'` with a sibling error
  (`bwrap driver does not support oci rootfs; use backend: 'podman' instead`)
  so callers that bypass the genie's form (e.g. unit tests minting a
  slice directly) still hit the same wall.

The two checks live in different packages and are intentionally kept
in lockstep: the genie surfaces the bwrap/podman asymmetry at the
operator-facing form boundary so it never bubbles up as a confusing
slice-mint failure, but the sandbox plugin remains the source of
truth for which driver supports which `RootfsSpec` shapes.

The pet-name arm flows through the same two-layer cap gate as the
workspace pet-name shape (see § "Capabilities the genie guest
receives" above for the full layering): `assertIsMountCap`'s
`__getMethodNames__()` probe is a **shape** gate producing
agent-named friendly errors, and `E(sandboxFactory).make({ rootfs })`
later passes the cap through `provideHostPath`, the authoritative
**identity** gate (`not a daemon-minted mount` /
`not a local-minted mount`).  The shape gate alone is not
authentication; the identity gate alone has no operator context.

`setup.js` does **not** auto-submit `rootfs` — operators tuning it
answer the form by hand on first boot, and the field's value is
persisted by the genie guest formula across restarts.  See
[`packages/genie/README.md` § "Rootfs form-field shapes"](./README.md#rootfs-form-field-shapes)
for the operator's view of the same surface, including the `endo
make-mount` workflow for the pet-name shape.

### Dev REPL local powers

The dev-repl harness (`dev-repl.js`) has no Endo daemon and therefore
no `EndoHost` to mint `workspace-mount` / `sandbox-factory` from.
Instead, it constructs an in-process equivalent via
[`makeLocalSandboxPowers`](./src/sandbox/local-powers.js) (see
[`TODO/51`](../../TADA/51_genie_dev_repl_local_sandbox_powers.md)) and
hands the resulting `SandboxPowers` exo to `@endo/sandbox`'s `make`
entry point to build a `SandboxFactory` directly.

The asymmetry with the daemon path is intentional and worth pinning:

| Concern                          | Daemon (`main.js`)                                                                                     | Dev REPL (`dev-repl.js`)                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `SandboxPowers` source           | `EndoHost` exo in `packages/daemon/src/host.js`; lives behind a CapTP boundary.                        | `makeLocalSandboxPowers()` exo, in-process, `WeakMap`-backed.                                             |
| Workspace `MountCap` source      | `E(host).provideMount(GENIE_WORKSPACE, 'workspace-mount')` — daemon-minted, persisted across restarts. | `makeMountCapForPath(workspaceDir)` — minted by the REPL itself, lives only for the lifetime of the run. |
| `provideHostPath(cap)`           | Daemon resolves the cap via its mount-formula registry (`packages/daemon/src/host.js` `provideHostPath`); rejects strangers with `not a daemon-minted mount`. | Local powers consult their own `WeakMap<cap, hostPath>`; rejects strangers with `not a local-minted mount`. |
| Scratch tmpdir cleanup           | Daemon's `provideScratchMount` formulas are GC-pinned to the slice and reaped with the agent.          | `disposeSandboxPowers()` `rm -rf`s every tmpdir minted via `provideScratchMount`; called from the REPL's teardown registry on exit (TODO/54). |

The dev-repl owns the workspace `MountCap` end-to-end — there is no
agent-guest namespace, so the daemon's pet-name resolution path
(`E(agentGuest).lookup(petName)`) does not apply.  For the same
reason the dev-repl rejects `--rootfs <pet-name>` at the CLI boundary
rather than falling through; the only accepted `--rootfs` shapes are
`host-bind`, `minimal`, and `oci:<ref>`.

Both the daemon and dev-repl paths share the same slice-mint
boundary: [`src/sandbox/slice.js`](./src/sandbox/slice.js)'s
`mintGenieSlice` (see
[`TODO/52`](../../TADA/52_genie_dev_repl_slice_factory_helper.md)) is
the single place that probes backends, validates rootfs / network,
calls `factory.make({ ... })`, and wraps the resulting handle in a
`Spawner`.  When you change the slice-mint sequence, both call sites
pick up the change automatically; when you change the form-side
parsing (`parseRootfsValue`, `assertRootfsBackendCompatible`) the
helper module is the source of truth and `main.js` re-exports the
symbols only to preserve the public test surface.

The dev-repl's local powers reject sub-Mounts and symlink escapes to
mirror the daemon's `EndoHost.provideHostPath` rejection surface —
adversarially-shaped workspace trees cannot widen the slice's bind
set.  Three constraints compose to close the surface (see
[`TODO/61`](../../TADA/61_genie_local_powers_symlink_realpath.md)
saboteur findings 1, 2, and 4 for the original attack analysis):

- **`Mount.lookup` realpaths the resolved target** and refuses to
  return a sub-Mount whose canonical path escapes the mount root.  A
  workspace symlink such as `${workspaceDir}/escape -> /etc` is
  rejected with `local Mount.lookup: … escapes mount root`, matching
  the daemon's `assertConfined` realpath check in
  [`packages/daemon/src/mount.js`](../daemon/src/mount.js).
- **`provideHostPath` rejects sub-Mount views.**  Only top-level caps
  (those minted by `provideScratchMount` / `makeMountCapForPath`)
  pass; sub-Mounts returned by `Mount.lookup()` are tracked
  separately and refused with `cap is a sub-Mount view, not a
  top-level mount`.  This mirrors
  [`packages/daemon/src/host.js`](../daemon/src/host.js)'s explicit
  rejection of subdirectory views.  Callers that need to bind a
  sub-directory must mint a fresh top-level cap via
  `makeMountCapForPath(subPath)` — the same explicit-mint workflow
  the daemon's `provideMount(absolutePath, …)` requires.
- **`assertNoEscape` rejects absolute path segments.**  In addition
  to the long-standing `..` / `\0` veto, segments that begin with
  `/` or `\\` are refused as defense in depth, so a future swap to
  `path.resolve` or `path.win32` semantics cannot quietly promote
  `'/etc/passwd'` into an out-of-workspace address.

Per-rejection tests live next to the powers in
[`packages/genie/test/local-sandbox-powers.test.js`](./test/local-sandbox-powers.test.js)
under the "Confinement hardening" heading.

### Template seeding flows through the same Mount cap

When `spawnAgent` minted (or looked up) a `workspaceMount`, the
shipped `workspace_template/` tree is copied through that cap rather
than through ambient host fs writes.
The seed bytes are still **read** from the package's
`workspace_template/` directory on the host filesystem (the genie
unconfined caplet has unrestricted host fs access during boot, so a
daemon round-trip per template file would be pure overhead), but
every **write** lands on the agent workspace via
`E(workspaceMount).writeText(...)` and the marker file
(`.genie-workspace-init`) is checked via `E(workspaceMount).has(...)`.

`src/workspace/init.js` exposes both shapes:

- `initWorkspaceMount(mount)` / `isWorkspaceMount(mount)` — the
  cap-driven path used by `main.js` whenever a workspace Mount is
  available (i.e. every code path except the legacy
  `process.cwd()`-only fallback).
- `initWorkspace(workspaceDir)` / `isWorkspace(workspaceDir)` — the
  host-path signature that `dev-repl.js` keeps using because it has
  no daemon and no Mount cap.

Mirroring the seed copy onto the cap surface keeps the template
discipline aligned with the rest of the convention above (daemon-side
tools that touch the workspace consume a Mount cap, never a raw host
path) and is what TODO/23 set out to deliver.

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

# Sandbox slice scenario — verifies bash actually runs in a slice
# (daemon path).
cd packages/genie && yarn test:integration:sandbox-slice

# Same probe shape, dev-repl path — verifies bash actually runs in a
# slice when invoked through `dev-repl.js -c` instead of the daemon.
cd packages/genie && yarn test:integration:dev-repl-sandbox
```

The `sandbox-slice` scenario boots a real Endo daemon, runs `setup.js`
with `GENIE_WORKSPACE=$tmpdir`, waits for the agent to announce
readiness, then asks the agent to probe its own bind mount, mount
table, host filesystem isolation, and network profile.
It is **Linux-only** and skips cleanly with `SKIP:` when
`bwrap --version` fails or the kernel rejects unprivileged user
namespaces.

The `dev-repl-sandbox` AVA test mirrors the same probe shape against
the daemon-free dev-repl: it spawns
`node packages/genie/dev-repl.js -w $tmp --sandbox bwrap --network none -c "<probe>"`
and asserts the bash tool's `pwd` lands on the slice's
`/workspace`, plus a sibling `--sandbox off` test that asserts the
host-spawn fall-through path still works on platforms without a
backend (macOS, kernels lacking unprivileged user namespaces).
Skips with `t.log('SKIP: …'); t.pass()` when `bwrap` is unavailable
or when the configured `GENIE_MODEL` (default `ollama/llama3.2`) is
unreachable on `localhost:11434`; non-ollama models are accepted on
faith because reaching their endpoints would require provider keys
this test does not own.

When either test skips on your machine, install bubblewrap and
confirm the kernel:

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
4. Declare which `RootfsSpec` shapes the new driver supports.  Bwrap
   accepts `host-bind` / `minimal` / `mount`; podman additionally
   accepts `oci`.  If the new driver's support set diverges from the
   bwrap/podman pair, mirror the divergence into the form-side
   cross-check by extending `assertRootfsBackendCompatible` in
   [`main.js`](./main.js) so the asymmetry surfaces at the form
   boundary rather than as a slice-mint failure.  When the divergence
   touches the keyword-only subset, also reconsider whether
   `ALLOWED_ROOTFS_KINDS` and the form-field label string under
   `name: 'rootfs'` need updating in lockstep.
5. Add a scenario probe under `test/scenarios/` that verifies the new
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
