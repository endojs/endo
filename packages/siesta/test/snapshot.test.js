// @ts-check
import test from '@endo/ses-ava/test.js';

import harden from '@endo/harden';

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { E } from '@endo/eventual-send';

import { makeSiestaHost } from '../src/host.js';
import { makeSnapshottingReplayEngine } from '../src/journal-replay-engine.js';
import { makeFsStore, makeMemoryStore } from '../src/store-fs.js';

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

test('sleep truncates the journal once a snapshot subsumes it', async t => {
  const store = makeMemoryStore();
  const engine = makeSnapshottingReplayEngine();

  const host = await makeSiestaHost({ store, engine });
  const worker = await host.provideWorker('counter');
  const counter = await worker.evaluate(COUNTER_SOURCE);
  t.is(await E(counter).incr(), 1);
  t.is(await E(counter).incr(), 2);
  await worker.publish(counter, 'counter-cap');

  const workerStore = store.provideWorkerStore('counter');
  const lengthBeforeSleep = workerStore.journalLength();
  t.true(lengthBeforeSleep > 0);
  t.is(workerStore.readJournal(0).length, lengthBeforeSleep);

  await worker.sleep();

  // Absolute length is preserved, but the entries are gone: the
  // snapshot subsumes the whole prefix.
  t.is(workerStore.journalLength(), lengthBeforeSleep);
  t.is(workerStore.readJournal(0).length, 0);
  t.deepEqual(workerStore.getMeta().snapshot?.journalLength, lengthBeforeSleep);

  // Wake from the snapshot alone (empty suffix) with state intact.
  t.is(await E(counter).incr(), 3);

  // Another awake period journals only the new traffic; sleeping again
  // truncates again.
  t.true(workerStore.readJournal(0).length > 0);
  await worker.sleep();
  t.is(workerStore.readJournal(0).length, 0);

  await host.shutdown();
});

test('snapshot plus journal suffix survives host restart', async t => {
  const store = makeMemoryStore();
  const engine = makeSnapshottingReplayEngine();

  {
    const host = await makeSiestaHost({ store, engine });
    const worker = await host.provideWorker('counter');
    const counter = await worker.evaluate(COUNTER_SOURCE);
    t.is(await E(counter).incr(), 1);
    await worker.publish(counter, 'counter-cap');
    // Sleep to snapshot and truncate, then wake and add un-snapshotted
    // traffic, then shut down: shutdown snapshots the suffix too, but a
    // host crash would not — so also leave via shutdown here and cover
    // the crash shape below with the fs store.
    await worker.sleep();
    t.is(await E(counter).incr(), 2);
    await host.shutdown();
  }

  {
    const host = await makeSiestaHost({ store, engine });
    const counter = host.locator.get('counter-cap');
    t.is(await E(counter).incr(), 3, 'state survived snapshot and restart');
    await host.shutdown();
  }
});

test('snapshot restart works on the filesystem store, including after a crash', async t => {
  const statePath = await mkdtemp(join(tmpdir(), 'siesta-snap-test-'));
  t.teardown(() => rm(statePath, { recursive: true, force: true }));
  const engine = makeSnapshottingReplayEngine();

  let secret;
  {
    const host = await makeSiestaHost({
      store: makeFsStore(statePath),
      engine,
    });
    const worker = await host.provideWorker('counter');
    const counter = await worker.evaluate(COUNTER_SOURCE);
    t.is(await E(counter).incr(), 1);
    secret = await worker.publish(counter);
    await worker.sleep();
    // Wake and mutate past the snapshot point, then "crash": drop the
    // host without shutdown, leaving the mutation only in the journal
    // suffix.
    t.is(await E(counter).incr(), 2);
  }

  {
    const host = await makeSiestaHost({
      store: makeFsStore(statePath),
      engine,
    });
    const counter = host.locator.get(secret);
    t.is(
      await E(counter).incr(),
      3,
      'snapshot plus journal suffix recovered the crashed state',
    );
    await host.shutdown();
  }
});

test('an unchanged content-addressed snapshot ref is not released', async t => {
  const store = makeMemoryStore();
  const base = makeSnapshottingReplayEngine();
  /** @type {Array<unknown>} */
  const released = [];
  // Content-addressed refs alias when the heap is unchanged; simulate
  // with an engine whose snapshot ref is always the same hash.
  /** @type {import('../src/host.js').WorkerEngine} */
  const engine = harden({
    canSnapshot: true,
    start: async options => {
      const incarnation = await base.start({ ...options, snapshot: null });
      return harden({
        deliver: incarnation.deliver,
        terminate: incarnation.terminate,
        snapshot: async () => 'constant-hash',
      });
    },
    releaseSnapshot: async ref => {
      released.push(ref);
    },
  });

  const host = await makeSiestaHost({ store, engine });
  const worker = await host.provideWorker('counter');
  const counter = await worker.evaluate(COUNTER_SOURCE);
  t.is(await E(counter).incr(), 1);
  await worker.sleep();
  t.is(released.length, 0, 'first snapshot supersedes nothing');
  await worker.wake();
  await worker.sleep();
  t.is(
    released.length,
    0,
    'an identical ref must never release the snapshot just recorded',
  );
  await host.shutdown();
});

test('superseded snapshots are released to the engine', async t => {
  const store = makeMemoryStore();
  const base = makeSnapshottingReplayEngine();
  /** @type {Array<unknown>} */
  const released = [];
  /** @type {import('../src/host.js').WorkerEngine} */
  const engine = harden({
    canSnapshot: true,
    start: base.start,
    releaseSnapshot: async ref => {
      released.push(ref);
    },
  });

  const host = await makeSiestaHost({ store, engine });
  const worker = await host.provideWorker('counter');
  const counter = await worker.evaluate(COUNTER_SOURCE);
  t.is(await E(counter).incr(), 1);
  await worker.sleep();
  t.is(released.length, 0, 'first snapshot supersedes nothing');
  t.is(await E(counter).incr(), 2);
  await worker.sleep();
  t.is(released.length, 1, 'second snapshot releases the first');
  await host.shutdown();
});
