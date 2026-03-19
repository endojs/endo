# Endo POSIX Sandbox — Phase 3.5a: root-genie workspace slice

Wire the sandbox plugin into `@endo/genie` so the daemon's root genie
(`@self`) runs against a confined workspace slice instead of touching
the host filesystem directly.
This is the first concrete consumer of `SandboxFactory.make()` from the
genie side; sub-agent sandboxing (`fork()`) lives in
[`23_endo_posix_sandbox_phase3_5b_genie_subagent.md`](./23_endo_posix_sandbox_phase3_5b_genie_subagent.md).

Scope reference:
[`PLAN/endo_posix_sandbox.md`](../PLAN/endo_posix_sandbox.md)
§§ "Phase 3.5a — root-genie workspace slice" and "Genie integration
shape".

Depends on:
- Phase 1 + 1.5 bwrap driver
  ([`TADA/13_…`](../TADA/13_endo_posix_sandbox_phase1_bwrap.md),
  [`TADA/14_…`](../TADA/14_endo_posix_sandbox_phase1_5_bwrap_hardening.md))
  — `make()` produces working slices on Linux.
- Phase 2 podman driver
  ([`TADA/15_…`](../TADA/15_endo_posix_sandbox_phase2_podman.md))
  — second backend for the same surface (optional for v1 of this task,
  but the integration shape must not assume bwrap).
- Phase 3 nesting plumbing
  ([`21_…`](./21_endo_posix_sandbox_phase3_nesting.md))
  is **not** strictly required for 3.5a — root-genie integration only
  uses `make()`, not `fork()` — but `fork()` lands before 3.5b can
  consume it, and 3.5b assumes the worker is already inside a slice.
  Land 3.5a after Phase 3 to keep the integration order linear.

Genie boot shape this task replaces:
[`packages/genie/setup.js`](../packages/genie/setup.js)
calls `E(hostAgent).makeUnconfined('@main', main.js, { powersName:
'@agent', resultName: 'main-genie', env })` to materialise `main.js`
as the daemon's `@self` worker directly.
See `packages/genie/CLAUDE.md` § "Boot shape" for the operational
contract this task must preserve externally.

## Goal

The bottle's `bottle.sh invoke` flow keeps working with no operator
change, but `bash` / `exec` / `git` and any other workspace-touching
tools the genie spawns run **inside** a `SandboxHandle`'s namespace
rather than on the bare host.
The genie's network egress is `private` by default (the Phase 1.5
RFC 1918 / loopback / VPN blocklist applies).

## Decisions to record at task-authoring time

The PLAN leaves three things "decide during the Phase 3.5a sub-task";
this file is where those decisions land.
Capture them as a short § "Decisions" block before the Deliverables.

- **Where the slice is minted.**
  Two viable shapes:
  1. _setup-side_: `setup.js` mints the `SandboxHandle` and threads
     it through `makeUnconfined`'s `env` / introduced-names plumbing
     so `main.js` receives it as a capability.
     Cleanest, but requires the daemon to support passing handles via
     `makeUnconfined`'s introduction mechanism.
  2. _main-side_: `main.js` mints the slice from `powers` directly,
     using a stable workspace-mount cap pinned by `setup.js` under
     `main-genie-sandbox`.
     `setup.js` only changes to mint and pin the workspace `Mount`.
     Closer to today's flow.
  Pick one and document the other as the rejected alternative.

- **Whether the worker itself runs inside the slice.**
  The PLAN flags an intermediate "tools spawn through the slice but
  the worker stays on the host" shape as easier than wrapping the
  Node worker in `bwrap`.
  Decide whether 3.5a delivers the easy shape or the full
  worker-inside-slice shape, and which deliverables below apply.
  If staged, file the harder follow-up as a separate TODO before
  closing this one.

- **Slice formula reincarnation.**
  Like `Mount` and `ScratchMount`, the slice handle should be GC-pinned
  by a daemon formula so a daemon restart re-mints the same slice from
  the same spec.
  Decide whether the formula lives in `packages/sandbox` (preferred —
  the plugin owns its own formula) or in the daemon's host (mirroring
  `provideScratchMount`).

## Decisions

Recorded 2026-04-29 after surveying the current `makeUnconfined` /
`provideMount` plumbing and the genie tool chokepoint.
See § "Decision rationale" below for the supporting evidence.

1. **Slice minted main-side.** `setup.js` provisions the workspace
   `Mount` and registers the `@endo/sandbox` plugin as an unconfined
   caplet under `sandbox-factory`; `main.js` (re)mints the
   `SandboxHandle` from `powers` on boot and pins the result under
   `main-genie-sandbox`.
   _Rejected alternative_: setup-side minting + introduction via
   `makeUnconfined`'s `env`.
   `MakeCapletOptionsShape` (`packages/daemon/src/host.js:494`,
   `packages/daemon/src/daemon.js:3971` — `make-unconfined` formula
   fields `{ worker, powers, specifier, env }`) has no
   `introducedNames` channel today.
   Threading a slice cap setup-side would require a daemon-side change
   to add that channel, which is out of scope for 3.5a;
   the main-side shape ships against today's daemon unchanged.
   Once a daemon-side `introducedNames` (or equivalent) lands, a
   follow-up may flip the polarity.

2. **Worker stays on the host; only tool spawns route through the
   slice.**
   `worker.js:85` invokes `module.main(powers, context, { env })` via
   in-process `import()`; pushing the entire Node worker into a bwrap
   namespace requires wrapping the worker spawn itself and routing
   the daemon ↔ worker CapTP transport across the namespace boundary.
   That is meaningful daemon plumbing and orthogonal to the sandbox
   plugin's current surface; 3.5a delivers the intermediate shape
   (genie's `bash` / `exec` / `git` chokepoint at
   `packages/genie/src/tools/command.js:346` is the only on-host
   `child_process.spawn` call in the genie tree, so confining it
   closes the dominant LLM-misled-execution path).
   The full worker-inside-slice shape is filed as
   [`24_endo_posix_sandbox_phase3_5a_worker_inside_slice.md`](./24_endo_posix_sandbox_phase3_5a_worker_inside_slice.md)
   (see [§ Follow-ups filed](#follow-ups-filed) below).
   This decision strikes the "Worker placement (worker-inside-slice
   variant)" deliverable below; its host-only sibling stays.

3. **Slice formula lives in `packages/sandbox`.**
   The plugin owns its own pinning hook: its `agent.js` `make()`
   already returns a `SandboxFactory` exo, and the slice handle's
   reincarnation is implemented as a `SandboxFactory.makePersistent
   (name, opts)` (or similar) that records the spec under the chosen
   pet name and re-mints on first deref.
   Daemon-side `Host` gains no new method; the `provideScratchMount`
   pattern stays as-is, and the sandbox plugin's formula sits next to
   the `bwrap` / `podman` driver code where its dependencies already
   live.
   _Rejected alternative_: a daemon-side `provideSandbox` mirroring
   `provideScratchMount`.
   It would couple the daemon to the sandbox plugin's spec shape
   (rootfs / mounts / network profile / backend selector) — the
   plugin would have to ship a formula type the daemon imports, which
   inverts the "plugins are leaves" layering.
   Keeping the formula in `packages/sandbox` preserves that layering.

### Decision rationale

- **Single tool spawn chokepoint.** Surveyed
  `packages/genie/src/tools/command.js:346` is the only
  `child_process.spawn` call across the genie source tree.
  `bash`, `exec`, and `git` all flow through `makeCommandTool`'s
  shared `execute()`.
  Swapping that one call site for `E(slice).spawn(argv, opts)` is the
  full extent of the genie-side change.

- **`provideMount` / `provideScratchMount` already host methods.**
  `packages/daemon/src/host.js:253` and `:274`.
  `provideMount(path, name, { readOnly })` formulates a `Mount`
  formula; `provideScratchMount(name, { readOnly })` formulates a
  `scratch-mount` formula.
  Both are pinned by pet name, idempotent on re-run, and reincarnated
  by daemon restart from their stored formula — exactly the pattern
  Decision 3 inherits for the slice handle.

- **`makeUnconfined`'s formula is `make-unconfined` with `{ worker,
  powers, specifier, env }`.**
  `packages/daemon/src/daemon.js:3971`.
  No `introducedNames`, no per-call cap-passing channel besides
  `powers` itself.
  Decision 1 follows: hand the slice through `powers` (the host
  agent's pet store) rather than attempting to thread it through the
  formula.

- **`@endo/sandbox` is not yet host-registered.** No reference
  outside `packages/sandbox/`.
  Decision 1's "register the plugin as an unconfined caplet under
  `sandbox-factory` in `setup.js`" is the natural first wiring step —
  the plugin's `agent.js` already exports the right `make(powers,
  context, { env })` shape (see `packages/sandbox/src/agent.js:31`).

## Deliverables

Each item below is gated on the decisions above.
Decisions recorded; struck entries are crossed out and a one-line
reason follows.

- [ ] **Workspace `Mount` provisioning.**
  Update `setup.js` (or its successor) to ensure a `workspace-mount`
  `Mount` capability exists for `GENIE_WORKSPACE` and is pinned in
  the host agent's pet store.
  Idempotent on re-run, mirroring the existing `has('main-genie')`
  short-circuit.
  Reuse the daemon's `provideMount` / `provideScratchMount` plumbing
  rather than introducing a new mount primitive.
  Per Decision 1, this is the **only** new responsibility `setup.js`
  takes on besides registering the sandbox plugin (next item).

- [ ] **Sandbox plugin registration in `setup.js`.**
  After `provideMount`, the launcher calls
  `E(hostAgent).makeUnconfined('@agent', sandboxAgentSpecifier, {
  powersName: '@agent', resultName: 'sandbox-factory' })` so a
  `SandboxFactory` ref is reachable from the host pet store under a
  stable name.
  Idempotent on re-run via the same `has('sandbox-factory')`
  short-circuit pattern.
  This makes the factory available to `main.js` through `powers`
  without threading a cap through `makeUnconfined`'s `env`.

- [ ] **Sandbox slice formula** (per Decision 3, owned by
  `packages/sandbox`).
  Add a `SandboxFactory.makePersistent(name, opts)` (exact name TBD
  during implementation) that:
  - records the resolved spec on disk under the host's daemon-state
    directory keyed by `name`,
  - on first deref re-mints the slice via the existing `make()`
    path,
  - is GC-pinned by `name` so a daemon restart re-mints from the
    same spec without operator intervention.
  Mint with:
  - `rootfs`: `{ kind: 'host-bind' }` for v1 (the bottle's host
    userland is the rootfs);
    record the operator-supplied alternatives (`Mount` rooted at a
    consumer rootfs) as a documented escape hatch.
  - `mounts`: `[{ cap: workspaceMount, innerPath: '/workspace',
    mode: 'rw' }]` plus any caller-granted extras.
  - `network`: `'private'`.
  - `backend`: `'auto'`.
  Pin under `main-genie-sandbox`.

- [ ] **Slice → genie wiring** (per Decision 1, main-side).
  `main.js` resolves `sandbox-factory` and `workspace-mount` from
  `powers` on boot, calls `E(factory).makePersistent
  ('main-genie-sandbox', { rootfs, mounts, network: 'private',
  backend: 'auto' })`, and threads the resulting `SandboxHandle`
  into the tool registry.
  Document the introduction in `packages/genie/CLAUDE.md` § "Boot
  shape" so future readers see the slice in the boot picture.

- [ ] **Tool spawn channel** (single chokepoint at
  `packages/genie/src/tools/command.js:346`).
  Re-route the `spawn(exe, spawnArgs, …)` call so `makeCommandTool`
  invokes `E(slice).spawn([exe, ...spawnArgs], { cwd, env })`
  instead.
  Map the existing tool stdio plumbing onto the slice's
  `ProcessHandle.stdin / stdout / stderr` `reader-ref` /
  `writer-ref` adapters; the result-shape contract returned to the
  agent (`{ success, command, stdout, stderr, exitCode, path? }`)
  is preserved by collecting the streams into the same buffers the
  current code uses.
  No tool surface change is visible to the agent — only the
  daemon-side spawn channel swaps.
  `makeCommandTool`'s factory grows a `slice` parameter; tool-registry
  construction in `main.js` passes the freshly-minted handle through.

- [ ] **`GENIE_WORKSPACE` resolution.**
  Inside the slice, `GENIE_WORKSPACE` resolves to the
  slice-internal path (`/workspace`) the workspace mount is
  installed at.
  Outside the slice (the launcher), it remains the host path the
  operator supplied.
  `main.js` reads the host path from `env`, hands it to
  `provideMount` setup-side, and rewrites its in-process
  `GENIE_WORKSPACE` to the slice-internal path before constructing
  tools so MEMORY.md / HEARTBEAT.md / `.genie/` paths the genie
  itself uses on the host (workspace init, persisted-config read,
  fts5 backend) keep their host view, while every spawn-through-slice
  call sees `/workspace`.
  Document the two views and the boundary.

- [x] ~~**Worker placement (worker-inside-slice variant).**~~
  Struck per Decision 2.
  Filed as
  [`24_endo_posix_sandbox_phase3_5a_worker_inside_slice.md`](./24_endo_posix_sandbox_phase3_5a_worker_inside_slice.md).

- [ ] **Worker placement (host-side variant, the 3.5a shape).**
  Worker stays on the host; only tool spawns route through the
  slice.
  Document the residual exposure in
  `packages/genie/README.md` § "Sandboxed workspace": Node + daemon
  code on the host filesystem can still be touched by an
  LLM-misled `eval` path inside `main.js`'s tool / specials
  surface; only `bash` / `exec` / `git` (the
  `command.js` chokepoint) are confined.
  The `network: 'private'` profile still drops RFC 1918, host
  loopback, and VPN ranges from any tool-spawned process.

- [ ] **Heartbeat / observer / reflector continuity.**
  Verify that the `runHeartbeatTicker` self-send path
  (`E(agentGuest).send('@self', …)`) and the observer / reflector
  pi-agent calls work unchanged when tool spawns route through the
  slice.
  These do not themselves touch the host filesystem; they should be
  invariant under the change.
  Add a regression test if any of them grew an implicit dependency
  on host paths.

- [ ] **GC ordering on daemon restart.**
  When the daemon restarts, `main-genie` and `main-genie-sandbox`
  must reincarnate in the right order: slice first, worker after,
  so the worker's tool registry sees a live slice on first call.
  Document the formula dependency (slice handle pins workspace
  mount; worker formula pins slice handle).

- [ ] **Tests** — pick a home consistent with the existing genie /
  daemon test layout:
  - [ ] Smoke test: `bottle.sh invoke` against a host with bwrap +
    pasta installed boots a genie whose `bash` tool can `cat
    HEARTBEAT.md` from the workspace and cannot `cat /etc/hosts`
    on the host (host-bind rootfs allows reading; the test asserts
    a chosen sentinel host file is **not** present in the slice's
    view, e.g. `~/.aws/credentials`).
  - [ ] `network: 'private'` smoke: `bash -lc 'curl -s http://127.0.0.1:<host-daemon-port>/'`
    fails (loopback blocked); a public `curl` succeeds when the CI
    host has internet.
  - [ ] Daemon restart: kill the daemon, restart it, assert the
    `main-genie` worker comes back and `bash` still spawns through
    the slice (no orphaned scratch / mount).
  - [ ] Tool stdio: `bash -lc 'echo hi'` returns `hi\n` on stdout
    via the existing tool plumbing — the slice's `reader-ref` /
    `writer-ref` adapters do not corrupt the byte stream.

- [ ] **Docs**:
  - [ ] `packages/genie/CLAUDE.md` § "Boot shape" mentions the slice.
  - [ ] `packages/genie/README.md` adds a "Sandboxed workspace"
    section explaining the `network: 'private'` default and the
    workspace-mount endowment.
  - [ ] `packages/genie/scripts/bottle.sh` banner notes the slice
    backend chosen at boot (`bwrap` / `podman`) and warns when no
    backend is available, so an operator on a missing-tool host
    sees the failure mode clearly.
  - [ ] `PLAN/endo_posix_sandbox.md` § "Phase 3.5a" gets a "landed"
    pointer to a TADA file once this task closes.

## Exit criteria

A `bottle.sh invoke` on a Linux host with bwrap + pasta installed
brings up a genie whose `bash` / `exec` / `git` tools see only the
explicitly granted workspace `Mount`.
The Node worker itself stays on the host (per Decision 2 above);
worker-inside-slice is tracked as
[`24_…`](./24_endo_posix_sandbox_phase3_5a_worker_inside_slice.md).
The genie cannot reach host loopback, RFC 1918 LAN, or any host file
outside the workspace mount **via its tools**.
A daemon restart reincarnates both the slice (`main-genie-sandbox`)
and the worker (`main-genie`) without operator intervention, in that
order — the worker's tool registry sees a live slice on first call.

The bottle operator's CapTP UX (invite, `endo send`, `/model`,
`/help`, etc.) is unchanged from today.

## Out of scope

- `fork()` / sub-agent sandboxing — see
  [`23_…`](./23_endo_posix_sandbox_phase3_5b_genie_subagent.md).
- A genie-side `sandbox.spawn` / `sandbox.exec` tool surface
  (Phase 7).
- Familiar / Electron renderer access to the slice (Phase 7).
- macOS / Windows backends — the integration uses
  `SandboxFactory` polymorphically; once Phase 4 / 6 land their
  drivers, this same code path lights up on those platforms with
  no genie change.
- A capability-/keychain-backed credential store for
  `.genie/config.json` (tracked under
  [`TADA/92_genie_primordial.md`](../TADA/92_genie_primordial.md)
  § 3g); the slice provides defence-in-depth around the existing
  plaintext-with-`0600`-perms file but does not replace it.
- Wrapping the genie's Node worker itself in a slice — see
  [`24_…`](./24_endo_posix_sandbox_phase3_5a_worker_inside_slice.md).
  3.5a confines `bash` / `exec` / `git` only.

## Follow-ups filed

- [`24_endo_posix_sandbox_phase3_5a_worker_inside_slice.md`](./24_endo_posix_sandbox_phase3_5a_worker_inside_slice.md)
  — push the entire `main-genie` Node worker process inside the
  slice, closing the residual `eval`-path exposure 3.5a leaves on
  the host.
  Filed per Decision 2 above.

## Status

- 2026-04-29: Decisions 1–3 recorded; deliverables list updated to
  match (worker-inside-slice variant struck; sandbox plugin
  registration added; sandbox-side persistent slice formula added).
  Worker-inside-slice follow-up filed under
  [`24_…`](./24_endo_posix_sandbox_phase3_5a_worker_inside_slice.md).
  Implementation has not started.
