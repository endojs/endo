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

## Example

```js
import { E } from '@endo/eventual-send';
import { makeTcpNetLayer } from '@endo/ocapn/netlayer/tcp-testing';
import { syrupCodec } from '@endo/ocapn/syrup';
import {
  makeFsStore,
  makeJournalReplayEngine,
  makeSiestaDaemon,
} from '@endo/siesta';

const daemon = await makeSiestaDaemon({
  store: makeFsStore(statePath),
  engine: makeJournalReplayEngine(),
  codec: syrupCodec,
  makeNetlayer: ({ handlers, logger }) => makeTcpNetLayer({ handlers, logger }),
});

const worker = await daemon.host.provideWorker('counter');
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

`makeJournalReplayEngine` is the reference engine: each incarnation
starts a fresh worker shell and the host replays the journal, suppressing
the worker's re-emitted replies.
For a deterministic guest this is behaviorally identical to snapshot
restoration, but the journal is the persistence and can never be
dropped.

`makeSnapshottingReplayEngine` implements `canSnapshot: true` without an
XS build, which activates the host's full snapshot lifecycle: at every
sleep the host records the snapshot ref durably, truncates the journal
prefix the snapshot subsumes, and releases the superseded ref to the
engine.
Journals are absolutely indexed, so truncation never moves an offset;
wakes restore from the snapshot ref plus the journal suffix, which also
recovers cleanly from host crashes between snapshots.

A production engine backs incarnations with XS machines under a
snapshotting supervisor (see `rust/endo/xsnap` and
`designs/ocapn-orthogonal-persistence.md`).

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
const worker = await host.provideWorker('clock');
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

## Caveats

This is a prototype.
See the design document for the full list of open issues, notably: a
worker-to-host call in flight across a host restart is lost (the guest's
awaited promise hangs), promise imports do not survive restarts, and
OCapN sessions themselves are ephemeral — only sturdy refs are durable.

## Design

See
[designs/ocapn-orthogonal-persistence.md](../../designs/ocapn-orthogonal-persistence.md).
