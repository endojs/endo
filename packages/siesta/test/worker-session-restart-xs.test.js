// @ts-check
/* global process, setTimeout */

/**
 * Protocol unification phases 3b + 4 on the real XS engine: a daemon
 * restart with two XS workers restored from heap snapshots — resource
 * endowments re-instantiated, cross-worker links re-linked through
 * session records, publications re-seated, and a promise minted in
 * worker A and held in worker B settling across the restart. Requires
 * the built artifacts (see the package README); skips itself when they
 * are absent.
 */
import test from '@endo/ses-ava/test.js';
import harden from '@endo/harden';

import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bytesToImmutable } from '@endo/bytes/to-immutable.js';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/far';
import { makeOcapn } from '@endo/ocapn';
import { syrupCodec } from '@endo/ocapn/syrup';

import { makeDurableWorkerTransport } from '../src/durable-worker-transport.js';
import { makeFsStore } from '../src/store-fs.js';
import { makeWorkerSessionRecords } from '../src/worker-session-records.js';
import { makeXsEngine } from '../src/xs-engine.js';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const workerBinary =
  process.env.SIESTA_XS_WORKER ??
  join(repoRoot, 'target/release/siesta-xs-worker');
const bootPath = fileURLToPath(new URL('../dist-xs/boot.js', import.meta.url));
const bundlePath = fileURLToPath(
  new URL('../dist-xs/worker-peer.js', import.meta.url),
);

const available =
  existsSync(workerBinary) && existsSync(bootPath) && existsSync(bundlePath);
const testXs = available ? test.serial : test.serial.skip;
if (!available) {
  console.error(
    'worker-session-restart-xs tests skipped: build siesta-xs-worker and dist-xs first',
  );
}

const SHELL_SWISSNUM = bytesToImmutable(new TextEncoder().encode('shell'));

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
 * @param {object} options
 * @param {any} options.store
 * @param {any} options.engine
 * @param {Array<string>} options.workerIds
 * @param {Record<string, () => object>} options.resources
 */
const makeDaemon = async ({ store, engine, workerIds, resources }) => {
  /** @type {any} */
  let handlers;
  /** @type {Map<string, object>} */
  const locator = new Map();
  const records = makeWorkerSessionRecords({ store, resources });
  const client = await makeOcapn({
    codec: syrupCodec,
    locator,
    debugLabel: 'unified-daemon-xs',
    sessionHooks: records.sessionHooks,
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
      engine,
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

testXs('XS worker sessions survive a daemon restart', async t => {
  const statePath = await mkdtemp(join(tmpdir(), 'siesta-wsr-xs-test-'));
  t.teardown(() => rm(statePath, { recursive: true, force: true }));
  const engine = makeXsEngine({
    workerBinary,
    bootPath,
    bundlePath,
    casPath: join(statePath, 'cas'),
  });
  const resources = {
    echo: () =>
      Far('Echo', {
        shout: (/** @type {string} */ text) => text.toUpperCase(),
      }),
  };
  const idA = 'a1'.repeat(16);
  const idB = 'b2'.repeat(16);

  {
    // Daemon incarnation 1.
    const store = makeFsStore(statePath);
    const d1 = await makeDaemon({
      store,
      engine,
      workerIds: [idA, idB],
      resources,
    });
    const tA = /** @type {any} */ (d1.transports.get(idA));
    const tB = /** @type {any} */ (d1.transports.get(idB));

    const sessionA = await d1.client.provideSession(tA.peerLocation);
    const shellA = await E(sessionA.getBootstrap()).fetch(SHELL_SWISSNUM);
    const sessionB = await d1.client.provideSession(tB.peerLocation);
    const shellB = await E(sessionB.getBootstrap()).fetch(SHELL_SWISSNUM);

    const echo = d1.records.provideResource('echo');
    const greeter = await E(shellA).evaluate(
      `Far('Greeter', { greet: name => E(echo).shout('hello ' + name) })`,
      ['echo'],
      [echo],
    );
    t.is(await E(greeter).greet('world'), 'HELLO WORLD');

    const counter = await E(shellA).evaluate(
      `
      (() => {
        let count = 0;
        return Far('Counter', {
          incr: () => {
            count += 1;
            return count;
          },
        });
      })()
      `,
    );
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
    t.is(await E(watcher).pull(), 1);
    t.is(await E(watcher).getGot(), null);

    d1.records.publish(d1.locator, 'greeter-cap', greeter);
    d1.records.publish(d1.locator, 'watcher-cap', watcher);
    d1.records.publish(d1.locator, 'gifter-cap', gifter);

    // Real heap snapshots; the processes die.
    await tA.sleep();
    await tB.sleep();

    // Crash the daemon: sever the ducts so the dying client's aborts
    // never reach the journals, then drop it.
    tA.connection.end();
    tB.connection.end();
    await d1.client.shutdown();
  }

  {
    // Daemon incarnation 2, from disk alone.
    const store = makeFsStore(statePath);
    const d2 = await makeDaemon({
      store,
      engine,
      workerIds: [idA, idB],
      resources,
    });
    t.teardown(async () => {
      for (const transport of d2.transports.values()) {
        // eslint-disable-next-line no-await-in-loop
        await /** @type {any} */ (transport).crash();
      }
      await d2.client.shutdown();
    });
    d2.records.restoreWorker(idA);
    d2.records.restoreWorker(idB);
    d2.records.restorePublications(d2.locator);

    const greeter = /** @type {any} */ (d2.locator.get('greeter-cap'));
    t.is(
      await E(greeter).greet('again'),
      'HELLO AGAIN',
      'the resource endowment restored into the XS heap',
    );

    const watcher = /** @type {any} */ (d2.locator.get('watcher-cap'));
    t.is(
      await E(watcher).pull(),
      2,
      'the cross-worker link survived the restart on real snapshots',
    );

    const gifter = /** @type {any} */ (d2.locator.get('gifter-cap'));
    t.is(await E(gifter).release('gifted'), 'released');
    /** @type {any} */
    let got = null;
    await tickUntil(async () => {
      got = await E(watcher).getGot();
      return got !== null;
    });
    t.is(got, 'gifted', 'the settlement crossed the restart and both XS heaps');
  }
});
