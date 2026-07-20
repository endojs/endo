// @ts-check
/* global setTimeout */

/**
 * Protocol unification phase 3b: worker sessions survive a daemon
 * restart. The daemon's side of each worker session — its exports into
 * the worker (resources and cross-worker links), its resolver
 * obligations, and its publications — is recorded durably
 * (`worker-session-records.js`) and re-seated in a successor process
 * through the same handshake-free `resumeSession` establishment a
 * fresh worker uses. The worker halves live in their heap snapshots;
 * nothing about session identity is persisted because nothing about it
 * is contingent.
 *
 * Also the phase 4 acid test: a promise minted in worker A, held in
 * worker B, settles across the restart — relay, re-subscription, and
 * resolver re-attachment compose into comms-vat settlement routing.
 */
import test from '@endo/ses-ava/test.js';
import harden from '@endo/harden';

import { bytesToImmutable } from '@endo/bytes/to-immutable.js';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/far';
import { makeOcapn } from '@endo/ocapn';
import { syrupCodec } from '@endo/ocapn/syrup';

import { makeDurableWorkerTransport } from '../src/durable-worker-transport.js';
import { makePeerSnapshottingReplayEngine } from '../src/peer-replay-engine.js';
import { makeMemoryStore } from '../src/store-fs.js';
import { makeWorkerSessionRecords } from '../src/worker-session-records.js';

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

const macrotask = () => new Promise(resolve => setTimeout(resolve, 0));

/** @param {() => Promise<boolean>} predicate */
const tickUntil = async predicate => {
  for (let i = 0; i < 1000; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (await predicate()) {
      return;
    }
    // eslint-disable-next-line no-await-in-loop
    await macrotask();
  }
  throw Error('tickUntil timed out');
};

/**
 * One unified-daemon process: a single OCapN client whose worker
 * sessions ride durable worker transports, with worker-session records
 * observing through the sessionHooks seam.
 *
 * @param {object} options
 * @param {any} options.store
 * @param {Array<string>} options.workerIds
 * @param {Record<string, () => object>} options.resources
 * @param {(error: unknown) => void} [options.reportError]
 */
const makeDaemon = async ({ store, workerIds, resources, reportError }) => {
  /** @type {any} */
  let handlers;
  /** @type {Map<string, object>} */
  const locator = new Map();
  const records = makeWorkerSessionRecords({ store, resources, reportError });
  const client = await makeOcapn({
    codec: syrupCodec,
    locator,
    debugLabel: 'unified-daemon',
    sessionHooks: records.sessionHooks,
    // Relay policy: pipe-origin grants re-export as the daemon's own
    // objects; worker locations are unreachable by design.
    shouldHandoff: (/** @type {any} */ grantDetails) =>
      (grantDetails.location.network ?? grantDetails.location.transport) !==
      'siesta-pipe',
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
  /** @type {Map<string, ReturnType<typeof makeDurableWorkerTransport>>} */
  const transports = new Map();
  for (const workerId of workerIds) {
    const transport = makeDurableWorkerTransport({
      workerId,
      store: store.provideWorkerStore(workerId),
      engine: makePeerSnapshottingReplayEngine(),
      handlers,
      codec: syrupCodec,
      debugLabel: `worker-${workerId.slice(0, 2)}`,
    });
    records.registerWorkerConnection(transport.connection, workerId);
    records.registerResumedSession(workerId, transport.establish());
    transports.set(workerId, transport);
  }
  return { client, records, transports, locator };
};

test('worker sessions survive a daemon restart', async t => {
  const store = makeMemoryStore();
  const resources = {
    echo: () =>
      Far('Echo', {
        shout: (/** @type {string} */ text) => text.toUpperCase(),
      }),
  };
  const idA = 'a1'.repeat(16);
  const idB = 'b2'.repeat(16);
  /** @type {Array<unknown>} */
  const reported = [];
  const reportError = (/** @type {unknown} */ error) => {
    reported.push(error);
  };

  {
    // Daemon incarnation 1.
    const d1 = await makeDaemon({
      store,
      workerIds: [idA, idB],
      resources,
      reportError,
    });
    const tA = /** @type {any} */ (d1.transports.get(idA));
    const tB = /** @type {any} */ (d1.transports.get(idB));

    const sessionA = await d1.client.provideSession(tA.peerLocation);
    const shellA = await E(sessionA.getBootstrap()).fetch(SHELL_SWISSNUM);
    const sessionB = await d1.client.provideSession(tB.peerLocation);
    const shellB = await E(sessionB.getBootstrap()).fetch(SHELL_SWISSNUM);

    // A resource endowment into worker A.
    const echo = d1.records.provideResource('echo');
    const greeter = await E(shellA).evaluate(
      `Far('Greeter', { greet: name => E(echo).shout('hello ' + name) })`,
      ['echo'],
      [echo],
    );
    t.is(await E(greeter).greet('world'), 'HELLO WORLD');

    // A cross-worker link and a cross-worker pending promise, both
    // relayed by the daemon into worker B.
    const counter = await E(shellA).evaluate(COUNTER_SOURCE);
    const gifter = await E(shellA).evaluate(
      `
      (() => {
        let release;
        const gift = new Promise(resolve => {
          release = resolve;
        });
        return Far('Gifter', {
          getGift: () => harden({ gift }),
          release: value => {
            release(value);
            return 'released';
          },
        });
      })()
      `,
    );
    const { gift } = await E(gifter).getGift();
    const watcher = await E(shellB).evaluate(
      `
      (() => {
        let got = null;
        gift.then(
          value => {
            got = value;
          },
          () => {
            got = 'rejected';
          },
        );
        return Far('Watcher', {
          pull: () => E(counter).incr(),
          getGot: () => got,
        });
      })()
      `,
      ['gift', 'counter'],
      [gift, counter],
    );
    t.is(await E(watcher).pull(), 1, 'the cross-worker link works live');
    t.is(await E(watcher).getGot(), null, 'the gift is still pending');

    d1.records.publish(d1.locator, 'greeter-cap', greeter);
    d1.records.publish(d1.locator, 'watcher-cap', watcher);
    d1.records.publish(d1.locator, 'gifter-cap', gifter);

    await tA.sleep();
    await tB.sleep();
    t.false(tA.isAwake());
    t.false(tB.isAwake());

    // Crash the daemon: sever the ducts first so the dying client's
    // session aborts never reach the journals, then drop it.
    tA.connection.end();
    tB.connection.end();
    await d1.client.shutdown();
  }

  {
    // Daemon incarnation 2, from the store alone.
    const d2 = await makeDaemon({
      store,
      workerIds: [idA, idB],
      resources,
      reportError,
    });
    t.teardown(() => d2.client.shutdown());
    d2.records.restoreWorker(idA);
    d2.records.restoreWorker(idB);
    d2.records.restorePublications(d2.locator);

    const tB2 = /** @type {any} */ (d2.transports.get(idB));
    t.false(
      tB2.isAwake(),
      'restoring object links and obligations woke no worker',
    );

    const greeter = /** @type {any} */ (d2.locator.get('greeter-cap'));
    t.is(
      await E(greeter).greet('again'),
      'HELLO AGAIN',
      'the resource endowment was re-instantiated across the restart',
    );

    const watcher = /** @type {any} */ (d2.locator.get('watcher-cap'));
    t.is(
      await E(watcher).pull(),
      2,
      'the cross-worker link survived the restart',
    );
    t.is(await E(watcher).getGot(), null, 'the gift is still pending');

    // Settle the promise minted in A and held in B, across the
    // restart: relay, re-subscription, and resolver re-attachment.
    const gifter = /** @type {any} */ (d2.locator.get('gifter-cap'));
    t.is(await E(gifter).release('gifted'), 'released');
    /** @type {any} */
    let got = null;
    await tickUntil(async () => {
      got = await E(watcher).getGot();
      return got !== null;
    });
    t.is(got, 'gifted', 'the settlement crossed the restart and both workers');

    t.deepEqual(reported, [], 'every session export had a durable description');
  }
});
