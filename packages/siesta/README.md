# `@endo/siesta`

A prototype distributed ocap machine with purely orthogonal persistence.

A siesta daemon is a simpler cousin of the Endo daemon: it spins up
workers whose guest state is preserved by XS heap snapshots rather
than by explicit formula-based persistence.
Guests never observe their own suspension, restoration, or the
daemon's restarts — persistence is orthogonal to the guest programming
model, and there is no upgrade story on purpose.

The machine speaks the OCapN p2p wire protocol end to end: one OCapN
client serves remote peers over the injected netlayer AND every worker
over an in-process pipe transport, so the daemon is a relay with one
protocol, one marshal format, and one durability regime.
Worker exports published under a swissnum become OCapN sturdy refs
served from the daemon's locator.

Workers are sleepy.
When a worker is quiescent, the daemon can snapshot and terminate it;
a later message to any of its presences transparently wakes it.
Sleep is embedder policy, never guest-visible: the worker object's
`sleep()`/`wake()`/`isAwake()` are explicit hooks for embedders and
tests — a guest cannot observe (or trigger) any of them.

Workers have no names.
Each is identified by a host-generated unguessable id, so reaching a
worker requires a capability — a publication, a durable cross-worker
link, or a facade — never a well-known string.
`createWorker({ debugLabel })` accepts an optional label that appears
only in logs and error messages; `daemon.getWorker(workerId)` is the
embedder's admin route to an existing worker.

## Example

```js
import { E } from '@endo/eventual-send';
import { makeTcpNetLayer } from '@endo/ocapn/netlayer/tcp-testing';
import { syrupCodec } from '@endo/ocapn/syrup';
import { makeFsStore, makeSiestaDaemon, makeXsEngine } from '@endo/siesta';

const daemon = await makeSiestaDaemon({
  store: makeFsStore(statePath),
  engine: makeXsEngine({ workerBinary, bootPath, bundlePath, casPath }),
  codec: syrupCodec,
  makeNetlayer: ({ handlers, logger }) => makeTcpNetLayer({ handlers, logger }),
});

const worker = await daemon.createWorker({ debugLabel: 'counter' });
const counter = await worker.evaluate(`
  (() => {
    let count = 0;
    return Far('Counter', { incr: () => (count += 1) });
  })()
`);
const secret = daemon.publish(counter);
// Any OCapN peer can now mint a sturdy ref from (daemon.location, secret)
// and call the counter — across worker sleeps and daemon restarts.
```

## Worker sessions

Each worker runs a full (reduced-profile) OCapN peer —
`src/worker-peer.js`, a persistent `Compartment` behind an OCapN
client whose evaluate facet is fetched from the worker's own locator
under the well-known swissnum `shell`.
The daemon's side of the session is a durable worker transport
(`src/durable-worker-transport.js`): the session is established
through the `resumeSession` seam in `@endo/ocapn` with both identities
and the session id derived deterministically from the worker id
(`src/pipe-network.js`), so there is no wire handshake and the *same*
establishment call serves a fresh worker, a wake from snapshot, and a
daemon restart.

Durability is snapshot-keyed frame retention:

- daemon→worker frames are journaled before they reach the duct, and
  retained until a snapshot commits (not until acknowledged);
- wake = restore the snapshot and replay the journal suffix; the
  worker deterministically regenerates the outbound frames that
  suffix produced, and the daemon absorbs them with a persisted
  watermark (written before each frame is processed — at-most-once
  after a crash, never twice);
- sleep = drain, snapshot, record `{ ref, cut }`, truncate the
  subsumed journal prefix, terminate. The OCapN session — and every
  live remote reference through it — stays live; the next inbound
  frame wakes the worker.

A crash without sleep restarts from the last snapshot plus the full
journal suffix; clean shutdown is an optimization, not a correctness
requirement.

## How daemon restarts work

The worker half of each session lives inside the guest heap, so the
engine snapshot preserves it.
The session identity derives from the worker id, so nothing about it
is persisted.
What the daemon records (`src/worker-session-records.js`) is its own
export table per worker session — the capabilities it has passed
*into* each worker — and its publications, both as durable
descriptions:

- a host resource: `{ kind: 'resource', name, description }`,
  re-instantiated by the registered factory;
- an import from another worker session (a cross-worker link the
  daemon relays): `{ kind: 'link', workerId, slot }`, re-materialized
  through the linked session's `provideImport` without waking anyone;
- listen forwarders: `{ kind: 'listen-forwarder', holder, slot }`.
  The daemon is **non-reifying about promises**: it never subscribes
  to a promise itself. When a peer listens on a relayed promise, the
  daemon forwards the subscription to the owning session with a
  forwarder resolver — an ordinary export that delivers the eventual
  resolution straight to the subscriber's resolver. Subscription
  state therefore lives only in the (orthogonally persistent)
  endpoints, and a restart re-seats forwarders like any other export
  (deferred, when the subscriber is a remote session that has not yet
  resumed);
- residual protocol-internal resolvers: `{ kind: 'internal' }`,
  re-seated as position-preserving tombstones.

A restarted daemon re-establishes every worker session from the store,
re-seats records and publications, partitions each session's
answer-position space by a persisted epoch (so fresh question counters
never collide with answer registrations still held in worker heaps),
and leaves every worker asleep until a message arrives.

Settlement routing is the comms-vat property and it falls out of
unification: within a lifetime a settlement frame flows
owner → forwarder → subscriber and wakes a sleeping holder through
its transport; across a restart, the restored forwarder in the
owner's session record carries the same route with no daemon-side
subscription to rebuild. A promise minted in worker A and held in
worker B settles after a daemon restart with both workers starting
asleep.

## Engines

`makeXsEngine` is the engine: each incarnation is a `siesta-xs-worker`
process (rust/siesta-xs-worker, a minimal runner on the `xsnap` crate)
evaluating the worker peer bundle inside an XS machine, with real heap
snapshots streamed into a content-addressed store.
Binary OCapN frames ride the binary's ASCII NDJSON duct base64-encoded
(`src/worker-peer-xs.js` is the bundle entry; `dist-xs/worker-peer.js`
the artifact).
Build it with:

```sh
git submodule update --init c/moddable
yarn workspace @endo/siesta build:xs-bundles
cargo build --release -p siesta-xs-worker
```

The XS tests (`test/worker-peer-xs.test.js`,
`test/durable-worker-session-xs.test.js`, and
`test/worker-session-restart-xs.test.js` — snapshot restore under a
live session, sleepy workers with crash recovery, and a full daemon
restart with cross-worker links and settlements) skip themselves when
those artifacts are absent — build them so the engine you actually
ship is the engine you test.
XS workers boot under XS's native Hardened JavaScript: the runner
installs the engine's own `harden` and `lockdown` globals and the
boot script calls `lockdown()`, so guests evaluate against frozen
shared intrinsics inside a native `Compartment`.

The engine seam stays open for future JS engines with other heap
snapshot mechanisms: any object satisfying the `WorkerEngine` type in
`src/worker-engine.js` (`canSnapshot`, `start`, optional
`releaseSnapshot`) plugs in.
Two internal replay engines (`src/peer-replay-engine.js`) implement
the same contract deterministically without an XS build; they are test
doubles for the daemon's persistence logic, deliberately not part of
the public API.

## Workers creating workers

Grant a worker the built-in `worker-controller` resource and its guest
can create and endow other workers, with capabilities passed from its
own heap and the daemon as the relay:

```js
const controller = daemon.makeResource('worker-controller');
await parent.evaluate(
  `
  Far('Parent', {
    setup: async () => {
      const child = await E(controller).createWorker('child');
      const shared = Far('Shared', { secret: () => 'from-parent' });
      return E(child).evaluate(childSource, ['shared'], [shared]);
    },
  })
  `,
  ['controller'],
  [controller],
);
```

Cross-worker links are durable at the session-record layer: the
child's session records the parent-origin endowment as a link to the
parent session's slot, re-seated on daemon restart without waking
either worker.

## Durable sessions with remote peers

OCapN has no session-resumption message, so siesta prototypes it
beneath the protocol, at the netlayer: `makeDurableNetLayer` wraps a
transport netlayer (e.g. TCP) with resumable logical connections.
Each logical connection carries an unguessable resume token; every
OCapN frame rides in a sequence-numbered envelope; both sides retain
unacknowledged frames; and when the socket dies, the originator
reconnects with a `resume` preamble and each side replays what the
other has not seen.
The OCapN layer above is never told the socket dropped, so the
session — and every live remote reference in it — survives
transparently:

```js
const daemon = await makeSiestaDaemon({
  // ...
  makeNetlayer: ({ handlers, logger, resumption }) =>
    makeDurableNetLayer({
      handlers,
      logger,
      resumption,
      makeBaseNetlayer: powers => makeTcpNetLayer(powers),
    }),
});
```

Wrap both peers.

On the daemon side the sessions are also durable across **daemon
restarts**: the daemon persists, per resume token, each session's
identity (session id, peer key, location, and the session's own
private key — so pre-restart handoff signatures keep verifying), its
frame watermarks, its unacknowledged outbound frames, and the same
durable export descriptions the worker sessions use.
A successor process pins the same port; the peer's netlayer reconnects
and resumes; the daemon rebuilds the OCapN session (same session id,
same keys, no handshake) and re-seats every export at its recorded
position without waking any worker.
Live remote references then keep working as if nothing happened —
including calls issued while the daemon was down, which buffer in the
peer's netlayer and complete against the successor.

Known limits of the prototype: retransmit buffers are unbounded until
acked; parked sessions are kept indefinitely (no session GC); and
daemon-side imports re-mint lazily (identity across the restart is
per-session only).

## Retirement and vat GC

Retirement is a capability, not a host operation: `retire()` on the
embedder's worker object (and on the guest-visible `worker-facade`
resource) permanently deletes the worker — its session aborts so live
presences reject, publications rooted in it drop, its store is
deleted, and its snapshot is released.

Unreferenced workers die by collection instead:
`daemon.collectVats({ keep })` marks workers reachable from
publications (plus awake workers and the `keep` list of ids) along
durable cross-worker links and worker facades, retires the rest, and
returns the swept ids.
`daemon.unpublish(secret)` removes a locator root so a published vat
can become garbage.

## System resources

Host capabilities reach guests as durable exports.
Register makers on the daemon and pass instances as evaluate
endowments:

```js
import { makeTimerResource } from '@endo/siesta';

const daemon = await makeSiestaDaemon({
  // ...
  resources: { timer: makeTimerResource },
});
const worker = await daemon.createWorker({ debugLabel: 'clock' });
const timer = daemon.makeResource('timer');
const clock = await worker.evaluate(
  `Far('Clock', { read: () => E(timer).now() })`,
  ['timer'],
  [timer],
);
```

When a resource is exported into a worker session, its
`(name, description)` is recorded against the export slot; on daemon
restart the export is re-instantiated at the same slot, so presences
inside the worker's snapshot keep working.
Resource results reach the worker as OCapN frames, which the daemon
journals before delivery, so nondeterministic resources (clocks) do
not break deterministic replay, and a pending `timer.delay` wakes a
sleeping worker with no inbound traffic.

Answers the daemon itself owes (host-resource computations) are
at-most-once: a resolver obligation pending across a restart rejects
(`pending answer aborted`) rather than hanging or re-executing.
Relayed promises are not daemon obligations at all — their
subscriptions live as durable forwarders and settle normally across
restarts.

## API

`makeSiestaDaemon({ store, engine, codec, makeNetlayer, resources?, verbose? })`
resolves to a daemon:

- `createWorker({ debugLabel? })` — makes a fresh worker under a
  generated unguessable id and resolves to its worker object.
- `getWorker(workerId)` — the worker object of an existing worker;
  throws for unknown ids (the embedder's admin route).
- `listWorkerIds()` — sorted ids of the live workers (admin/debug).
- `makeResource(name, description?)` — instantiates a registered
  resource maker; interned by `(name, description)`.
- `publish(value, secret?)` — durably registers a capability under a
  swissnum and returns the swissnum.
- `unpublish(secret)` — removes a publication from the locator and the
  store.
- `collectVats({ keep? })` — vat-level mark-and-sweep; resolves to the
  swept ids.
- `locator` — the swissnum-to-presence Map served over OCapN.
- `location` and `makeSturdyRefDetails(secret)` — what a peer needs to
  mint a sturdy ref.
- `shutdown()` — snapshots and parks every worker, then closes the
  client.
- `crash()` — abandons live state the way a power failure would (for
  tests and supervisors; the store is left recoverable).

Each worker object has:

- `workerId` and `debugLabel` (data properties).
- `evaluate(source, names?, values?)` — evaluates a hardened
  JavaScript expression in the worker's persistent compartment, with
  endowments bound as named values.
- `sleep()`, `wake()`, `isAwake()` — embedder policy hooks; see above.
- `retire()` — permanently deletes the worker; see _Retirement and
  vat GC_.

## Caveats

This is a prototype.
See the design document for the full list of open issues, notably:
answers owed by a crashed process are at-most-once (they reject after
a restart; durable promise links do survive), automatic idle-sleep
policy is not yet reinstated on the unified daemon (sleep is explicit
or supervisor-driven), and worker heaps retain answer registrations
from previous daemon epochs until object-level GC lands.

## Design

See
[designs/ocapn-orthogonal-persistence.md](../../designs/ocapn-orthogonal-persistence.md).
