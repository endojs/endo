// @ts-check

/**
 * The durable worker transport as the hub's durability envelope: the
 * transport journals host→worker frames before the duct, wakes
 * sleeping workers by replaying the journal suffix into a
 * snapshot-restored incarnation, and absorbs the deterministically
 * regenerated outbound frames with a persisted watermark — while the
 * OCapN hub owns all routing. Exercised here against the in-process
 * peer replay engines; `test/durable-worker-session-xs.test.js` runs
 * the same lifecycle on real XS heap snapshots.
 */
import test from '@endo/ses-ava/test.js';

import { bytesToImmutable } from '@endo/bytes/to-immutable.js';
import { E } from '@endo/eventual-send';
import { makeOcapn } from '@endo/ocapn';
import { makeOcapnHub } from '@endo/ocapn/hub';
import { syrupCodec } from '@endo/ocapn/syrup';

import { makeDurableWorkerTransport } from '../src/durable-worker-transport.js';
import { makePipeNetwork } from '../src/pipe-network.js';
import {
  makePeerJournalReplayEngine,
  makePeerSnapshottingReplayEngine,
} from '../src/peer-replay-engine.js';
import { makeMemoryStore } from '../src/store-fs.js';

const textEncoder = new TextEncoder();
/** @param {string} text */
const bytesOf = text => bytesToImmutable(textEncoder.encode(text));
const SHELL_SWISSNUM = bytesOf('shell');

const COUNTER_SOURCE = `
(() => {
  let count = 0;
  return Far('Counter', {
    incr: () => {
      count += 1;
      return count;
    },
    getCount: () => count,
  });
})()
`;

/**
 * The daemon-shaped wiring: a hub, one worker on a durable transport,
 * and an ordinary OCapN client standing in for the embedder.
 *
 * @param {import('ava').ExecutionContext} t
 * @param {object} options
 * @param {string} options.workerId
 * @param {any} options.engine
 * @param {any} options.store a SiestaStore
 * @param {string} [options.debugLabel]
 */
const makeHubKit = async (t, { workerId, engine, store, debugLabel }) => {
  const hub = makeOcapnHub({ codec: syrupCodec });
  /** @type {any} */
  const holder = {};
  const transport = makeDurableWorkerTransport({
    workerId,
    store: store.provideWorkerStore(workerId),
    engine,
    debugLabel,
    onFrame: (/** @type {Uint8Array} */ bytes) => holder.sink.deliver(bytes),
  });
  holder.sink = hub.attachSession(workerId, {
    send: (/** @type {Uint8Array} */ bytes) => transport.write(bytes),
    durable: true,
  });
  hub.publish('worker', { session: workerId, position: 0n });

  const clientKey = 'c'.repeat(32);
  /** @type {{ sink: any, pending: Array<Uint8Array> }} */
  const outbound = { sink: undefined, pending: [] };
  const pipe = makePipeNetwork({
    codec: syrupCodec,
    workerId: clientKey,
    role: 'worker',
    send: frame => {
      if (outbound.sink === undefined) {
        outbound.pending.push(frame);
      } else {
        outbound.sink.deliver(frame);
      }
    },
  });
  const client = await makeOcapn({
    codec: syrupCodec,
    network: pipe.network,
    debugLabel: 'embedder',
  });
  t.teardown(() => client.shutdown());
  const session = await client.provideSession(pipe.peerLocation);
  outbound.sink = hub.attachSession(clientKey, {
    send: (/** @type {Uint8Array} */ bytes) => pipe.deliver(bytes),
  });
  for (const frame of outbound.pending.splice(0)) {
    outbound.sink.deliver(frame);
  }
  return { hub, transport, session };
};

test('a worker session sleeps and wakes by journal replay', async t => {
  const store = makeMemoryStore();
  const workerId = 'd'.repeat(32);
  const { transport, session } = await makeHubKit(t, {
    workerId,
    engine: makePeerJournalReplayEngine(),
    store,
    debugLabel: 'sleeper',
  });
  t.false(transport.isAwake(), 'attachment alone does not wake the worker');

  const shell = await E(E(session.getBootstrap()).fetch(bytesOf('worker'))).fetch(
    SHELL_SWISSNUM,
  );
  t.true(transport.isAwake(), 'the first delivery woke the worker');
  const counter = await E(shell).evaluate(COUNTER_SOURCE);
  t.is(await E(counter).incr(), 1);
  t.is(await E(counter).incr(), 2);

  await transport.sleep();
  t.false(transport.isAwake());

  // The next delivery wakes the worker: a fresh peer replays the whole
  // journal (this engine has no snapshots), regenerates every outbound
  // frame it ever sent — all absorbed by the watermark — and then
  // handles the new frame. The hub session never noticed.
  t.is(await E(counter).incr(), 3, 'state survived sleep via replay');
  t.true(transport.isAwake());
  t.is(await E(counter).getCount(), 3);
});

test('a worker session survives snapshot, sleep, and crash', async t => {
  const store = makeMemoryStore();
  const workerId = 'e'.repeat(32);
  const workerStore = store.provideWorkerStore(workerId);
  const { transport, session } = await makeHubKit(t, {
    workerId,
    engine: makePeerSnapshottingReplayEngine(),
    store,
    debugLabel: 'napper',
  });

  const shell = await E(E(session.getBootstrap()).fetch(bytesOf('worker'))).fetch(
    SHELL_SWISSNUM,
  );
  const counter = await E(shell).evaluate(COUNTER_SOURCE);
  t.is(await E(counter).incr(), 1);
  t.is(await E(counter).incr(), 2);

  await transport.sleep();
  t.false(transport.isAwake());
  const meta = workerStore.getMeta();
  const snapshotRecord = meta.snapshot;
  if (!snapshotRecord) {
    throw t.fail('sleep did not commit a snapshot');
  }
  t.is(meta.outboundSinceSnapshot, 0, 'the outbound watermark reset');
  t.is(
    workerStore.journalLength(),
    snapshotRecord.cut ?? -1,
    'the journal prefix the snapshot subsumes was truncated',
  );

  t.is(await E(counter).incr(), 3, 'woke from the snapshot');

  // Crash without sleep: the incarnation dies with frames journaled
  // after the snapshot. The next delivery restores the snapshot and
  // replays the journal suffix; the watermark absorbs the regenerated
  // outbound frames.
  await transport.crash();
  t.false(transport.isAwake());
  t.is(await E(counter).incr(), 4, 'crash recovery replayed the suffix');
  t.is(await E(counter).getCount(), 4);

  // Presence identity holds across all of it.
  const registry = await E(shell).evaluate(
    `
    (() => {
      let kept;
      return Far('Registry', {
        keep: thing => {
          kept = thing;
          return 'kept';
        },
        isKept: specimen => specimen === kept,
      });
    })()
    `,
  );
  t.is(await E(registry).keep(counter), 'kept');
  await transport.sleep();
  t.is(
    await E(registry).isKept(counter),
    true,
    'a presence passed before sleep unwraps to the original after wake',
  );
});

test('a retired worker session breaks its imports', async t => {
  const store = makeMemoryStore();
  const workerId = 'f'.repeat(32);
  const { hub, transport, session } = await makeHubKit(t, {
    workerId,
    engine: makePeerJournalReplayEngine(),
    store,
    debugLabel: 'retiree',
  });

  const shell = await E(E(session.getBootstrap()).fetch(bytesOf('worker'))).fetch(
    SHELL_SWISSNUM,
  );
  const counter = await E(shell).evaluate(COUNTER_SOURCE);
  t.is(await E(counter).incr(), 1);

  // The daemon pairs the transport's retirement with the hub's, as
  // retireWorkerNow does.
  await transport.retire();
  hub.retireSession(workerId);
  await t.throwsAsync(() => E(counter).incr(), {
    message: /retired/,
  });
});
