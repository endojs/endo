// @ts-check
/* global process, setTimeout */

/**
 * The unified daemon's restart story on the real XS engine: two XS
 * workers restored from heap snapshots — resource endowments
 * re-instantiated, cross-worker links re-linked through session
 * records, publications re-seated, and a promise minted in worker A
 * and held in worker B settling across the restart through a restored
 * listen forwarder (the daemon is non-reifying: it never subscribes to
 * a promise itself). Requires the built artifacts (see the package
 * README); skips itself when they are absent.
 */
import test from '@endo/ses-ava/test.js';

import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { E } from '@endo/eventual-send';
import { Far } from '@endo/far';
import { makeTcpNetLayer } from '@endo/ocapn/netlayer/tcp-testing';
import { syrupCodec } from '@endo/ocapn/syrup';

import { makeSiestaDaemon } from '../src/daemon.js';
import { makeFsStore } from '../src/store-fs.js';
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

/**
 * @param {string} statePath
 * @param {any} engine
 */
const makeDaemon = (statePath, engine) =>
  makeSiestaDaemon({
    store: makeFsStore(statePath),
    engine,
    codec: syrupCodec,
    resources,
    makeNetlayer: ({ handlers, logger }) =>
      makeTcpNetLayer({ handlers, logger }),
  });

testXs('XS worker sessions survive a daemon restart', async t => {
  const statePath = await mkdtemp(join(tmpdir(), 'siesta-wsr-xs-test-'));
  t.teardown(() => rm(statePath, { recursive: true, force: true }));
  const engine = makeXsEngine({
    workerBinary,
    bootPath,
    bundlePath,
    casPath: join(statePath, 'cas'),
  });

  /** @type {string} */
  let idB;
  {
    // Daemon incarnation 1.
    const d1 = await makeDaemon(statePath, engine);
    const workerA = await d1.createWorker({ debugLabel: 'owner' });
    const workerB = await d1.createWorker({ debugLabel: 'holder' });
    idB = workerB.workerId;

    const echo = d1.makeResource('echo');
    const greeter = await workerA.evaluate(
      `Far('Greeter', { greet: name => E(echo).shout('hello ' + name) })`,
      ['echo'],
      [echo],
    );
    t.is(await E(greeter).greet('world'), 'HELLO WORLD');

    const counter = await workerA.evaluate(
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
    t.is(await E(watcher).pull(), 1);
    t.is(await E(watcher).getGot(), null);

    d1.publish(greeter, 'greeter-cap');
    d1.publish(watcher, 'watcher-cap');
    d1.publish(gifter, 'gifter-cap');

    // Real heap snapshots; the processes die; then abandon the daemon
    // the way a power failure would.
    await workerA.sleep();
    await workerB.sleep();
    await d1.crash();
  }

  {
    // Daemon incarnation 2, from disk alone.
    const d2 = await makeDaemon(statePath, engine);
    t.teardown(() => d2.shutdown());
    t.false(d2.getWorker(idB).isAwake(), 'restore woke no worker');

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
