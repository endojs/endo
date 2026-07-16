// @ts-check
/* global setTimeout */
import test from '@endo/ses-ava/test.js';

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { E } from '@endo/eventual-send';

import { makeSiestaHost } from '../src/host.js';
import { makeJournalReplayEngine } from '../src/journal-replay-engine.js';
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

const tickUntil = async predicate => {
  for (let i = 0; i < 1000; i += 1) {
    if (predicate()) {
      return;
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw Error('tickUntil timed out');
};

test('worker state and publications survive host restart', async t => {
  const store = makeMemoryStore();
  const engine = makeJournalReplayEngine();

  {
    const host = await makeSiestaHost({ store, engine });
    const worker = await host.provideWorker('counter');
    const counter = await worker.evaluate(COUNTER_SOURCE);
    t.is(await E(counter).incr(), 1);
    t.is(await E(counter).incr(), 2);
    const secret = await worker.publish(counter, 'counter-cap');
    t.is(secret, 'counter-cap');
    await host.shutdown();
  }

  {
    const host = await makeSiestaHost({ store, engine });
    t.deepEqual(host.listWorkerNames(), ['counter']);
    const counter = host.locator.get('counter-cap');
    t.truthy(counter, 'publication rebinds into the locator on restart');
    // The worker only wakes when the restored presence is used.
    const worker = await host.provideWorker('counter');
    t.false(worker.isAwake());
    t.is(await E(counter).incr(), 3);
    t.true(worker.isAwake());
    await host.shutdown();
  }
});

test('worker state survives host restart on the filesystem store', async t => {
  const statePath = await mkdtemp(join(tmpdir(), 'siesta-test-'));
  t.teardown(() => rm(statePath, { recursive: true, force: true }));
  const engine = makeJournalReplayEngine();

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
    await host.shutdown();
  }

  {
    const host = await makeSiestaHost({
      store: makeFsStore(statePath),
      engine,
    });
    const counter = host.locator.get(secret);
    t.is(await E(counter).incr(), 2);
    t.is(await E(counter).getCount(), 2);
    await host.shutdown();
  }
});

test('sleepy worker sleeps on demand and wakes on use', async t => {
  const host = await makeSiestaHost({
    store: makeMemoryStore(),
    engine: makeJournalReplayEngine(),
  });
  const worker = await host.provideWorker('counter');
  const counter = await worker.evaluate(COUNTER_SOURCE);
  t.is(await E(counter).incr(), 1);
  t.true(worker.isAwake());

  await worker.sleep();
  t.false(worker.isAwake());

  // Using an existing presence transparently wakes the worker with its
  // state intact.
  t.is(await E(counter).incr(), 2);
  t.true(worker.isAwake());
  await host.shutdown();
});

test('idle worker falls asleep on its own and wakes on use', async t => {
  const host = await makeSiestaHost({
    store: makeMemoryStore(),
    engine: makeJournalReplayEngine(),
    idleTimeoutMs: 25,
  });
  const worker = await host.provideWorker('idler');
  const idler = await worker.evaluate(`Far('Idler', { poke: () => 'ok' })`);
  t.is(await E(idler).poke(), 'ok');
  t.true(worker.isAwake());

  await tickUntil(() => !worker.isAwake());
  t.false(worker.isAwake());

  t.is(await E(idler).poke(), 'ok');
  await host.shutdown();
});

test('multiple workers persist independently', async t => {
  const store = makeMemoryStore();
  const engine = makeJournalReplayEngine();

  {
    const host = await makeSiestaHost({ store, engine });
    const alice = await host.provideWorker('alice');
    const bob = await host.provideWorker('bob');
    const counterA = await alice.evaluate(COUNTER_SOURCE);
    const counterB = await bob.evaluate(COUNTER_SOURCE);
    t.is(await E(counterA).incr(), 1);
    t.is(await E(counterB).incr(), 1);
    t.is(await E(counterA).incr(), 2);
    await alice.publish(counterA, 'a');
    await bob.publish(counterB, 'b');
    await host.shutdown();
  }

  {
    const host = await makeSiestaHost({ store, engine });
    t.is(await E(host.locator.get('a')).getCount(), 2);
    t.is(await E(host.locator.get('b')).getCount(), 1);
    await host.shutdown();
  }
});

test('published presences keep identity when passed back to their worker', async t => {
  const store = makeMemoryStore();
  const engine = makeJournalReplayEngine();

  {
    const host = await makeSiestaHost({ store, engine });
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
    const host = await makeSiestaHost({ store, engine });
    const registry = host.locator.get('registry');
    const thing = host.locator.get('thing');
    t.is(
      await E(registry).isThing(thing),
      true,
      'restored presences unwrap to the original objects in the worker',
    );
    await host.shutdown();
  }
});
