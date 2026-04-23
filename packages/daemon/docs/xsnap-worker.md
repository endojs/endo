# xsnap-worker: orthogonal persistence for Endo workers

The `xsnap-worker` formula type is an Endo worker whose underlying JS
heap is persisted by xsnap's orthogonal snapshot mechanism. When the
daemon cancels the worker the entire heap is streamed to disk; when it
is revived the heap comes back intact and every value still reachable
from `globalThis` resumes as if nothing had happened.

This is **not** a durable zone. Orthogonal persistence captures the
heap; there is no per-object opt-in, no upgrade-survivable virtual
collections, and no storage layer separate from the snapshot.

## Communication: tagged-array RPC, not CapTP

The wire protocol follows
`@agoric/swingset-xsnap-supervisor`'s `managerPort` idiom (the pattern
agoric-sdk uses to drive vats in xsnap):

- Every message is a tagged JSON array `[tag, ...args]` encoded as
  UTF-8.
- Host → worker: `vat.issueCommand(encode([tag, ...]))`.
- Worker → host: xsnap's async-reply convention. The worker's
  `globalThis.handleCommand` returns an empty report object and writes
  the encoded reply into `report.result` when the async work settles.
  xsnap drains the microtask queue until `.result` is an ArrayBuffer,
  then sends it as the OK reply on fd 4.
- Replies are themselves tagged: `['ok', value]` or
  `['error', message]`.

We do **not** tunnel CapTP through this channel. CapTP's state is
ephemeral on both sides of a connection — slot numbers mean nothing
after reconnect — and a plan that relied on the worker's captp export
table surviving via the snapshot while the daemon's import table was
rebuilt from scratch would leave the daemon with no way to re-identify
specific exports. The fix is to not use captp at all, and instead give
every long-lived export a stable, content-addressed name the daemon can
store durably.

## vref naming

Values that cannot travel by JSON (closures, hardened exos, anything
with identity) are registered in a worker-local `Map<vref, value>` and
referenced by the vref string from the daemon side:

```
const vref = await worker.evaluateAndExport(`
  (() => {
    let n = 0;
    return harden(step => (n += step));
  })()
`);
// vref is "o+1" or similar

await worker.invoke(vref, [1]);  // 1
await worker.invoke(vref, [5]);  // 6

// ... daemon restarts, worker revived from snapshot ...

await worker.invoke(vref, [10]); // 16 — same closure, same captured `n`
```

The `exports` map and the closures themselves live in the xsnap heap,
so the snapshot preserves them together. The daemon stores `vref` as a
durable formula attribute; nothing daemon-side needs to survive as
captp state.

This is the direct analogue of swingset's vref scheme, minus the kernel
c-list: the daemon plays the kernel's role of "source of truth for
names" without needing the kernel-side object-identity translation
tables, because there is only one vat and one view.

## Presenting a regular worker interface

The existing Endo daemon drives Node-hosted workers through a
`WorkerDaemonFacet` that is itself a CapTP remote (so
`evaluate`/`makeBundle`/`makeUnconfined` look like method calls on a
far object). Nothing on the wire to xsnap needs to change to keep that
surface; the bridge is purely daemon-side:

```
EndoHost → CapTP over unix socket → daemon (Node)
                                      │
                                      ├──> Node worker via CapTP over fd 3/4
                                      │    (makeNetstringCapTP)
                                      │
                                      └──> xsnap worker via tagged-array
                                           RPC over issueCommand
                                           (translated inside the daemon)
```

The daemon wraps `XsnapWorkerDaemonFacet` with a `makeExo` that
implements the same `WorkerDaemonFacet` interface as the Node worker.
Method calls on the exo translate into `['eval', source]` and
`['evalAndExport', source]` RPC calls to xsnap. Values that the caller
would normally receive as CapTP remote references (e.g., the result of
`evaluate(...)`) are presented as vref-backed exos that delegate back
into `['invoke', vref, args]`.

From the host's point of view these look identical to CapTP remotes —
the captp perimeter is entirely between the host and the daemon, never
between the daemon and the worker.

## Durable heap state for formulas

Once the bridge above is in place, the daemon can make formulas whose
result lives in the xsnap worker's heap:

```
formula eval#N: {
  type: 'eval',
  worker: W (xsnap-worker),
  source: S,
  vref: "o+3",   // allocated on first provision
}
```

On first provision the daemon calls `evalAndExport(S)` and stores the
returned vref on the formula. Subsequent provisions (including after a
daemon restart) look up `vref` on the revived worker — no re-evaluation
of `S`, no loss of closure state.

The existing `thisDiesIfThatDies` plumbing already expresses the
dependency from the eval formula to the worker formula, so deleting
the worker invalidates every eval that lives in its heap.

### Non-goals

- **Not a durable zone.** There is no per-object opt-in, no
  upgrade-survivable virtual collections, no storage layer separate
  from the snapshot. A breaking change to the xsnap binary format or
  the worker bootstrap would require rebuilding the heap from source,
  which with no durable-zone machinery means losing every value.
- **Not cross-process identity.** vrefs are scoped to a single worker
  id. Two xsnap-workers with different ids have disjoint namespaces.
- **Not a captp survivor.** Mid-call promises from before a daemon
  restart do not resume — they reject with a transport error, matching
  the existing Node-worker behavior.

## What's in the tree today

- `Formula` gains a `{ type: 'xsnap-worker' }` variant, routed to
  `makeIdentifiedXsnapWorker` in `daemon.js`.
- `DaemonicControlPowers.makeXsnapWorker` returns an
  `XsnapWorkerDaemonFacet` with `evaluate`, `evaluateAndExport`,
  `invoke`, and `release`, backed by tagged-array RPC.
- First boot of a worker: evaluate `@agoric/xsnap-lockdown` to install
  SES, then evaluate `xsnap-worker-bootstrap.js` to install the RPC
  handler. Both are captured by the first snapshot.
- Graceful cancel triggers `vat.makeSnapshotStream()` → `heap.xss.tmp`
  → atomic rename to `heap.xss`.
- Tests in `test/xsnap-worker.test.js` cover:
  1. counter/closure values on `globalThis` survive snapshot/revival;
     SES (`harden`, `Compartment`, frozen primordials) survives too.
  2. vref-addressed closures resume across daemon restart and respect
     `release`.
  3. distinct worker ids get disjoint heaps.

The CapTP-facade bridge (presenting `WorkerDaemonFacet` so the rest of
the daemon can treat xsnap workers interchangeably) is not yet wired
up; the `XsnapWorkerDaemonFacet` is exposed directly for now.
