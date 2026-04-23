# xsnap-worker: orthogonal persistence for Endo workers

The `xsnap-worker` formula type is an Endo worker whose underlying JS
heap is persisted by xsnap's orthogonal snapshot mechanism. When the
daemon cancels the worker, the entire heap is streamed to disk; when it
is revived, the heap comes back intact and every value still reachable
from `globalThis` resumes as if nothing had happened.

This document covers three things:
1. What the current implementation actually does (and does not) support.
2. The design for making xsnap-worker a drop-in replacement for the
   regular `worker` formula — same CapTP surface, same `WorkerDaemonFacet`
   — so the rest of the daemon code can treat them interchangeably.
3. What that would unlock: durable heap state for eval/bundle/unconfined
   formulas.

Nothing here introduces a durable-zone abstraction. Orthogonal
persistence captures the whole heap; there is no per-object opt-in, no
upgrade-survivable virtual collections, no storage layer separate from
the snapshot.

## What's in the tree today

### Lifecycle

- `Formula` gains a `{ type: 'xsnap-worker' }` variant, routed to
  `makeIdentifiedXsnapWorker` in `daemon.js`.
- `DaemonicControlPowers.makeXsnapWorker(workerId, _, cancelled)`:
  - Spawns `@agoric/xsnap` with the xsnap-native binary resolved by the
    package.
  - On first boot, evaluates the `@agoric/xsnap-lockdown` bundle to
    install SES in the Start Compartment, then evaluates
    `xsnap-worker-bootstrap.js` to install the eval-handler on
    `globalThis`.
  - Wires a `handleCommand` callback that resolves pending daemon-side
    replies as the worker sends them via its own `issueCommand`.
- On graceful cancel the daemon asks xsnap for a snapshot stream,
  writes it to `heap.xss.tmp`, and atomically renames to `heap.xss`
  under the worker's state directory.
- On revival, `heap.xss` is passed back to xsnap via `snapshotStream`.
  Neither the lockdown bundle nor the bootstrap is re-evaluated — the
  SES perimeter and the eval handler live in the snapshotted heap.

### Wire protocol (today)

The current protocol is deliberately minimal — enough to prove
orthogonal persistence end to end without needing to bundle SES and
CapTP into xsnap-compatible source.

- Daemon → worker: one `vat.issueCommand(bytes)` per request, JSON
  `{ type: 'eval', source }`. Delivered to the worker's global
  `handleCommand(bytes)`.
- Worker → daemon: the worker's `handleCommand` evaluates `source` in
  the global scope, serializes `{ ok }` or `{ error }`, and calls the
  host-provided `issueCommand` global to deliver it. xsnap routes that
  back to the host's registered `handleCommand` callback, which resolves
  the pending reply slot.

`DaemonicControlPowers.makeXsnapWorker` returns an
`XsnapWorkerDaemonFacet` with `terminate()` and `evaluate(source)` — a
different shape from `WorkerDaemonFacet`. The rest of the daemon
(`makeEval`, `makeBundle`, `makeUnconfined`, etc.) only understands
`WorkerDaemonFacet`, so `xsnap-worker` cannot yet host eval, bundle, or
unconfined formulas. That's the gap the next section closes.

## Making xsnap-worker speak CapTP

The goal is for `makeXsnapWorker` to return the same `WorkerDaemonFacet`
interface the Node worker does:

```ts
interface WorkerDaemonFacet {
  terminate(): Promise<void>;
  evaluate(source, names, values, id, cancelled): Promise<unknown>;
  makeBundle(bundle, powers, context): Promise<unknown>;
  makeUnconfined(path, powers, context): Promise<unknown>;
}
```

Those calls are CapTP method invocations on a remote exo. To support
them we need CapTP running inside xsnap and a transport between the
daemon-side captp and the xsnap-side captp.

### Why xsnap's command protocol isn't a duplex byte pipe

The Node worker sits on top of two raw byte pipes (fds 3/4) and rides
`makeNetstringCapTP` on them. Either side can push bytes whenever it
wants.

xsnap's protocol is request/response in both directions:

- Host initiates: `vat.issueCommand(bytes)` sends one message to the
  worker. The worker's `handleCommand` runs synchronously; its return
  value becomes the reply. Promise rejections from `handleCommand` are
  signalled via the xsnap `.`/`!` protocol byte.
- Worker initiates: the in-xsnap `issueCommand(bytes)` sends one
  message to the host. The host's `handleCommand` runs asynchronously;
  its return value becomes the worker's reply.

Both are half-duplex from the perspective of each call. CapTP needs
full duplex.

### The mapping: frame batches on both replies

Each side maintains an outbound frame queue. Every `issueCommand` in
either direction carries any pending frames, and the reply drains the
receiving side's queue:

```
daemon.issueCommand({ frames: daemonOut.drain() })
  → worker.handleCommand receives frames, dispatches to captp
  → captp produces reply frames synchronously on workerOut queue
  → worker.handleCommand returns { frames: workerOut.drain() }
  → daemon dispatches those frames into its captp
```

For frames that only become available after microtasks settle (most
CapTP replies), the same mechanism works in the opposite direction:
the worker calls its in-xsnap `issueCommand({ frames: workerOut.drain() })`,
the host's `handleCommand` dispatches, and returns
`{ frames: daemonOut.drain() }` synchronously.

### Pumping: avoiding deadlock with a heartbeat

Because xsnap's `handleCommand` returns synchronously, the worker can
only deliver frames produced in later turns by calling `issueCommand`
out of band. The daemon needs to give the worker a chance to do that
when there's nothing for the daemon to send. A periodic "pump"
command — `{ frames: [] }` with a short timeout — is enough:

- When the worker has nothing to send, it returns `{ frames: [] }` and
  the daemon waits again.
- When the worker has frames produced in a later microtask, it
  initiates its own `issueCommand({ frames })` whose reply can also be
  empty.

The daemon-side of this reduces to a small "bridge" module the
makeXsnapWorker can reuse:

```js
// transport seam (sketch; not yet wired)
const makeXsnapCaptpTransport = (vat, bootstrap) => {
  const outbound = [];

  const handleCommand = async bytesIn => {
    const { frames: incoming } = JSON.parse(...);
    for (const f of incoming) inbound.push(f);
    // Give the captp dispatch time to run. Microtasks only.
    await settle();
    return encode({ frames: outbound.splice(0) });
  };

  const pump = async () => {
    while (!cancelled) {
      await vat.issueCommand(encode({ frames: outbound.splice(0) }));
      await heartbeatDelay;
    }
  };

  const writer = {
    next: msg => (outbound.push(msg), ack()),
    ...
  };
  const reader = asyncIterableOf(inbound);
  const { getBootstrap, closed } = makeMessageCapTP(
    name, writer, reader, cancelled, bootstrap,
  );
  pump();
  return { getBootstrap, closed };
};
```

The symmetric piece lives inside xsnap as a bundled module.

### Bundling worker.js for xsnap

xsnap has no Node module loader. To reuse `src/worker.js` (with its
`makeWorkerFacet` exo) inside xsnap, we bundle it:

1. Run `@endo/bundle-source` on `worker.js` with
   `{ format: 'nestedEvaluate' }` — the same format `xsnap-lockdown`
   uses, which xsnap's Start Compartment can evaluate directly after
   lockdown.
2. Snapshot the bundle text alongside the daemon, or bundle it at
   prepack time.
3. On first boot: `vat.evaluate(lockdownBundle)`, then
   `vat.evaluate(workerBundle)` which exposes the worker exo and wires
   its reader/writer into the transport seam above.

After the first snapshot, neither bundle is re-evaluated. Everything
— SES state, the worker exo, the captp tables, the outbound queue
closures — lives in the heap.

## Durable heap state for formulas

Once an `xsnap-worker` can host CapTP, formulas that presently
reference the worker by id and re-execute their source on each daemon
start can instead reference the worker AND a specific CapTP slot in
its heap.

Concretely, for an eval formula:

Today (Node worker):

```
formula eval#N: { worker: W, source: S, names, values }
→ on provision, re-run S in W and return the value.
→ on daemon restart, W is recreated fresh; S is re-run from scratch.
→ closure state from any prior run is gone.
```

With a durable xsnap-worker:

```
formula eval#N: { worker: W (xsnap-worker), source: S, names, values, slot: ? }
→ first provision: run S in W, capture the CapTP export slot of the
  result, store `slot` on the formula.
→ on daemon restart: revive W from heap.xss (all closure state alive),
  reconnect captp, and fetch export slot `slot`. No re-evaluation.
```

The slot is stable across restarts because xsnap assigns its internal
export-slot ids deterministically within a heap, and those ids live in
the captp export table — which is in the heap.

Caveats:

- The captp session is reset on restart, so pending promises from
  before the restart cannot be resumed — they resolve back to a
  broken-promise error on the daemon side. That matches the existing
  behavior for Node workers: in-flight work across a daemon crash is
  lost.
- Values must be reachable from captp exports to survive. Anything
  held only by the daemon's in-memory references (not exported over
  captp) can be collected before the next snapshot.
- A durable eval formula depends on its durable worker. Deleting the
  worker invalidates the formula; the existing `thisDiesIfThatDies`
  plumbing already expresses this.

## Not a durable zone

An agoric-style durable zone would add:

- Per-object opt-in (`makeScalarBigMapStore('durable', …)`) with
  explicit identities that survive vat upgrades.
- A storage layer separate from the xsnap snapshot — virtual refs,
  BigMap backed by swingstore, kind handles.
- Upgradable vats: rebuild the live object graph from durable kind
  metadata when the code changes.

None of that is in scope. Orthogonal persistence is good enough to
preserve formula results across daemon restarts, but it cannot survive
a code upgrade to the xsnap binary format or a breaking change to the
bundled worker code — in both cases the snapshot would no longer
deserialize and the worker would have to be rebuilt from source.
