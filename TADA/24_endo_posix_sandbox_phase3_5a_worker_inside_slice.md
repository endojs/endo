# Endo POSIX Sandbox — Phase 3.5a follow-up: worker inside the slice

The Phase 3.5a root-genie integration
([`22_…`](./22_endo_posix_sandbox_phase3_5a_genie_workspace.md))
delivers an intermediate shape: tool spawns (`bash` / `exec` / `git`)
route through `E(slice).spawn(...)`, but the `main-genie` Node worker
itself stays on the host filesystem.
This task closes that residual exposure by pushing the worker process
into the slice.

## Why this is staged

The intermediate shape ships against today's daemon unchanged —
`makeUnconfined` invokes `module.main(powers, context, { env })` via
in-process `import()`
([`packages/daemon/src/worker.js:85`](../packages/daemon/src/worker.js)),
so confining the tools is a one-line swap at
[`packages/genie/src/tools/command.js:346`](../packages/genie/src/tools/command.js)
and a slice-mint in `main.js`.

Pushing the worker into the slice is meaningful daemon plumbing:

- the worker spawn (today: `child_process.spawn` of `node` from the
  daemon process, see
  [`packages/daemon/src/daemon-node-powers.js`](../packages/daemon/src/daemon-node-powers.js)
  for the worker-launch path) must be wrapped by `bwrap` /
  `podman` / etc., with the same cap-resolution pipeline the
  sandbox plugin already runs in `prepareSlice`;
- the daemon ↔ worker CapTP transport (today: a Node IPC channel /
  `MessagePort` between the daemon process and its child worker
  process) must traverse the namespace boundary the slice
  introduces — either by exposing the IPC channel into the slice
  via a known fd that bwrap forwards, or by switching the transport
  to a unix socket the sandbox plugin already binds in the slice's
  view.

These are the two open design questions this follow-up resolves.

## Goal

`main-genie`'s Node worker process runs inside the same
`SandboxHandle` that confines its tools.
External CapTP behaviour (the operator's `endo send`, `/help`, `/model`,
heartbeat ticks, observer / reflector self-sends) is unchanged.

The genie cannot reach host paths outside the workspace mount even via
an `eval`-path mishap in `main.js` itself, because Node has no view of
those paths.

## Scope

- Daemon-side: a way to ask `makeUnconfined` (or a sibling formula —
  e.g. `makeUnconfinedInSlice`) to launch the worker through a
  `SandboxHandle.spawn` rather than `child_process.spawn`.
- Sandbox-side: a helper on `SandboxHandle` that takes a node-script
  path + IPC fd plumbing and returns a `ProcessHandle` whose stdio /
  IPC channel the daemon can adopt as a worker.
- Worker-side: nothing in 3.5a-host-shape needs to change inside
  `main.js`; the worker still receives `powers` via the same CapTP
  channel, just over a transport that crosses the namespace boundary.

## Decisions to record at task-authoring time

The two questions the PLAN flagged are answered below.
See [§ "Decision rationale"](#decision-rationale) for the supporting
evidence drawn from today's daemon and sandbox sources.

### Decisions

1. **IPC transport: unix socket in a slice-visible scratch mount.**
   The sandbox factory mints an ephemeral scratch mount (the existing
   `SandboxHandle.scratch(innerPath)` surface, see
   [`packages/sandbox/src/types.d.ts:326`](../packages/sandbox/src/types.d.ts))
   at a known inner path (`/run/endo`).
   The daemon binds a unix listening socket on the corresponding host
   path (`<scratchHostPath>/worker.sock`) using the same
   `socketPowers.servePath` plumbing
   [`servePrivatePath`](../packages/daemon/src/serve-private-path.js)
   already drives.
   The slice-resident `worker-node-in-slice.js` entry point connects
   to `/run/endo/worker.sock`, and the daemon adopts the resulting
   reader/writer pair into `makeNetstringCapTP` exactly the way
   today's `popen.fork` path adopts the fd 3 / fd 4 pipes.

   _Rejected alternative — pass-through fd:_
   the daemon could fork bwrap with the fd 3 / fd 4 pipes already
   open and ask bwrap to inherit them through `--bind /proc/self/fd/N
   <inner-path>`, but that lands two problems:
   (a) bwrap closes all non-stdio fds before exec by default
   ([`packages/sandbox/src/drivers/bwrap.js:554`](../packages/sandbox/src/drivers/bwrap.js)
   passes only `stdio: ['pipe', 'pipe', 'pipe']`), so the bwrap
   driver's `spawn()` would have to grow a new "extra fds to forward"
   parameter; and
   (b) the same surface has to be re-implemented for podman
   (`--preserve-fd`), lima (over SSH/virtio — no fd to forward), and
   WSL2 (no fd to forward).
   A unix socket in a scratch mount composes uniformly across every
   driver (each driver already supports a slice-visible writable
   scratch path), and reuses the daemon's existing UDS code path.
   The fd-forwarding shape stays available as an optimisation under
   bwrap if the cost ever matters.

2. **Formula shape: pin the slice on the *worker* formula, not on
   `make-unconfined`.**
   Introduce a new `worker-in-slice` formula type
   `{ type: 'worker-in-slice', slice: <sliceFormulaId>, trustedShims?,
   label? }` alongside the existing `worker` formula
   ([`packages/daemon/src/daemon.js:2213`](../packages/daemon/src/daemon.js)
   `makeIdentifiedWorker`).
   The new formula's reactor depends on the slice formula by id so
   GC ordering and reincarnation-on-restart fall out for free
   (slice re-mints first, then the worker).
   `make-unconfined` is unchanged: its `worker: <workerId>` field
   already carries the worker reference, and whether that worker is
   a host process or a slice-resident process is invisible to the
   `make-unconfined` reactor.
   `make-bundle` composes for free for the same reason.

   _Rejected alternatives:_
   - _Extend `make-unconfined` with an optional `slice` field_:
     pushes the sliceness one layer too high in the stack.
     A worker can host an `evaluate`, a `make-unconfined`, and a
     `make-bundle` simultaneously
     ([`packages/daemon/src/worker.js:51-112`](../packages/daemon/src/worker.js));
     attaching the slice to the worker confines all three.
     Attaching it to `make-unconfined` only confines that one path.
   - _Extend the existing `worker` formula with an optional `slice`
     field_: would change the disk shape of every pinned worker
     formula and force a migration.
     The sibling type leaves existing pinned workers untouched and
     daemon-restart compatible.

### Decision rationale

- **`SandboxHandle.spawn` already accepts argv + per-spawn env / cwd.**
  `packages/sandbox/src/types.d.ts:319` plus the bwrap driver at
  `packages/sandbox/src/drivers/bwrap.js:511` show the surface is a
  superset of what `popen.fork` uses; what is missing is only:
  (a) extra fds (the rejected fd-pass-through shape would need
  these), and (b) capturing stdin as a writer (already supported).
  No new sandbox-surface verb is required for the unix-socket shape.

- **Daemon worker spawn = `popen.fork` with fd-3 / fd-4 pipes.**
  `packages/daemon/src/daemon-node-powers.js:646-661` and
  `packages/daemon/src/worker-node-powers.js:14-23` show the daemon
  writes to child fd 3 and reads from child fd 4, both wrapped in
  `makeNetstringCapTP`.
  The `'ipc'` slot at index 5 is required by `popen.fork` semantics
  but is **not used by the worker's CapTP transport** (no
  `process.send` calls in `worker-node.js` or `worker.js`), so it
  does not need to be preserved when the spawn switches to bwrap +
  unix socket.
  The transport is plain netstring CapTP over a duplex byte stream;
  a unix socket is byte-for-byte equivalent.

- **Existing `servePrivatePath` infrastructure plus `socketPowers`.**
  `packages/daemon/src/serve-private-path.js:30` and
  `packages/daemon/src/daemon-node-powers.js:30-99` show the daemon
  already binds-and-accepts unix sockets and pipes the resulting
  reader/writer pair into `makeNetstringCapTP`.
  `worker-in-slice` reuses this code path verbatim.

- **`SandboxHandle.scratch(innerPath)` is the slice-visible mount.**
  `packages/sandbox/src/types.d.ts:325-326`: an ephemeral
  slice-lifetime scratch with a known inner path.
  The factory already resolves it to a host path via
  `provideScratchMount` / `provideHostPath`, exactly the privileged
  bridge needed.
  The driver does not need to know about the unix socket — it sees
  only the bind-mount triple.

- **`worker.js:makeUnconfined` is unaffected.**
  The worker's CapTP-side surface
  (`evaluate`, `makeUnconfined`, `makeBundle`) operates on whatever
  filesystem its Node process actually sees;
  inside the slice, the daemon's `make-unconfined` reactor passes a
  slice-internal path (`/workspace/main.js` etc.) and the worker's
  in-process `import()` resolves it locally.
  No worker-side code change is needed beyond switching the
  fd-3 / fd-4 reader/writer for a unix-socket reader/writer
  (`worker-node-in-slice.js`).

## Deliverables

Each item below is gated on the decisions above.

- [ ] **Daemon-side `worker-in-slice` formula type and reactor.**
  Add a `'worker-in-slice'` case to the `formulaType → reactor` map in
  `packages/daemon/src/daemon.js` (next to the existing `'worker'`
  reactor at `daemon.js:2213`).
  The reactor:
  1. resolves the formula's `slice` field to a `SandboxHandle` via
     `provide()`,
  2. asks the slice for an ephemeral scratch mount at `/run/endo`
     (via `E(slice).scratch('/run/endo')`),
  3. binds a unix listening socket at
     `<scratchHostPath>/worker.sock` using `socketPowers.servePath`,
  4. calls `E(slice).spawn(['node', '/run/endo/worker-node-in-slice.js'],
     { env: { ENDO_WORKER_SOCK: '/run/endo/worker.sock', ... } })`,
  5. accepts the inbound connection and adopts the
     reader/writer pair into `makeNetstringCapTP`, returning the
     same `{ workerTerminated, workerDaemonFacet }` shape the host
     `makeWorker` returns.
  The new path lives next to `makeIdentifiedWorker` and reuses
  `makeDaemonFacetForWorker`, the worker-cancellation plumbing
  (`workerCancelled` / `forceCancelled`), and the
  `workerTerminationByNumber` registry without modification.

- [ ] **`worker-node-in-slice.js` entry point** in
  `packages/daemon/src/`.
  A sibling of `worker-node.js` that opens the unix socket named in
  `process.env.ENDO_WORKER_SOCK` (or a positional argv) instead of fd 3
  / fd 4, derives a reader/writer with `makeNodeReader` /
  `makeNodeWriter`, and otherwise calls `main(powers, pid, cancel,
  cancelled)` from `worker.js` exactly as today.
  The worker bootstrap path
  (`@endo/init`, `makePromiseKit`, SIGINT handling) is unchanged.

- [ ] **Worker-script materialisation inside the slice.**
  The slice has no view of the daemon's source tree.
  Two viable shapes — pick one during implementation:
  1. _Tarball + minimal-rootfs ship-along_: the sandbox plugin's
     scratch mount is seeded with a frozen `worker-bundle/` tarball
     containing `worker-node-in-slice.js` plus its node_modules
     closure, materialised once at slice-mint time.
     Requires a build step.
  2. _Host-bind the daemon source tree read-only_: the slice's
     `host-bind` rootfs already binds `/usr` etc.; extend it to
     bind the daemon's package directory at a known inner path
     (e.g. `/opt/endo`) and exec
     `node /opt/endo/packages/daemon/src/worker-node-in-slice.js`.
     No build step; trades a wider read-only host view for
     simplicity.
  Document the choice and the residual exposure (option 2 makes
  the daemon source readable from inside the slice; option 1 does
  not).

- [ ] **Slice formula carries the worker scratch via the existing
  `make-unconfined-in-slice` shape from 3.5a.**
  The slice already lives at `main-genie-sandbox` per Phase 3.5a's
  Decision 3.
  No new slice-side formula is needed; the `worker-in-slice` formula
  references the same slice id `setup.js` already pins.

- [ ] **`setup.js` opt-in.**
  After the workspace mount and sandbox plugin registration land in
  3.5a, replace the
  `E(hostAgent).makeUnconfined('@main', main.js, …)` call site at
  `packages/genie/setup.js` with a flow that:
  1. ensures `main-genie-sandbox` exists (3.5a delivery),
  2. formulates a `worker-in-slice` worker pinning that slice,
  3. formulates a `make-unconfined` referencing that worker.
  Idempotent on re-run via the existing `has('main-genie')`
  short-circuit.
  When the operator's host has no working sandbox backend, fall
  back to the 3.5a host-shape worker with a banner-level warning
  from `bottle.sh` (matches the 3.5a missing-backend warning).

- [ ] **Reincarnation order.**
  The `worker-in-slice` formula's `slice` field is a formula id;
  the formula graph treats the slice as a dependency, so a daemon
  restart re-mints `main-genie-sandbox` (the slice) before
  reincarnating the worker that points at it.
  Document the dependency in
  `packages/daemon/src/daemon.js` next to the `'worker-in-slice'`
  reactor and verify by reading the existing GC-ordering tests
  before adding a new one — the `Mount` → `make-unconfined`
  ordering already exercises the dependency-edge plumbing this
  reuses.

- [ ] **`bash` / `exec` / `git` tool routing remains unchanged.**
  The genie's tool chokepoint at
  `packages/genie/src/tools/command.js:346` already calls
  `E(slice).spawn(...)` post-3.5a.
  Inside the slice-resident worker, `slice` resolves to a *sibling*
  process inside the same slice — `SandboxHandle.spawn` mints a
  new bwrap-namespace child that joins the slice's existing
  namespace, not a fresh slice.
  Verify the bwrap driver's spawn behaviour for a slice
  pre-existing inside another bwrap namespace, and document the
  observed shape (recursive bwrap re-exec vs. nsenter into the
  parent's pid namespace).
  This is the closest the Phase 3 nesting plumbing gets to being
  exercised by 3.5a-follow-up — note the cross-reference.

- [ ] **Tests.**
  Add to `packages/daemon/test/` (or a new `packages/sandbox/test/`
  acceptance test if the smoke involves the sandbox plugin):
  - [ ] _`/proc/self/root` smoke_: spawn a worker via
    `worker-in-slice`, run an `evaluate` that reads
    `/proc/self/root`'s symlink target, assert it differs from
    the daemon's `/proc/self/root`.
  - [ ] _`process.cwd()` is slice-internal_: an `evaluate` that
    returns `process.cwd()` reports `/workspace` (or the slice's
    configured cwd), not the host workspace path.
  - [ ] _Host path invisibility_: a `make-unconfined` of a tiny
    test caplet that attempts to `import` an absolute host path
    outside `/workspace` rejects with `MODULE_NOT_FOUND`.
  - [ ] _CapTP transport round-trip_: an `evaluate` returning a
    1 MiB string survives the unix-socket transport without
    truncation or corruption (regression for the netstring
    framing on a non-fd transport).
  - [ ] _Daemon restart reincarnates in order_: kill the daemon,
    restart, assert the slice is re-minted before the worker by
    inspecting the `daemon-state` log in test fixtures.
  - [ ] _Backend-missing fallback_: on a host with bwrap absent,
    `setup.js` falls back to the 3.5a host-shape worker and the
    banner warns; the test runs the daemon with bwrap stubbed out
    via `ENDO_WORKER_SUBPROCESS_PATH` or an equivalent override.

- [ ] **Docs.**
  - [ ] `packages/genie/CLAUDE.md` § "Boot shape" updated: the
    `main-genie` worker is now the `worker-in-slice` reactor's
    output; the slice is `main-genie-sandbox`; the unix-socket
    transport is named.
  - [ ] `packages/genie/README.md` § "Sandboxed workspace"
    revised: the residual `eval`-path exposure 3.5a documented is
    closed; only operator-granted mounts and the
    `network: 'private'` egress survive as intentional surface.
  - [ ] `PLAN/endo_posix_sandbox.md` § "Phase 3.5a — root-genie
    workspace slice" gains a "landed (worker host-side)" pointer
    to the 3.5a TADA file and a "landed (worker in slice)" pointer
    to this follow-up's TADA when this task closes.
  - [ ] `packages/sandbox/README.md` (if it exists) gets a brief
    "consumers" subsection mentioning that the daemon adopts a
    slice as a worker host via a unix socket in the slice's
    `/run/endo` scratch mount.

## Exit criteria

A `bottle.sh invoke` on a Linux host with bwrap installed brings up a
genie whose `main-genie` Node worker is itself inside the slice's
namespace, with no host path visible to it outside the explicitly
granted workspace mount.
The genie's CapTP UX (operator invite, `endo send`, `/model`, `/help`,
heartbeat, observer, reflector) is unchanged from the 3.5a-host-shape
release.

## Out of scope

- A new `slice.spawn` tool surface for agents; that is Phase 7.
- macOS / Windows worker-in-slice — those compose this work inside a
  lima / WSL2 VM once Phases 4 / 6 land their drivers.
- Confining the daemon process itself.
  This task confines `main-genie`'s worker; the `@self` _daemon_
  remains on the host because it owns the sandbox factory, the
  formula graph, and the unix-socket bind that the slice-resident
  worker connects to.
  Daemon-in-slice is a separate, much larger effort.
- `make-bundle` opting into `worker-in-slice`.
  The decision above keeps `make-bundle` composable for free, but
  no caller wires it that way in this task.
  Add a follow-up if a sandboxed `make-bundle` consumer ships.

## Depends on

- `TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md` lands
  first (workspace mount, sandbox plugin registration, slice
  pinned at `main-genie-sandbox`, tool spawns routed through the
  slice).
  Until 3.5a's deliverables sit on disk, there is no pinned slice
  for `worker-in-slice` to reference.
- The bwrap driver's spawn surface
  ([`packages/sandbox/src/drivers/bwrap.js:511`](../packages/sandbox/src/drivers/bwrap.js))
  is unchanged by this task — the worker is just another argv
  spawned through `SandboxHandle.spawn`.
  No driver-level surface change is required for the unix-socket
  IPC shape; verify on first implementation pass.

## Status

- 2026-04-30: decisions recorded.
  IPC transport = unix socket in `/run/endo` slice scratch.
  Formula shape = new `worker-in-slice` sibling of `worker`;
  `make-unconfined` is unchanged.
  Deliverables list expanded from sketch to per-decision-gated
  items; rationale block added with code-anchor citations.
  Implementation has not started; this task is now task-authored
  and ready to schedule once 3.5a closes.
