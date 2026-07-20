// @ts-check

/**
 * Protocol unification phase 3: one worker = one durable OCapN session
 * on the daemon's client. The durable worker transport journals
 * host→worker frames before the duct, wakes sleeping workers by
 * replaying the journal suffix into a snapshot-restored incarnation,
 * and absorbs the deterministically regenerated outbound frames with a
 * persisted watermark. Exercised here against the in-process peer
 * replay engines; `test/durable-worker-session-xs.test.js` runs the
 * same lifecycle on real XS heap snapshots.
 */
import test from '@endo/ses-ava/test.js';
import harden from '@endo/harden';

import { bytesToImmutable } from '@endo/bytes/to-immutable.js';
import { E } from '@endo/eventual-send';
import { makeOcapn } from '@endo/ocapn';
import { syrupCodec } from '@endo/ocapn/syrup';

import { makeDurableWorkerTransport } from '../src/durable-worker-transport.js';
import {
  makePeerJournalReplayEngine,
  makePeerSnapshottingReplayEngine,
} from '../src/peer-replay-engine.js';
import { makeMemoryStore } from '../src/store-fs.js';

const SHELL_SWISSNUM = bytesToImmutable(new TextEncoder().encode('shell'));

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

const DAEMON_LOCATION = harden({
  type: /** @type {const} */ ('ocapn-peer'),
  network: 'siesta-daemon',
  transport: 'siesta-daemon',
  designator: 'daemon',
  hints: /** @type {const} */ (false),
});

/**
 * A daemon OCapN client whose network is inert: every worker session
 * is pre-established through the resumeSession seam, so the network
 * only contributes a location. Captures the netlayer handlers the
 * durable worker transport plugs into.
 *
 * @param {import('ava').ExecutionContext} t
 */
const makeDaemonKit = async t => {
  /** @type {any} */
  let handlers;
  const client = await makeOcapn({
    codec: syrupCodec,
    debugLabel: 'unified-daemon',
    network: (/** @type {any} */ h) => {
      handlers = h;
      return harden({
        networkId: 'siesta-daemon',
        codec: syrupCodec,
        location: DAEMON_LOCATION,
        shutdown: () => {},
      });
    },
  });
  t.teardown(() => client.shutdown());
  return { client, handlers };
};

test('a worker session sleeps and wakes by journal replay', async t => {
  const { client, handlers } = await makeDaemonKit(t);
  const store = makeMemoryStore();
  const workerId = 'd'.repeat(32);
  const transport = makeDurableWorkerTransport({
    workerId,
    store: store.provideWorkerStore(workerId),
    engine: makePeerJournalReplayEngine(),
    handlers,
    codec: syrupCodec,
    debugLabel: 'sleeper',
  });
  transport.establish();
  t.false(transport.isAwake(), 'establishment alone does not wake the worker');

  const session = await client.provideSession(transport.peerLocation);
  const shell = await E(session.getBootstrap()).fetch(SHELL_SWISSNUM);
  t.true(transport.isAwake(), 'the first delivery woke the worker');
  const counter = await E(shell).evaluate(COUNTER_SOURCE);
  t.is(await E(counter).incr(), 1);
  t.is(await E(counter).incr(), 2);

  await transport.sleep();
  t.false(transport.isAwake());

  // The next delivery wakes the worker: a fresh peer replays the whole
  // journal (this engine has no snapshots), regenerates every outbound
  // frame it ever sent — all absorbed by the watermark — and then
  // handles the new frame. The host session never noticed.
  t.is(await E(counter).incr(), 3, 'state survived sleep via replay');
  t.true(transport.isAwake());
  t.is(await E(counter).getCount(), 3);
});

test('a worker session survives snapshot, sleep, and crash', async t => {
  const { client, handlers } = await makeDaemonKit(t);
  const store = makeMemoryStore();
  const workerId = 'e'.repeat(32);
  const workerStore = store.provideWorkerStore(workerId);
  const transport = makeDurableWorkerTransport({
    workerId,
    store: workerStore,
    engine: makePeerSnapshottingReplayEngine(),
    handlers,
    codec: syrupCodec,
    debugLabel: 'napper',
  });
  transport.establish();

  const session = await client.provideSession(transport.peerLocation);
  const shell = await E(session.getBootstrap()).fetch(SHELL_SWISSNUM);
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
  const { client, handlers } = await makeDaemonKit(t);
  const store = makeMemoryStore();
  const workerId = 'f'.repeat(32);
  const transport = makeDurableWorkerTransport({
    workerId,
    store: store.provideWorkerStore(workerId),
    engine: makePeerJournalReplayEngine(),
    handlers,
    codec: syrupCodec,
    debugLabel: 'retiree',
  });
  transport.establish();

  const session = await client.provideSession(transport.peerLocation);
  const shell = await E(session.getBootstrap()).fetch(SHELL_SWISSNUM);
  const counter = await E(shell).evaluate(COUNTER_SOURCE);
  t.is(await E(counter).incr(), 1);

  await transport.retire();
  // The session aborts with the retirement as its cause.
  const failure = await t.throwsAsync(() => E(counter).incr(), {
    message: /Session disconnected/,
  });
  t.regex(
    String(/** @type {any} */ (failure)?.cause?.message),
    /retired/,
    'the abort reason names the retirement',
  );
});
