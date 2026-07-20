// @ts-check
/* global setTimeout */

/**
 * Worker sessions survive a daemon restart on the hub daemon: the hub
 * tables (c-lists, answer routes, publications) and the endpoint's
 * resource records reload from the store; worker heaps restore from
 * snapshots; nothing is re-seated because nothing was reified.
 *
 * Also the settlement acid test: a promise minted in worker A, held in
 * worker B, settles across the restart — the subscription is nothing
 * but rows and a wire subscription in A's heap.
 */
import test from '@endo/ses-ava/test.js';

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { E } from '@endo/eventual-send';
import { Far } from '@endo/far';
import { makeTcpNetLayer } from '@endo/ocapn/netlayer/tcp-testing';
import { syrupCodec } from '@endo/ocapn/syrup';

import { makeSiestaDaemon } from '../src/daemon.js';
import { makePeerSnapshottingReplayEngine } from '../src/peer-replay-engine.js';
import { makeFsStore } from '../src/store-fs.js';

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

const resources = {
  echo: () =>
    Far('Echo', {
      shout: (/** @type {string} */ text) => text.toUpperCase(),
    }),
};

/** @param {string} statePath */
const makeDaemon = statePath =>
  makeSiestaDaemon({
    store: makeFsStore(statePath),
    engine: makePeerSnapshottingReplayEngine(),
    codec: syrupCodec,
    resources,
    makeNetlayer: ({ handlers, logger }) =>
      makeTcpNetLayer({ handlers, logger }),
  });

test('worker sessions survive a daemon restart', async t => {
  const statePath = await mkdtemp(join(tmpdir(), 'siesta-wsr-'));
  t.teardown(() => rm(statePath, { recursive: true, force: true }));
  const store = makeFsStore(statePath);

  /** @type {string} */
  let idA;
  /** @type {string} */
  let idB;
  {
    // Daemon incarnation 1.
    const d1 = await makeDaemon(statePath);
    const workerA = await d1.createWorker({ debugLabel: 'owner' });
    const workerB = await d1.createWorker({ debugLabel: 'holder' });
    idA = workerA.workerId;
    idB = workerB.workerId;

    // A resource endowment into worker A.
    const echo = d1.makeResource('echo');
    const greeter = await workerA.evaluate(
      `Far('Greeter', { greet: name => E(echo).shout('hello ' + name) })`,
      ['echo'],
      [echo],
    );
    t.is(await E(greeter).greet('world'), 'HELLO WORLD');

    // A cross-worker link and a cross-worker pending promise, both
    // relayed by the daemon into worker B.
    const counter = await workerA.evaluate(COUNTER_SOURCE);
    const gifter = await workerA.evaluate(
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
    const watcher = await workerB.evaluate(
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

    d1.publish(greeter, 'greeter-cap');
    d1.publish(watcher, 'watcher-cap');
    d1.publish(gifter, 'gifter-cap');

    // The daemon is non-reifying: the cross-worker references and the
    // gift subscription exist only as hub c-list rows.
    const hubState = store.getHubState();
    t.truthy(hubState.sessions[idA], 'worker A has hub session rows');
    t.truthy(hubState.sessions[idB], 'worker B has hub session rows');

    await workerA.sleep();
    await workerB.sleep();
    t.false(workerA.isAwake());
    t.false(workerB.isAwake());

    await d1.crash();
  }

  {
    // Daemon incarnation 2, from the store alone.
    const d2 = await makeDaemon(statePath);
    t.teardown(() => d2.shutdown());

    t.false(
      d2.getWorker(idB).isAwake(),
      'restoring records and obligations woke no worker',
    );

    const greeter = await d2.lookup('greeter-cap');
    t.is(
      await E(greeter).greet('again'),
      'HELLO AGAIN',
      'the resource endowment was re-instantiated across the restart',
    );

    const watcher = await d2.lookup('watcher-cap');
    t.is(
      await E(watcher).pull(),
      2,
      'the cross-worker link survived the restart',
    );
    t.is(await E(watcher).getGot(), null, 'the gift is still pending');

    // Settle the promise minted in A and held in B, across the
    // restart: A's heap still holds the wire subscription; the hub
    // rows still route it; nobody re-subscribed anything.
    const gifter = await d2.lookup('gifter-cap');
    t.is(await E(gifter).release('gifted'), 'released');
    /** @type {any} */
    let got = null;
    await tickUntil(async () => {
      got = await E(watcher).getGot();
      return got !== null;
    });
    t.is(got, 'gifted', 'the settlement crossed the restart and both workers');
  }
});
