# `@endo/siesta`

A prototype distributed ocap machine with purely orthogonal persistence.

A siesta host is a simpler cousin of the Endo daemon: it spins up workers
whose guest state is preserved by heap snapshots (or, in the reference
engine, by deterministic journal replay) rather than by explicit
formula-based persistence.
Guests never observe their own suspension, restoration, or the host's
restarts — persistence is orthogonal to the guest programming model, and
there is no upgrade story on purpose.

The host speaks `@endo/captp` to each worker and OCapN to the outside
world, acting as a translation layer: worker exports published under a
swissnum become OCapN sturdy refs served from the host's locator.

Workers are sleepy.
When a worker's CapTP session is quiescent and idle, the host snapshots
and terminates it; a later message to any of its presences transparently
wakes it.

Workers have no names.
Each is identified by a host-generated unguessable id, so reaching a
worker requires a capability — a publication, a durable cross-worker
link, or a facade — never a well-known string.
`createWorker({ debugLabel })` accepts an optional label that appears
only in logs and error messages; `host.getWorker(workerId)` is the
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

const worker = await daemon.host.createWorker({ debugLabel: 'counter' });
const counter = await worker.evaluate(`
  (() => {
    let count = 0;
    return Far('Counter', { incr: () => (count += 1) });
  })()
`);
const secret = await worker.publish(counter);
// Any OCapN peer can now mint a sturdy ref from (daemon.location, secret)
// and call the counter — across worker sleeps and daemon restarts.
```

## How restarts work

The worker half of each host–worker CapTP session lives inside the guest
heap, so the engine snapshot preserves it.
The host half is persisted per worker:

- a **tables record** — the CapTP export/promise slot counters and
  slot-to-interface descriptors, written through on every change
  (`makePersistentTablesKit` plugs into `makeCapTP`'s
  `makeCapTPImportExportTables` option);
- a **journal** of every message the host delivered to the worker;
- **metadata** — the bootstrap facet's slot and the engine snapshot ref.

On restart the host resumes each session rather than re-establishing it:
it re-mints presences for recorded import slots with
`captp.provideImport`, rebinds publications into the OCapN locator, and
leaves every worker asleep until a message arrives.

## Engines

`makeXsEngine` is the engine: each incarnation is a `siesta-xs-worker`
process (rust/siesta-xs-worker, a minimal runner on the `xsnap` crate)
hosting the worker shell inside an XS machine, with real heap
snapshots streamed into a content-addressed store.
At every sleep the host records the snapshot ref durably, truncates
the journal prefix the snapshot subsumes, and releases the superseded
ref to the engine.
Journals are absolutely indexed, so truncation never moves an offset;
wakes restore from the snapshot ref plus the journal suffix, which also
recovers cleanly from host crashes between snapshots.
Build it with:

```sh
git submodule update --init c/moddable
yarn workspace @endo/siesta build:xs-bundles
cargo build --release -p siesta-xs-worker
```

The XS tests (`test/xs-engine.test.js`) skip themselves when those
artifacts are absent.
XS workers boot under XS's native Hardened JavaScript: the runner
installs the engine's own `harden` and `lockdown` globals and the
boot script calls `lockdown()`, so guests evaluate against frozen
shared intrinsics inside a native `Compartment`.

The engine seam stays open for future JS engines with other heap
snapshot mechanisms: any object satisfying the `WorkerEngine` type in
`src/host.js` (`canSnapshot`, `start`, optional `releaseSnapshot`)
plugs in.
Two internal replay engines (`src/journal-replay-engine.js`) implement
the same contract deterministically without an XS build; they are test
doubles for the host's persistence logic, deliberately not part of the
public API.

## Workers creating workers

Grant a worker the built-in `worker-controller` resource and its guest
can create and endow other workers, with capabilities passed from its
own heap and the host as the translation layer:

```js
const controller = host.makeResource('worker-controller');
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

Cross-worker links are durable at the export-table layer: the child's
session records the parent-origin endowment as "import slot S of the
parent worker's session" (by worker id), re-seated on host restart
without waking either worker.

## Retirement and vat GC

Retirement is a capability, not a host operation: `retire()` on the
embedder's worker object (and on the guest-visible `worker-facade`
resource) permanently deletes the worker — live presences reject,
durable links from other workers tombstone (their deliveries reject
even after restarts), publications drop, and the snapshot is released
unless an identical sibling heap still shares it.

Unreferenced workers die by collection instead:
`host.collectVats({ keep })` marks workers reachable from publications
(plus awake workers and the `keep` list of ids) along durable
cross-worker links and retires the rest, returning the swept ids.
`host.unpublish(secret)` removes a locator root so a published vat can
become garbage.

## System resources

Host capabilities reach guests as durable exports.
Register makers on the host and pass instances as evaluate endowments:

```js
import { makeTimerResource } from '@endo/siesta';

const host = await makeSiestaHost({
  store,
  engine,
  resources: { timer: makeTimerResource },
});
const worker = await host.createWorker({ debugLabel: 'clock' });
const timer = host.makeResource('timer');
const clock = await worker.evaluate(
  `Far('Clock', { read: () => E(timer).now() })`,
  ['timer'],
  [timer],
);
```

When a resource is exported into a worker session, its
`(type, description)` is recorded against the export slot; on host
restart the export is re-instantiated at the same slot, so presences
inside the worker's snapshot keep working.
Resource results are journaled CapTP replies, so nondeterministic
resources (clocks) do not break deterministic replay, and a pending
`timer.delay` wakes a sleeping worker with no inbound traffic.

Resource requests and host-origin promises are at-most-once: an
obligation the host holds only in memory (an answer owed to a guest
question, a resolution owed on a host-made promise) is rejected after
a host restart via a journaled synthetic message — delivered on the
next wake, waking nobody for it — never re-executed. Cross-worker
promises are different: they are described durably in the importing
session's export table and re-linked at restore, so a resolution from
one worker reaches another across host restarts. Within one host
lifetime, a promise resolving while its importer sleeps wakes the
worker like any other message.

## Caveats

This is a prototype.
See the design document for the full list of open issues, notably:
host-origin promises are at-most-once across host restarts (model
durable host obligations as object capabilities; cross-worker promises
do survive) and OCapN sessions themselves are ephemeral — only
sturdy refs are durable.

## Design

See
[designs/ocapn-orthogonal-persistence.md](../../designs/ocapn-orthogonal-persistence.md).
