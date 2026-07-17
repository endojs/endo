// @ts-check
/* global process */

/**
 * The Phase 3 exit criterion: the siesta scenarios pass on real XS heap
 * snapshots. Requires the built artifacts (see the package README):
 *
 *   `yarn workspace @endo/siesta build:xs-bundles`
 *   `cargo build --release -p siesta-xs-worker`
 *
 * When either is missing these tests are skipped.
 */
import test from '@endo/ses-ava/test.js';

import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { E } from '@endo/eventual-send';

import { makeSiestaHost } from '../src/host.js';
import { makeTimerResource } from '../src/resources.js';
import { makeFsStore } from '../src/store-fs.js';
import { makeXsEngine } from '../src/xs-engine.js';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const workerBinary =
  process.env.SIESTA_XS_WORKER ??
  join(repoRoot, 'target/release/siesta-xs-worker');
const bootPath = fileURLToPath(new URL('../dist-xs/boot.js', import.meta.url));
const bundlePath = fileURLToPath(
  new URL('../dist-xs/worker-xs.js', import.meta.url),
);

const available =
  existsSync(workerBinary) && existsSync(bootPath) && existsSync(bundlePath);
const testXs = available ? test.serial : test.serial.skip;
if (!available) {
  console.error(
    'xs-engine tests skipped: build siesta-xs-worker and dist-xs first',
  );
}

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

/** @param {import('ava').ExecutionContext} t */
const makeKit = async t => {
  const statePath = await mkdtemp(join(tmpdir(), 'siesta-xs-test-'));
  t.teardown(() => rm(statePath, { recursive: true, force: true }));
  const engine = makeXsEngine({
    workerBinary,
    bootPath,
    bundlePath,
    casPath: join(statePath, 'cas'),
  });
  return { statePath, engine };
};

testXs('XS worker state survives sleep and host restart', async t => {
  const { statePath, engine } = await makeKit(t);

  let secret;
  {
    const host = await makeSiestaHost({
      store: makeFsStore(statePath),
      engine,
    });
    const worker = await host.provideWorker('counter');
    const counter = await worker.evaluate(COUNTER_SOURCE);
    t.is(await E(counter).incr(), 1);
    t.is(await E(counter).incr(), 2);
    secret = await worker.publish(counter);

    // Sleep takes a real XS heap snapshot and truncates the journal.
    await worker.sleep();
    t.false(worker.isAwake());
    const workerStore = makeFsStore(statePath).provideWorkerStore('counter');
    t.is(workerStore.readJournal(0).length, 0, 'journal truncated');
    const snapshotRef = workerStore.getMeta().snapshot?.ref;
    t.is(typeof snapshotRef, 'string');
    t.true(existsSync(join(statePath, 'cas', String(snapshotRef))));

    // Wake restores the heap; the counter continues.
    t.is(await E(counter).incr(), 3);
    await host.shutdown();
  }

  {
    const host = await makeSiestaHost({
      store: makeFsStore(statePath),
      engine,
    });
    const counter = host.locator.get(secret);
    t.is(
      await E(counter).incr(),
      4,
      'state survived the host restart via the XS snapshot',
    );
    await host.shutdown();
  }
});

testXs('XS worker keeps identity across snapshot restore', async t => {
  const { statePath, engine } = await makeKit(t);

  {
    const host = await makeSiestaHost({
      store: makeFsStore(statePath),
      engine,
    });
    const worker = await host.provideWorker('registry');
    const registry = await worker.evaluate(`
      (() => {
        const thing = Far('Thing', { hi: () => 'hi' });
        return Far('Registry', {
          getThing: () => thing,
          isThing: specimen => specimen === thing,
        });
      })()
    `);
    const thing = await E(registry).getThing();
    t.is(await E(registry).isThing(thing), true);
    await worker.publish(registry, 'registry');
    await worker.publish(thing, 'thing');
    await host.shutdown();
  }

  {
    const host = await makeSiestaHost({
      store: makeFsStore(statePath),
      engine,
    });
    t.is(
      await E(host.locator.get('registry')).isThing(host.locator.get('thing')),
      true,
      'restored presences unwrap to the original objects in the XS heap',
    );
    await host.shutdown();
  }
});

testXs('XS worker uses durable host resources across restart', async t => {
  const { statePath, engine } = await makeKit(t);
  const resources = { timer: makeTimerResource };

  {
    const host = await makeSiestaHost({
      store: makeFsStore(statePath),
      engine,
      resources,
    });
    const worker = await host.provideWorker('clock');
    const timer = host.makeResource('timer');
    const clock = await worker.evaluate(
      `Far('Clock', { read: () => E(timer).now() })`,
      ['timer'],
      [timer],
    );
    t.is(typeof (await E(clock).read()), 'number');
    await worker.publish(clock, 'clock');
    await host.shutdown();
  }

  {
    const host = await makeSiestaHost({
      store: makeFsStore(statePath),
      engine,
      resources,
    });
    const clock = host.locator.get('clock');
    t.is(
      typeof (await E(clock).read()),
      'number',
      'the re-instantiated timer export serves the restored XS heap',
    );
    await host.shutdown();
  }
});
