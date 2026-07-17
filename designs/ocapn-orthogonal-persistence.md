# OCapN Orthogonal Persistence Machine (`@endo/siesta`)

| | |
|---|---|
| **Created** | 2026-07-16 |
| **Updated** | 2026-07-17 |
| **Author** | Aaron Davis (prompted) |
| **Status** | In Progress |

## Status

A working prototype landed alongside this document (Phases 1 and 2),
and a follow-up pass landed the host side of Phase 3 plus all of
Phase 4:

- `packages/siesta` — the host (`makeSiestaHost`), the OCapN-serving
  daemon wrapper (`makeSiestaDaemon`), serializable CapTP tables
  (`makePersistentTablesKit`), the deterministic worker shell
  (`makeWorkerShell`), the journal-replay reference engine
  (`makeJournalReplayEngine`), and filesystem/memory stores.
- `packages/captp` — new `provideImport(slot, iface)` and
  `provideExport(slot, val)` methods on the object returned by
  `makeCapTP`: the two restore halves of a resumable CapTP session
  (tests in `packages/captp/test/provide-{import,export}.test.js`).
- Phase 3 host side: journals are absolutely indexed and truncated at
  every snapshot point (`truncateJournal` on both stores, atomic on the
  filesystem via header-plus-rename), superseded snapshot refs are
  released to the engine (`WorkerEngine.releaseSnapshot`), and
  `makeSnapshottingReplayEngine` (`canSnapshot: true`) proves the whole
  lifecycle — restore from snapshot ref plus journal suffix, including
  crash recovery — without an XS build
  (`packages/siesta/test/snapshot.test.js`).
- Phase 4: durable host exports. `makeSiestaHost({ resources })` takes
  a registry of resource makers; `host.makeResource(type, description)`
  mints capability objects whose `(type, description)` is recorded
  against the export slot the moment they are exported into a worker
  session (`exportHook`), and re-instantiated at the same slot on
  resume (`captp.provideExport`). `worker.evaluate(source, names,
  values)` carries endowments to guests. `makeTimerResource` is the
  first resource; a pending `delay` wakes a sleeping worker with no
  inbound traffic, and timer nondeterminism is journaled so replay
  stays deterministic (`packages/siesta/test/resources.test.js`).

A third pass completed Phase 3 and extended Phase 4:

- **Phase 3 landed via a rescope** (§ *The XS engine*): rather than
  adapting the endor supervisor — whose generated-bundle toolchain is
  broken on this branch (`bundle-bus-worker-xs.mjs` absent; the
  manager bundler fails on Node-only imports) — a minimal
  `rust/siesta-xs-worker` binary sits directly on the `xsnap` crate,
  with `makeXsEngine` as its `WorkerEngine` adapter and the siesta
  scenarios passing on real XS heap snapshots
  (`packages/siesta/test/xs-engine.test.js`).
  The `xsnap` crate's argument helpers were made `pub` for external
  engine crates.
- **Export durability moved to the export-table layer** (per
  maintainer direction): descriptions live in the serialized tables
  record's export descriptors, recorded by the tables kit's
  `describeExport` power and rebuilt by its `restoreExports`; the
  `WorkerMeta.resources` side table is gone. `provideExport` also
  registers pre-seeded exports in captp's value-to-slot registry.
- **Worker controller** (per maintainer direction; § *The worker
  controller*): built-in `worker-controller` and `worker-facade`
  resources let a controlling worker create other workers and endow
  them from its own heap, with cross-worker links durable at the
  export-table layer as `worker-import` descriptions
  (`packages/siesta/test/worker-controller.test.js`).

## What is the Problem Being Solved?

The Endo daemon achieves durability with *explicit* persistence: every
durable object is described by a formula, and workers restart from
formulas rather than resuming from memory.
That model is powerful but heavy: it entangles the daemon with formula
bookkeeping, and guests must be written against the incarnation
lifecycle.

This design prototypes the opposite corner of the space: a **distributed
ocap machine with pure orthogonal persistence and no upgrade**.
Guest state persists because the engine snapshots the whole heap (XS
snapshots, as built for the Rust `endor` supervisor), not because the
guest described itself in formulas.
A guest is an ordinary hardened-JavaScript program; it never observes
suspension, restoration, or host restarts.
Foregoing upgrade is deliberate: snapshot-restore of a heap cannot
tolerate code changes, and accepting that constraint is what makes the
system radically simpler than the daemon.

The pieces this machine composes already exist in the repository:

- **OCapN** (`packages/ocapn`) for the distributed edge: sessions,
  bootstrap `fetch`, and sturdy refs (`(location, secret)` pairs looked
  up in a locator table).
- **endo-captp** (`packages/captp`) for the host–worker edge, with its
  pluggable import/export tables
  (`makeCapTPImportExportTables`, `packages/captp/src/captp.js`).
- **XS snapshots** (`rust/endo/xsnap`): `write_snapshot`/`from_snapshot`,
  `suspend_to_cas`/`resume_from_cas`, and the supervisor suspend/resume
  protocol from [daemon-xs-worker-snapshot](daemon-xs-worker-snapshot.md).

What is missing — and what this design specifies — is the **host**: a
daemon that spins up orthogonally persistent workers, serializes its half
of each worker's CapTP session so both halves survive restarts, exposes
worker exports as sturdy refs over OCapN, and puts idle workers to sleep.

## Design

### Architecture

```mermaid
flowchart LR
    subgraph remote peers
        C[OCapN client]
    end
    subgraph host daemon
        N[OCapN node<br/>locator: swissnum → presence]
        H[siesta host<br/>one CapTP session per worker]
        S[(store<br/>tables, journal, meta,<br/>publications)]
    end
    subgraph workers
        W1[worker heap<br/>guest + CapTP tables<br/>captured by snapshot]
        W2[worker heap<br/>asleep: snapshot on disk]
    end
    C -- "sturdy ref (location, secret)" --> N
    N -- "E(presence).method(...)" --> H
    H -- "endo-captp messages" --> W1
    H -. "wake on demand" .-> W2
    H --- S
```

The host is a *translation layer*: OCapN deliveries land on host-side
CapTP presences, which forward over the host–worker session.
Nothing else flows through the host; it holds no application state of its
own.

### The worker

A worker is one guest heap behind a CapTP endpoint
(`packages/siesta/src/worker-shell.js`):

- one persistent `Compartment` endowed with pure capabilities
  (`E`, `Far`, `harden`);
- a CapTP bootstrap facet whose `evaluate(source)` evaluates a hardened
  JavaScript expression in that compartment and returns its value.

The shell must be **deterministic**: given the same inbound message
sequence it produces the same state and the same outbound messages.
Determinism is what makes journal replay equivalent to snapshot
restoration, and is also required for the XS engine's
snapshot-plus-journal-suffix restoration.
Endowments are therefore limited to pure capabilities; timers, randomness
and I/O reach guests only as capabilities exported by the host (future
work, § *Host-provided system resources*).

### The engine seam

The host takes a `WorkerEngine` power
(`packages/siesta/src/host.js`):

```js
engine.start({ workerName, snapshot, onOutbound })
  // → { deliver(message), snapshot(), terminate() }
```

- `deliver` injects one CapTP message and settles when the worker has
  processed it, including emitting replies.
- `snapshot` captures the guest heap at quiescence and returns an opaque
  durable ref.
- `terminate` ends the incarnation *without notifying the guest* — the
  guest must never observe its own suspension, so the host never sends
  `CTP_DISCONNECT` to a worker.

Three implementations:

1. **Journal replay** (`makeJournalReplayEngine`, implemented) — the
   reference and test engine.
   Every incarnation starts a fresh worker shell; the host replays the
   full journal of previously delivered messages and drops the worker's
   re-emitted replies (the *replay window*).
   `canSnapshot: false` tells the host to retain the whole journal.
2. **Snapshotting replay** (`makeSnapshottingReplayEngine`,
   implemented) — `canSnapshot: true` without an XS build.
   The snapshot ref is the engine's own log of delivered messages: an
   honest implementation of the snapshot contract (an opaque durable
   value that fully reconstructs guest state) that stands in for XS
   heap bytes.
   It exists to exercise the host's full snapshot lifecycle — journal
   truncation at sleep, restore from ref plus journal suffix, release
   of superseded refs — so the XS engine drops into proven host code.
3. **XS snapshots** (remaining) — incarnations are XS machines under
   the `endor` supervisor.
   `snapshot()` maps to `suspend_to_cas` (returning the content hash),
   `start({ snapshot })` to `resume_from_cas`, and `deliver` to the
   CBOR-envelope frames on fd 3/4
   (`rust/endo/src/proc.rs`, `rust/endo/xsnap/src/worker_io.rs`).

### Journal growth and truncation

The journal would grow without bound if the host kept every message
forever; snapshots are what let it forget.
The journal is **absolutely indexed**: entry numbers are stable across
truncation, so a snapshot's recorded `journalLength` always names the
same suffix.
At every sleep on a `canSnapshot` engine the host records
`(snapshotRef, journalLength)` durably and then truncates the journal
prefix the snapshot subsumes (`WorkerStore.truncateJournal`; the
filesystem store rewrites the journal with a base-index header via an
atomic rename).
The previous snapshot ref, now superseded, is handed back to the
engine (`releaseSnapshot`) so engines with external snapshot storage
(a CAS) can drop the corresponding GC root.
Ordering is crash-safe: the new snapshot is durable before the journal
shrinks and before the old snapshot is released, so a crash between
steps only costs disk space.
On the plain journal-replay engine (`canSnapshot: false`) the journal
is the persistence and cannot be dropped; that engine is for tests and
reference, not deployment.

### Resuming, not re-establishing, the host–worker session

Restoring a snapshot revives the worker's CapTP tables exactly as they
were, so the host cannot open a fresh session — slot numbering would
collide with the worker's memory of the old session.
The host therefore persists its half of each session and resumes it:

- **Slot counters** — the host's export and promise counters live in a
  plain-JSON *tables record* plugged into `makeCapTP` via the existing
  `makeCapTPImportExportTables` option
  (`packages/siesta/src/persistent-tables.js`).
  A restarted host never re-mints a slot the worker's snapshot still
  binds to another object.
- **Import descriptors** — `(slot, interface)` pairs for every object
  presence the host imported.
  On restart, `captp.provideImport(slot, iface)` (the new `@endo/captp`
  seam) re-mints each presence *through* `convertSlotToVal`, so identity
  is preserved even when a restored presence is later passed back to its
  worker.
- **The journal** — every message the host delivers to a worker is
  appended to that worker's journal *before* delivery (disk before
  graph).
- **Metadata** — the bootstrap facet's slot, and the engine snapshot ref
  with its journal offset.

Question and answer slots are deliberately *not* persisted.
Snapshots are only taken at quiescence (no questions in flight), and
after a host restart the fresh question counter's reuse of old question
IDs is benign: the worker's stale `answers` entries are simply
overwritten, and the restarted host — having forgotten those questions —
can never pipeline to them.
Promise imports are likewise transient; a promise that must survive
restarts should be modeled as an object capability.

### Sturdy refs over OCapN

OCapN's serving path for sturdy refs is
`bootstrap.fetch(swissnum) → locator.get(secret)`
(`packages/ocapn/src/client/sturdyrefs.js`).
The host feeds that locator directly:

- `worker.publish(presence, secret?)` verifies the value is an imported
  object presence, records `(secret → workerName, slot, iface)` durably,
  and sets `locator.set(secret, presence)`.
- On restart, the host re-mints each published presence from its
  recorded slot and rebinds the locator **without waking any worker**.
- A remote `fetch` then returns the presence; the first `op:deliver`
  routed to it crosses into the worker session and wakes the worker.

OCapN sessions themselves remain ephemeral (see
§ *Durable OCapN sessions*): a remote peer that reconnects re-enlivens
its sturdy refs, which is exactly the durability contract sturdy refs
exist to provide.

### Sleepy workers

Per-worker lifecycle, serialized on one turn queue so wakes never race
sleeps (`packages/siesta/src/host.js`):

- **Awake → asleep.** After `idleTimeoutMs` with no traffic and no
  questions in flight — or on explicit `worker.sleep()` — the host waits
  for quiescence, calls `incarnation.snapshot()` (when the engine can),
  records `(snapshotRef, journalLength)`, and terminates the
  incarnation.
- **Asleep → awake.** Any `rawSend` on the worker's session first runs
  `engine.start` with the recorded snapshot, replays the journal suffix
  inside the replay window, and only then journals and delivers the new
  message.
- The guest observes neither transition.

### Crash-consistency envelope

The prototype's guarantees, from weakest to strongest component:

- Worker state: recovered to the last journaled message (journal replay)
  or the last snapshot plus journaled suffix (XS engine).
- Host tables: written through synchronously on every counter or
  descriptor change, and always ahead of any message that depends on
  them.
- Worker replies in flight when the host dies are lost; because replies
  are re-derivable by replay and questions are transient, this only
  costs the answers to questions nobody remembers asking.

## The XS engine (landed, rescoped)

Rescoped per maintainer direction: **take the `xsnap` crate, skip the
`endor` daemon.**
The endor supervisor is the Rust re-hosting of the endo daemon —
manager bundles, formula SQLite, worker registries — all of which the
siesta host already is; routing siesta workers through it would mean
two overlapping supervisors, and its generated-bundle toolchain is
what was broken.
What siesta needs from the Rust side is only the crate: the XS build
system, the snapshot FFI (`suspend_to_cas`/`resume_from_cas`), and the
promise-job pump.

The landed shape:

- **`rust/siesta-xs-worker`** — a ~250-line binary on the `xsnap`
  crate: one XS machine, one host function (`siestaSend`, plus a
  `siestaTrace` diagnostic channel), newline-delimited ASCII JSON over
  fd 3/4 (`deliver`/`ack` with promise-quiescence per delivery,
  `snapshot` → CAS sha256, restore via `--restore <hash>`).
  Boot scripts and the worker bundle are read from files at runtime —
  no `include_str!` coupling, so the crate's generated-bundle problem
  is reduced to satisfying stubs.
- **`packages/siesta/scripts/bundle-xs-worker.mjs`** — generates
  `dist-xs/boot.js` (xsnap's committed polyfills) and
  `dist-xs/worker-xs.js` (the worker shell + CapTP bundled via
  compartment-mapper), and stubs xsnap's `include_str!` inputs.
- **`makeXsEngine`** (`packages/siesta/src/xs-engine.js`) — the
  `WorkerEngine` adapter: spawn, restore, deliver, snapshot,
  `releaseSnapshot` unlinks the superseded CAS entry.
- **Exit criterion met**: the siesta scenarios pass on real XS heap
  snapshots (`packages/siesta/test/xs-engine.test.js`), skipped
  automatically when the binary or bundles are absent.

Build: `yarn workspace @endo/siesta build:xs-bundles`, then
`cargo build --release -p siesta-xs-worker` (needs the `c/moddable`
submodule).

Findings that shaped the implementation, for future engine authors:

- `Machine::eval` segfaults on a script whose completion value is an
  object; the evaluator wrapper pins a primitive completion.
- XS's native `Compartment` takes an options bag, not the SES shim's
  endowments-first signature; the worker shell assigns endowments onto
  `compartment.globalThis`, which is portable to both.
- The ses shim's `repairIntrinsics` currently fails on XS, so the
  worker boots with xsnap's polyfills (freeze-based `harden`, `assert`,
  text codecs) and **no lockdown** — the same substrate endor's XS
  bundles run on. Guests are isolated per-machine and per-compartment,
  but share mutable intrinsics with the shell inside their own
  machine; ses-on-XS lockdown is a known gap.
- All JSON crossing the pipe and the host-function boundary is
  ASCII-escaped, making CESU-8/UTF-8/C-string encodings coincide.

## Future Work

### The worker controller: workers creating workers

Per maintainer direction, a worker can create and endow other workers:
the host exposes a **worker controller** into a controlling worker,
and endowments flow from that worker's own heap.

Two built-in resource types (registered alongside the embedder's
makers):

- `worker-controller` — `provideWorker(name)` makes or finds a worker
  and returns its facade.
- `worker-facade` — scoped to one worker:
  `evaluate(source, names, values)` evaluates in it with endowments.

```js
// In the controlling worker's guest code:
const child = await E(controller).provideWorker('child');
const childRoot = await E(child).evaluate(source, ['shared'], [shared]);
```

`shared` here is an object in the controlling worker's heap; the host
imports it from that session and re-exports it into the child's — the
host as pure translation layer, worker to worker.

Durability composes at the export-table layer: the host records which
worker session each presence was imported from, so a cross-worker
export is described as `{ kind: 'worker-import', workerName, slot }`
and re-seated at resume via `captp.provideImport` on the origin
worker's session — **without waking either worker**. Controller and
facade objects are themselves described resources. Export seating is
two-phase at host startup so cross-worker descriptions can name
runtimes constructed later (including cycles). The test
(`packages/siesta/test/worker-controller.test.js`) restarts the host
with both workers asleep and shows one pull on the child's sturdy
name waking the child, crossing to the parent, and waking it too.

### Host-provided system resources (Phase 4, landed)

Workers need timers, network, storage, and other host capabilities.
The shape, now implemented: the host exports capability objects into
the worker session, and — because host exports are *not* inside any
snapshot — each such export is re-instantiable from a durable
description.
That is a formula by another name, but — per maintainer direction —
it lives **at the export-table layer**: the serialized tables record's
export descriptors carry the durable description
(`TablesRecord.exports[slot].description`, recorded by the persistent
tables' `describeExport` power the moment a resource is exported),
and the tables kit's `restoreExports` rebuilds each described export
at resume, seated through `captp.provideExport`. One serialized
artifact — the session tables — carries everything needed to resume
the host's half. Never visible to guests.
`makeSiestaHost({ resources })` supplies the maker registry;
`host.makeResource(type, description)` mints instances; endowments
reach guests via `worker.evaluate(source, names, values)`.
A host that resumes a worker without the maker its exports need fails
loudly at construction rather than dangling the worker's presences.

Timers came first, as `makeTimerResource`: a pending `delay` gives the
host a reason to wake a sleeping worker with no inbound traffic (the
resolution message routes through the session's ordinary wake path),
and because every timer result is a journaled CapTP reply, replay
reproduces recorded time rather than consulting the clock — host
nondeterminism does not infect worker determinism.
Network and storage resources remain future work, as does the
attenuation story (per-worker scoping of descriptions).

### Durable OCapN sessions

Today a host restart severs live OCapN sessions; remote peers keep
durability only through sturdy refs.
[ocapn-noise-session-reconnect](ocapn-noise-session-reconnect.md) gets
partway there: it keeps one *CapTP session* alive across TCP transport
instances, but both sides keep their session tables in memory.
Sessions that survive a *process restart* additionally require:

- persisting the OCapN session's import/export/answer tables (the same
  treatment `@endo/siesta` gives its worker sessions, applied inside
  `packages/ocapn/src/client/ocapn.js`, whose tables are currently
  session-scoped and in-memory);
- stable node identity (persisted signing keys) and a session-resumption
  handshake that authenticates "same peer, new process";
- replay/idempotence discipline for deliveries in flight at the crash,
  per the reconnect design's § *Replay idempotence*.

This is a heavy revision of the OCapN client's session model and is
explicitly out of scope here; sturdy refs are the durability boundary
until it lands.

### Also deferred

- **GC.** `gcImports` is off on the host side and the worker holds its
  exports forever; a distributed-GC pass over sleeping workers needs the
  refcounting messages to be journaled and replayed consistently.
- **Snapshot compaction cadence**, metering
  ([daemon-xs-worker-metering](daemon-xs-worker-metering.md)), and
  multi-tenant scheduling.
- **Cross-version snapshots** (explicitly out of scope: no upgrade).

## Dependencies

| Design | Relationship |
|---|---|
| [daemon-xs-worker-snapshot](daemon-xs-worker-snapshot.md) | Provides the XS snapshot/suspend/resume substrate the production engine adapts. |
| [ocapn-noise-session-reconnect](ocapn-noise-session-reconnect.md) | The within-session reconnect layer that durable OCapN sessions (future work) would extend. |
| [ocapn-network-transport-separation](ocapn-network-transport-separation.md) | The netlayer seam through which the daemon takes its transport power. |
| [daemon-xs-worker-metering](daemon-xs-worker-metering.md) | Metering for XS incarnations, applicable unchanged. |

## Phased Implementation

1. **Phase 1 (landed): captp resume seam.** `provideImport` on
   `makeCapTP`, with identity-preservation tests. (`provideExport`,
   its mirror, landed with Phase 4.)
2. **Phase 2 (landed): host prototype.** `@endo/siesta`: persistent
   tables, journal, sleepy lifecycle, publications, OCapN daemon
   wrapper, journal-replay engine; end-to-end restart tests over the
   TCP-testing netlayer.
3. **Phase 3 (landed): XS engine.** The host's snapshot lifecycle
   (absolute journal indexing, truncation at every snapshot point,
   restore from ref plus suffix including crash recovery,
   superseded-ref release) proven first on
   `makeSnapshottingReplayEngine`, then the exit criterion met on real
   XS snapshots via `rust/siesta-xs-worker` + `makeXsEngine`
   (§ *The XS engine*). Remaining follow-up: ses lockdown on XS.
4. **Phase 4 (landed): system resources.** Durable host exports at the
   export-table layer per § *Host-provided system resources*: maker
   registry, export-time description recording in the tables record,
   resume-time re-instantiation via `provideExport`, evaluate
   endowments, the timer resource, and the worker controller with
   durable cross-worker links (§ *The worker controller*).
5. **Phase 5: production transport.** Noise netlayer with persisted
   signing keys, giving stable locations for sturdy refs.
6. **Phase 6: durable OCapN sessions.** Gated on the OCapN session-model
   revision; tracked as future work.

## Design Decisions

1. **Resume the worker session; never re-establish it.** A restored
   heap remembers the old session, so the host persists counters and
   import descriptors and re-mints presences with `provideImport`.
   The alternative — reset both halves and re-fetch by name — would
   forfeit true snapshot restoration and force a registry protocol on
   every guest.
2. **`provideImport` lands in `@endo/captp` rather than being simulated
   in siesta.** Re-minting outside `convertSlotToVal` would break value
   identity when a restored presence is passed back to its worker; the
   seam is five lines in the right place versus a standing correctness
   bug in the wrong one.
3. **Journal in the host, replay window in the host.** Engines stay
   dumb (`start/deliver/snapshot/terminate`); the same journaling and
   suffix-replay logic serves both the replay engine (full journal) and
   the XS engine (suffix since snapshot).
4. **Quiescence-only snapshots; questions and promises are transient.**
   Avoids persisting settler state and makes question-ID reuse after a
   host restart provably benign.
5. **Sleep is invisible to guests.** No `CTP_DISCONNECT` toward
   workers, ever; termination without notification is what makes the
   persistence orthogonal.
6. **No upgrade.** Snapshots pin code; a "new version" of a guest is a
   new worker.
   This is the simplification that separates siesta from the daemon.

## Known Gaps and TODOs

- [x] ~~XS engine adapter.~~ Landed as `rust/siesta-xs-worker` +
      `makeXsEngine` after the rescope onto the `xsnap` crate.
- [ ] No SES lockdown inside XS workers: the ses shim's
      `repairIntrinsics` fails on XS, so guests share mutable
      intrinsics with the shell inside their own machine (isolation is
      per-machine and per-compartment). Repairing ses-on-XS (or using
      XS's native lockdown once enabled) is the follow-up.
- [x] ~~Host exports to workers are not durable.~~ Landed as Phase 4:
      export descriptions live in the serialized tables record and are
      re-instantiated at resume via `captp.provideExport`; cross-worker
      links are described as `worker-import` and re-seated without
      waking either worker.
- [x] ~~Journal growth is unbounded.~~ Landed with the Phase 3 host
      side: snapshots subsume and truncate the journal prefix on every
      sleep (§ *Journal growth and truncation*). Still true on the
      plain journal-replay engine, whose journal *is* the persistence.
- [ ] A worker-to-host call in flight across a host restart is lost:
      the host's `answers` bookkeeping is in-memory, so a guest
      awaiting (say) a pending `timer.delay` across a host crash hangs.
      Durable resource requests need journaling of worker-to-host
      messages and re-execution against re-instantiated resources — a
      deliberate follow-up, not an oversight.
- [ ] The TCP-testing netlayer mints per-boot locations, so restart
      tests re-derive the location; stable locations arrive with the
      Noise netlayer and persisted keys (Phase 5).
- [ ] No metering or scheduling; a hostile guest can spin forever.

## Prompt

> build on ocapn and xs/xsnap to prototype an distributed ocap machine
> with pure orthogonal persistence (no upgrade). a host daemon connects
> via ocapn and can be instructed to spin up orthogonal persistence
> workers. workers communicate via endo-captp to the host and their
> exported objects can be exposed as sturdy refs over ocapn via the
> host. the idea is to make a simpler version of endo daemon with
> orthogonal persistence guests. the host-side will need to serialize
> it's import export tables for each worker so they and host can survive
> restarts. exposing system resources to the workers via the host is
> left as future work but covered in the design doc. the host will
> mostly provide a translational layer between workers and remotes.
> workers should be made to be "sleepy" and be snapshotted and closed
> when idle. eventually we will want durable ocapn sessions that can be
> resumed after restart, but this may require heavy ocapn rewrite
