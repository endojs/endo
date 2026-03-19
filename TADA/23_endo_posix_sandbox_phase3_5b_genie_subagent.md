# Endo POSIX Sandbox — Phase 3.5b: genie sub-agent sandboxing

Revive the dormant `spawnAgent` / `removeChildAgent` /
`listChildAgents` family in `packages/genie/main.js` as a
capability the root genie exposes, with each child agent's
workspace running inside a `SandboxHandle.fork()`-minted sub-slice
of the parent's slice.
This restores the `provideGuest`-backed child-agent path that
commit `140c44122` removed when the root genie became `@self`,
but routed through the sandbox attenuation rules instead of bare
host introductions.

Scope reference:
[`PLAN/endo_posix_sandbox.md`](../PLAN/endo_posix_sandbox.md)
§ "Phase 3.5b — sub-agent sandboxing (revives `provideGuest`)".

Depends on:
- Phase 3 nesting plumbing
  ([`21_…`](./21_endo_posix_sandbox_phase3_nesting.md))
  — `SandboxHandle.fork()` is the underlying primitive.
  Land 3 before starting 3.5b.
- Phase 3.5a root-genie workspace slice
  ([`22_…`](./22_endo_posix_sandbox_phase3_5a_genie_workspace.md))
  — the parent `SandboxHandle` that 3.5b's `fork()` calls hang off.
  Land 3.5a before starting 3.5b.
- The dormant `spawnAgent` family in
  [`packages/genie/main.js`](../packages/genie/main.js)
  (~lines 1113–1306) and the deferred-spawning notes in
  `packages/genie/CLAUDE.md` § "Sub-agent spawning (deferred)".

## Goal

The root genie can, via a CapTP method (or a `/spawn` builtin —
decide at task-authoring time, see Decisions below), provision a
named sub-agent whose:

- Identity is a fresh `provideGuest`-minted Endo guest, separate from
  `@self`.
- Workspace lives in a `SandboxHandle.fork()`-minted sub-slice of the
  parent's slice, with mount attenuation expressing one of two
  shapes:
  - **Scoped within parent.**
    The child mounts a sub-path of the parent's workspace at its own
    `/workspace`.
    Use case: a sub-agent working on one project the parent owns.
  - **Wholly separate.**
    The child's only mount is a freshly-granted standalone `Mount`
    capability the operator hands to the parent.
    Use case: a sub-agent owning an unrelated workspace tree.
- Network profile is the parent's, or strictly tighter (Phase 3
  enforces this).
- Discovery: the child's locator is recorded in the parent's
  `agentDirectory` (the `<dir>/<name>` pet-namespace pattern the
  dormant helper already implements), so siblings and external
  observers can resolve children by pet name.

The two attenuation shapes mirror exactly how `fork()`'s mount
inheritance works: the parent's mount view is the upper bound; the
child sees an attenuation of that view plus any newly-granted
standalone `Mount` caps.
A child can never see a host path the parent does not.

## Decisions to record at task-authoring time

Capture these as a § "Decisions" block before the Deliverables.

- **Surface shape.**
  Root genie exposes the spawn surface as either:
  1. a CapTP method on the root genie's exo
     (e.g. `genie.spawnSubAgent(name, attenuation)`), or
  2. a `/spawn` builtin in the specials dispatcher in `main.js`.
  Pick one and document the rejected alternative.
  (1) is more capability-clean — the operator hands the spawn cap
  to the bottle and the bottle's piAgent can use it directly.
  (2) is more uniform with `/model`, `/help`, `/observe`, `/reflect`.

- **Parent slice handle.**
  3.5a pinned the parent's `SandboxHandle` under
  `main-genie-sandbox`.
  Decide whether children pin their sub-slices under
  `<agentName>-sandbox` (parallel naming) or under
  `<agentDirectory>/<agentName>-sandbox` (scoped under the parent's
  agent directory).
  The latter mirrors the locator-storage pattern the dormant helper
  already uses; the former keeps the pet-store flat.

- **Sub-agent boot path.**
  Two routes:
  1. Reuse the dormant `spawnAgent` body more or less verbatim,
     plus a `slice.makeUnconfined` (or
     `slice.spawn(... main.js ...)`) call to land `main.js` inside
     the sub-slice.
  2. Generalise `setup.js` into a reusable launcher that takes a
     `(slice, hostAgent, env)` tuple and call it for both root and
     sub-agents.
  Pick one; (2) is more architectural but more invasive.

## Decisions

Recorded 2026-04-30 after surveying the dormant `spawnAgent` family
(`packages/genie/main.js:1113-1306`), the live Phase 3 `fork()`
plumbing (`packages/sandbox/src/factory.js#forkSlice`), the
`SandboxHandle` exo surface
(`packages/sandbox/src/types.d.ts:330-336` — `spawn` / `mount` /
`scratch` / `open` / `fork` / `reset` / `dispose`; **no
`makeUnconfined`**), the daemon's `make-unconfined` formula shape
(`packages/daemon/src/daemon.js:3971` — `{ worker, powers, specifier,
env }`, no `introducedNames` channel), and the genie boot
(`packages/genie/setup.js`,
`packages/genie/main.js:128 make()`,
`packages/genie/CLAUDE.md` § "Boot shape").
See § "Decision rationale" below for the supporting evidence.

### Prerequisite status

Phase 3 nesting plumbing
([`TADA/21_…`](../TADA/21_endo_posix_sandbox_phase3_nesting.md))
is fully implemented (every deliverable ticked,
`SandboxHandle.fork()` lives behind a real `forkSlice` in
`packages/sandbox/src/factory.js`).
Phase 3.5a
([`TADA/22_…`](../TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md))
has decisions recorded but **none of its deliverables have landed in
code** — `packages/genie/setup.js` does not provision a
`workspace-mount`, does not register `sandbox-factory`, and
`packages/genie/main.js` has zero references to the sandbox plugin.
3.5b's implementation is therefore blocked on 3.5a's deliverables
landing first; this task captures decisions and refines deliverables
so the work can start the moment 3.5a's slice handle is reachable
under `main-genie-sandbox`.

### Decisions

1. **Surface shape: `/spawn` builtin in the specials dispatcher.**
   Add `/spawn`, `/agents` (list), and `/remove-agent` builtins
   alongside the existing `/help`, `/model`, `/observe`, `/reflect`
   handlers in `packages/genie/main.js`'s call to
   `makeSpecialsDispatcher` (line ~733), wired through
   `makeBuiltinSpecials` in
   `packages/genie/src/loop/builtin-specials.js`.
   _Rejected alternative_: a CapTP method
   (`genie.spawnSubAgent(name, opts)`) on the root genie's exo
   (`GenieInterface` at `packages/genie/main.js:102`).
   The operator UX for the bottle is "send mail to the genie's
   `@self`" — every existing operator command (`/help`, `/model`,
   `/observe`, `/reflect`) lands in the dispatcher and the operator
   never reaches for `endo send`.
   Adding a CapTP method would introduce a second surface that
   duplicates the dispatcher's auth model (the operator already has
   guest access to `@self`; they do not separately have a cap to the
   `main-genie` exo).
   The CapTP method can be added later as a thin wrapper over the
   shared internal helper if a programmatic caller materialises;
   shipping with `/spawn` first matches today's UX and keeps the
   surface count flat.

2. **Parent slice handle naming: flat `<agentName>-sandbox`.**
   A child agent's sub-slice is GC-pinned at
   `<agentName>-sandbox` in the same flat keyspace 3.5a uses for
   `main-genie-sandbox`.
   _Rejected alternative_:
   `<agentDirectory>/<agentName>-sandbox` (scoped under the
   parent's agent directory).
   3.5a's Decision 3 puts the slice formula inside `packages/sandbox`
   with `SandboxFactory.makePersistent(name, …)` keyed by a flat
   `name` string; embedding a `/` in the pet name would either
   require a sandbox-side keyspace change (out of scope) or treat
   the slash as part of the literal name (confusing, since the
   parent's `agentDirectory` is a pet-namespace path in the parent
   *guest's* pet store, while slice handles live in the sandbox
   plugin's daemon-state — different namespaces).
   The flat naming keeps the slice-formula keyspace shape unchanged
   from 3.5a.
   The pet-namespace locator under
   `<agentDirectory>/<agentName>` (parent's guest pet store) and
   the slice-handle pin under `<agentName>-sandbox` (sandbox
   plugin's keyspace) coexist as two parallel records of the same
   child, each in its natural keyspace.

3. **Sub-agent boot path: reuse dormant `spawnAgent` body, fork
   first, keep the sub-agent's Node worker on the host (parity with
   3.5a Decision 2).**
   The revived `spawnAgent` flow becomes:
   1. `await E(parentSlice).fork(childSpec)` mints `<agentName>-sandbox`.
   2. `await E(parentHost).provideGuest(agentName,
      { introducedNames: { '<agentName>-sandbox': 'sandbox', … } })`
      mints the child's guest identity, threading the sub-slice cap
      through `introducedNames` so the child's `main.js` can resolve
      it from `powers` exactly as 3.5a's root genie resolves
      `main-genie-sandbox`.
      The previous `workspace-mount` introduction is dropped — the
      sub-slice's mount view replaces it.
   3. Standard daemon `makeUnconfined` materialises `main.js` as the
      child's worker on the host, the same way 3.5a materialises
      the root genie.
   4. Inside the child's `main.js`, the existing tool-spawn
      chokepoint (`packages/genie/src/tools/command.js:346`) routes
      through the sub-slice handle the child resolved from `powers`.
   _Rejected alternative_: spawn the sub-agent worker directly via
   `E(slice).spawn(['node', 'main.js'], { env })`.
   `SandboxHandle` has no `makeUnconfined`, and `slice.spawn`
   produces a `ProcessHandle` whose stdio is plain pipes — there is
   no daemon-side CapTP transport across the namespace boundary,
   which is precisely the open design question
   [`TODO/24_endo_posix_sandbox_phase3_5a_worker_inside_slice.md`](./24_endo_posix_sandbox_phase3_5a_worker_inside_slice.md)
   exists to resolve.
   Spawning the worker via `slice.spawn` would orphan the
   sub-agent from the daemon's mail / guest-identity surface and
   reproduce 24's transport problem inside 3.5b.
   The "sub-agent worker inside the sub-slice" follow-up is filed
   parallel to 24 — see § "Follow-ups filed" — and 3.5b ships the
   intermediate (host-worker, slice-confined-tools) shape that
   parallels 3.5a exactly.
   _Also rejected_: generalise `setup.js` into a
   `(slice, hostAgent, env)` launcher reused by root and sub-agents.
   `setup.js` is a 50-line operator-side bootstrap (provision the
   workspace mount + register `sandbox-factory` + call
   `makeUnconfined`) that runs once per bottle from the host's POV;
   sub-agents bootstrap from a parent guest's POV with already-
   provisioned plugin caps.
   The shapes do not overlap enough to justify the abstraction.

### Follow-ups filed

- **Sub-agent worker inside its sub-slice** (parallel to TODO/24
  for the root genie).
  File a sibling TODO when 3.5b's host-worker shape is shipping;
  blocked on 24's transport-across-namespace decision.
  Until then, sub-agents share the daemon's host-side worker
  exposure with the root genie.

### Decision rationale

- **Three-tier dispatch already present.**
  `packages/genie/main.js:733-746` wires `makeSpecialsDispatcher`
  with five handlers; adding `/spawn` is a one-line addition to the
  `handlers` object plus a new entry in
  `makeBuiltinSpecials`'s return object.
  The agent's piAgent is downstream of the dispatcher (the
  dispatcher routes operator-typed `/`-prefixed messages before
  they reach the LLM), so a `/spawn` builtin is the natural
  authority surface for spawn / list / remove.

- **Slice formula keyspace is flat.**
  3.5a's Decision 3 commits to
  `SandboxFactory.makePersistent(name, opts)` with `name` as a
  flat string under the sandbox plugin's daemon-state.
  `name` is a pet-name-shaped identifier (lowercase alphanumeric +
  dash, the same guard `provideGuest` enforces); a `/` would either
  break that guard or be treated as a literal character that the
  filesystem-backed state directory would have to handle specially.
  Keeping it flat avoids both edges.

- **`introducedNames` is the cap-passing channel for guests.**
  `packages/daemon/src/host.js:46-54` shows
  `MakeHostOrGuestOptions.introducedNames: Record<Name, PetName>`,
  where the key is resolved in the host's namespace and the value
  is a pet name in the new guest's namespace.
  Threading the sub-slice cap as
  `{ '<agentName>-sandbox': 'sandbox' }` lets the child's `main.js`
  resolve it from `powers` with the same idiom 3.5a's root genie
  uses for `main-genie-sandbox`.
  No new daemon-side plumbing is required.

- **`makeUnconfined` has no `introducedNames` (and that does not
  matter here).**
  The daemon-side `make-unconfined` formula is `{ worker, powers,
  specifier, env }` (`packages/daemon/src/daemon.js:3971`).
  3.5a Decision 1 routes around this by giving the worker access
  to the slice through `powers` (the host's pet store).
  3.5b can do the same: the child's `powers` is the agentGuest,
  and the sub-slice cap is in the agentGuest's pet store via
  `provideGuest`'s `introducedNames`, not via `makeUnconfined`'s
  formula.

- **`slice.spawn` returns `ProcessHandle`, not an `EndoWorker`.**
  `packages/sandbox/src/types.d.ts` (interfaces.js:183-196):
  `spawn(argv, opts) => Promise<ProcessHandle>` with `pid()`,
  `stdin()`, `stdout()`, `stderr()`, `wait()`, `kill()`.
  The daemon's `makeUnconfined` returns an `EndoWorker` whose
  `result` is a remotable resolved through the worker's CapTP
  channel.
  `slice.spawn` does not establish that channel; reaching for it
  to materialise a sub-agent worker would orphan the worker from
  the daemon's mail / guest surface, breaking the entire reason
  the genie is a daemon-resident plugin.

- **`makeBuiltinSpecials` already takes the agent context.**
  `packages/genie/main.js:720-726`:
  `makeBuiltinSpecials({ agents: agentsRef, workspaceDir, io,
  state, persistence })`.
  Adding `hostAgent` (and a `parentSliceHandle` once 3.5a lands)
  to that bag exposes the dependencies the spawn / list / remove
  builtins need without rethreading the dispatcher's contract.

## Deliverables

Each item below is gated on the decisions above.
Decisions recorded; struck entries are crossed out and a one-line
reason follows.

- [ ] **Sub-slice mint via `fork()`, pinned at `<agentName>-sandbox`.**
  Per Decision 2, the revived `spawnAgent` first calls
  `await E(parentSlice).fork(childSpec)` to mint a sub-slice, then
  pins it as `<agentName>-sandbox` via the same
  `SandboxFactory.makePersistent(name, …)` formula 3.5a settles on
  for `main-genie-sandbox` (3.5a-deliverable-1; this task assumes it
  has landed).
  `childSpec` carries the operator-supplied attenuation:
  - mount drops / `rw → ro` downgrades / sub-path scopes for
    "scoped within parent" — Phase 3's
    `validateAndResolveChildMounts`
    (`packages/sandbox/src/factory.js`) accepts these as-is;
  - newly-granted `Mount` caps for "wholly separate" — supplied as
    extra `mounts[]` entries.
  The Phase 3 plumbing rejects unsupported attenuations (a `Mount`
  cap the parent does not have; `ro → rw` upgrade; network
  broadening) with structured `makeError(X\`fork: …\`)` throws — the
  `/spawn` builtin must surface those as friendly operator-facing
  responses, not raw CapTP rejections.

- [ ] **Sub-agent identity, with the sub-slice in `introducedNames`.**
  After the sub-slice is pinned, call
  `E(parentHost).provideGuest(agentName, { introducedNames })`
  where `introducedNames` is at minimum:
  ```
  { '<agentName>-sandbox': 'sandbox' }
  ```
  plus any operator-granted extras (e.g. a `Mount` cap to introduce
  as `'workspace'` in scoped-within-parent mode if the operator
  wants the child to see the host-side workspace path the way 3.5a
  exposes `workspace-mount` to the root genie).
  The dormant helper's `'workspace-mount': 'workspace'` introduction
  is **dropped** in the new path — the sub-slice's mount view is the
  authoritative `/workspace`, exactly as it is for the root genie.
  Document the swap in `packages/genie/CLAUDE.md` § "Sub-agent
  spawning".

- [x] ~~**Land `main.js` inside the sub-slice.**~~
  Struck per Decision 3.
  3.5b ships the host-worker / slice-confined-tools shape that
  parallels 3.5a Decision 2; the sub-agent's `main.js` is launched
  via the daemon's `makeUnconfined`, not `slice.spawn`.
  The full "worker inside the sub-slice" shape is filed as a
  follow-up parallel to
  [`24_endo_posix_sandbox_phase3_5a_worker_inside_slice.md`](./24_endo_posix_sandbox_phase3_5a_worker_inside_slice.md);
  it lands once 24's transport-across-namespace decision is made
  for the root genie and re-applies to children.

- [ ] **Sub-agent worker boot via daemon `makeUnconfined`.**
  After `provideGuest`, materialise the child's worker via
  `E(agentGuest).makeUnconfined('@main', genieSpecifier, {
  powersName: '@agent', resultName: 'main-genie', env })`.
  The child's `env` is the same `GENIE_*` shape `setup.js`
  forwards today (model, workspace, name, heartbeat tuning,
  observer / reflector overrides, agent directory) but with two
  child-specific tweaks:
  - `GENIE_NAME` defaults to `agentName` (not `main-genie`);
  - `GENIE_WORKSPACE` is the **slice-internal** path (`/workspace`)
    — the child resolves the `sandbox` introduction from `powers`
    and routes its tool spawns through it, so the host-path /
    slice-path duality 3.5a documents in
    `packages/genie/CLAUDE.md` applies recursively.
  The result-name `main-genie` is preserved so the child's exo
  pin is locally resolvable from the agent's own pet store, even
  though the parent reaches the child via its locator (next item).

- [ ] **`agentDirectory` tracking.**
  Preserve the dormant helper's behaviour of recording the child's
  locator at `<agentDirectory>/<agentName>` in the parent's pet
  namespace via `E(parentPowers).makeDirectory(agentDirName)` +
  `E(parentPowers).storeLocator([agentDirName, agentName],
  childLocator)` (existing `spawnAgent` lines 1144-1156).
  Operators / sibling agents discover children via that path — no
  bespoke registry.
  Note the parallel to the slice-handle pin: locator lives in the
  parent guest's pet store under `<agentDirectory>/<agentName>`;
  slice handle lives in the sandbox plugin's daemon-state under
  `<agentName>-sandbox` (Decision 2).
  `removeChildAgent` clears both records.

- [ ] **`removeChildAgent` — three-step teardown.**
  Tear down in this order:
  1. `await E(sliceHandle).dispose()` — Phase 3's GC fires the
     cascade for any in-slice processes
     (`packages/sandbox/src/factory.js#disposeSlice`).
  2. `await E(parentHost).remove(agentName)` — drops the host-level
     guest reference; daemon GC reaps the orphaned guest formula.
  3. `await E(parentPowers).remove(agentDirName, agentName)` —
     clears the directory entry so future `listChildAgents` calls
     do not surface a tombstone.
  Document the ordering: the slice goes first so a still-running
  child cannot race the guest removal and resurrect itself via its
  own pet store.

- [ ] **`listChildAgents`.**
  Expose unchanged externally — it walks the `agentDirectory`
  pet-namespace entries — but document that each entry now
  corresponds to a live sub-slice (`<agentName>-sandbox` in the
  sandbox plugin's keyspace) **and** a guest (`<agentName>` in the
  parent host's pet store).
  Optional liveness probe: for each name, the helper may
  `E(parentHost).has(agentName)` and report any tombstones the
  three-step teardown skipped (defence in depth against a
  half-failed `removeChildAgent`).

- [ ] **`/spawn`, `/agents`, `/remove-agent` specials** (per
  Decision 1).
  Add three handlers to `makeBuiltinSpecials`
  (`packages/genie/src/loop/builtin-specials.js`) and mount them in
  `makeSpecialsDispatcher`'s `handlers` map at
  `packages/genie/main.js:733`:
  - `/spawn <name> [--mode=scoped|separate] [--mount=<petname>:<innerPath>:<mode>]…
    [--network=<profile>] [--model=<spec>]` — invokes the shared
    `spawnSubAgent(hostAgent, parentSliceHandle, parentPowers,
    name, opts)` helper extracted from the dormant `spawnAgent`,
    surfacing fork()'s structured errors as friendly text.
  - `/agents` (or `/list-agents`) — invokes the shared
    `listSubAgents(parentPowers, config)` helper, prints one line
    per child (name, slice state, guest pet name).
  - `/remove-agent <name>` — invokes
    `removeSubAgent(parentHost, parentPowers, sliceHandle, name)`,
    prints a confirmation or the structured error.
  Update `makeBuiltinSpecials`'s factory signature to take
  `hostAgent` and `parentSliceHandle` (both already in scope at
  the dispatcher construction site, lines 720-726) and propagate
  through `formatHelpLines` so `/help` lists the new builtins.

- [ ] **Parent-disposal cascade.**
  Phase 3 promises that `parent.dispose()` disposes every live
  child first
  (`packages/sandbox/src/factory.js#FactorySliceContext.children`
  bookkeeping; verified by
  `packages/sandbox/test/fork.test.js` "GC ordering" suite).
  Verify the genie root's worker shutdown path and the daemon
  restart path do not leak orphaned sub-slice scratch dirs.
  Add a regression test that kills the root genie's worker
  process (or restarts the daemon) and asserts every sub-slice
  scratch directory is reaped (`fs.readdir(stateDir/sandbox)`
  should not list any `<agentName>-sandbox` whose parent is gone).

- [ ] **Tests** — `packages/genie/test/sub-agent.test.js` (new
  file; reuse the daemon-fork helpers from
  `packages/genie/test/boot/self-boot.test.js`):
  - [ ] Spawn a sub-agent in **scoped** mode with a
    `/workspace/proj-a/` sub-path attenuation against the root
    genie's `main-genie-sandbox`; the child runs a `bash` tool
    invocation that `ls /workspace` and assert it sees only
    `proj-a`'s contents (the child's tool channel routes through
    `<agentName>-sandbox`, not `main-genie-sandbox`).
  - [ ] Spawn a sub-agent in **separate** mode with a
    freshly-granted standalone `Mount`; assert the child's
    `/workspace` (via a `bash` tool call) is the new mount and
    that the parent's workspace is unreachable from the child.
  - [ ] Mount-grant rejection: `/spawn` with a `Mount` cap the
    parent does not have; assert the spawn fails before any
    guest is provisioned (Phase 3's `fork()` rejects with
    `not within any parent mount`, the `/spawn` builtin surfaces
    a clean operator-readable message, and `parentHost.has(name)`
    remains `false` afterwards).
  - [ ] Network-attenuation: `/spawn` a child requesting
    `host-net` when the parent is `private`; assert rejection
    with the structured error shape
    (`child network 'host-net' is broader than parent's
    'private'`) and no guest provisioned.
  - [ ] Removal: `/remove-agent` tears down the sub-slice,
    removes the guest, and clears the directory entry; assert all
    three via post-conditions on `/agents` output (name absent),
    `parentHost.has(name)` (`false`), and the slice's reported
    state (the sandbox-plugin's pet store no longer lists
    `<agentName>-sandbox`).
  - [ ] Teardown ordering: a child whose `bash` tool is mid-spawn
    is reaped cleanly when `/remove-agent` fires — the in-slice
    process exits via the Phase 3 dispose cascade before the
    guest removal happens.
  - [ ] Cascade: dispose the parent (kill the root-genie worker)
    while a child has a long-running `bash` tool; assert the
    child's process tree is reaped before parent teardown returns
    (Phase 3 GC ordering, observed via `/proc` from the test).
  - [ ] Both backends (`bwrap`, `podman`), gated on the
    per-backend availability check
    `packages/sandbox/test/fork.test.js` already uses.

- [ ] **Docs**:
  - [ ] `packages/genie/CLAUDE.md` § "Sub-agent spawning" updated
    from "deferred" to a description of the live capability,
    referencing this task's TADA when it lands; cross-link the
    `/spawn`, `/agents`, `/remove-agent` builtins and the
    flat-naming convention `<agentName>-sandbox`.
  - [ ] `packages/genie/README.md` gets a "Sub-agents" section
    explaining the two attenuation modes (scoped within parent
    vs. wholly separate) and the operator UX (`/spawn` and
    siblings).
  - [ ] `PLAN/endo_posix_sandbox.md` § "Phase 3.5b" gets a
    "landed" pointer once this task closes, plus a forward
    pointer to the still-open "sub-agent worker inside sub-slice"
    follow-up.
  - [ ] `packages/sandbox/README.md` § "Nested slices" cross-links
    the genie integration as a worked example of the attenuation
    rules (scoped sub-path mount + `private` network inheritance).

## Exit criteria

A Phase 3.5a-sandboxed root genie can, on operator command via
`/spawn`:

- Spawn a named sub-agent in either attenuation mode (scoped within
  parent or wholly separate).
- Run that sub-agent's `main.js` as an unconfined worklet under the
  daemon (host-side, parallel to 3.5a's root-genie shape) with its
  own guest identity, an agent-directory entry under
  `<agentDirectory>/<agentName>`, and a sub-slice pinned at
  `<agentName>-sandbox` whose mount view is the child's
  `/workspace`.
- Enumerate live sub-agents via `/agents` (or the operator-driven
  CapTP equivalent if the surface is later widened).
- Cleanly remove a sub-agent via `/remove-agent`, tearing down the
  sub-slice (Phase 3 cascade reaps in-slice processes), removing
  the guest, and clearing the directory entry — in that order.

The acceptance suite runs under both bwrap and podman, exercises
both attenuation modes, and asserts that a sub-agent cannot reach
a parent-only mount through its tool channel or upgrade its
network profile.

The sub-agent's Node worker process itself remains on the host
(parallel to 3.5a Decision 2); pushing the worker into the
sub-slice is a follow-up parallel to TODO/24, deferred until the
transport-across-namespace question is resolved for the root
genie.

## Out of scope

- New genie tools that target sub-agents (e.g. a "delegate task to
  sub-agent" tool surface) — those are agent-loop concerns layered
  on top of the spawn capability, tracked separately.
- Cross-bottle sub-agents (a sub-agent on a different daemon than
  the parent) — the slice attenuation model assumes the parent and
  child share a daemon.
  Cross-bottle delegation is a future PLAN item.
- Resource-cap inheritance for sub-agents beyond what Phase 3's
  `prlimit` cascade gives — revisit when Phase 1.5's cgroup work
  moves past best effort.
- Renderer / familiar reach into sub-agents (Phase 7).
- **Sub-agent Node worker inside its sub-slice** (per Decision 3).
  The 3.5b shape parallels 3.5a Decision 2: tools confined,
  worker on host.
  The worker-inside-sub-slice variant is filed as a follow-up
  parallel to
  [`24_endo_posix_sandbox_phase3_5a_worker_inside_slice.md`](./24_endo_posix_sandbox_phase3_5a_worker_inside_slice.md);
  it will land after 24 resolves the transport-across-namespace
  design question for the root genie.
- **CapTP method on the genie exo** (per Decision 1 — rejected
  alternative).
  Adding `genie.spawnSubAgent` to `GenieInterface` is a separate
  optional follow-up if a programmatic caller surfaces; the
  `/spawn` builtin is the v1 surface.
