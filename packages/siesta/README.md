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
restoration.
A production engine backs incarnations with XS machines under a
snapshotting supervisor (see `rust/endo/xsnap` and
`designs/ocapn-orthogonal-persistence.md`).

## Caveats

This is a prototype.
See the design document for the full list of open issues, notably: host
exports to workers are not durable (no formula layer), promise imports do
not survive restarts, and OCapN sessions themselves are ephemeral — only
sturdy refs are durable.

## Design

See
[designs/ocapn-orthogonal-persistence.md](../../designs/ocapn-orthogonal-persistence.md).
