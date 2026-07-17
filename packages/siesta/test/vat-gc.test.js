// @ts-check
import test from '@endo/ses-ava/test.js';

import harden from '@endo/harden';
import { E } from '@endo/eventual-send';

import { makeSiestaHost } from '../src/host.js';
import {
  makeJournalReplayEngine,
  makeSnapshottingReplayEngine,
} from '../src/journal-replay-engine.js';
import { makeMemoryStore } from '../src/store-fs.js';

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

const PARENT_SOURCE = `
(() => {
  let childRoot;
  const shared = Far('Shared', { secret: () => 'from-parent' });
  return Far('Parent', {
    setup: async () => {
      const child = await E(controller).provideWorker('child');
      childRoot = await E(child).evaluate(
        \`
        (() => {
          return Far('Child', {
            pull: async () => E(shared).secret(),
          });
        })()
        \`,
        ['shared'],
        [shared],
      );
      return childRoot;
    },
    askChild: async () => {
      try {
        return await E(childRoot).pull();
      } catch (reason) {
        return 'failed: ' + String((reason && reason.message) || reason);
      }
    },
  });
})()
`;

test('collectVats sweeps unreachable vats and keeps the linked graph', async t => {
  const store = makeMemoryStore();
  const engine = makeJournalReplayEngine();
  const host = await makeSiestaHost({ store, engine });

  const parent = await host.provideWorker('parent');
  const controller = host.makeResource('worker-controller');
  const parentRoot = await parent.evaluate(
    PARENT_SOURCE,
    ['controller'],
    [controller],
  );
  const childRoot = await E(parentRoot).setup();
  t.is(await E(childRoot).pull(), 'from-parent');
  await parent.publish(parentRoot, 'parent-cap');

  // An orphan: created and used, never published, linked from nowhere.
  const orphan = await host.provideWorker('orphan');
  await orphan.evaluate(COUNTER_SOURCE);

  // Awake workers are pinned; sleep everyone so reachability decides.
  for (const name of host.listWorkerNames()) {
    // eslint-disable-next-line no-await-in-loop
    await (await host.provideWorker(name)).sleep();
  }

  t.deepEqual(await host.collectVats(), ['orphan']);
  t.deepEqual(host.listWorkerNames(), ['child', 'parent']);
  t.deepEqual(store.listWorkerNames(), ['child', 'parent']);

  // The kept graph still works, including the cross-worker link.
  t.is(await E(parentRoot).askChild(), 'from-parent');

  // Unpublishing the only root makes the whole parent-child cycle
  // (parent links child, child links parent) collectible together.
  host.unpublish('parent-cap');
  for (const name of host.listWorkerNames()) {
    // eslint-disable-next-line no-await-in-loop
    await (await host.provideWorker(name)).sleep();
  }
  t.deepEqual(await host.collectVats(), ['child', 'parent']);
  t.deepEqual(host.listWorkerNames(), []);
  t.deepEqual(store.listWorkerNames(), []);
});

test('retireWorker rejects live presences and deletes durable state', async t => {
  const store = makeMemoryStore();
  const engine = makeJournalReplayEngine();
  const host = await makeSiestaHost({ store, engine });

  const worker = await host.provideWorker('counter');
  const counter = await worker.evaluate(COUNTER_SOURCE);
  t.is(await E(counter).incr(), 1);
  const secret = await worker.publish(counter);

  await host.retireWorker('counter');
  t.deepEqual(host.listWorkerNames(), []);
  t.deepEqual(store.listWorkerNames(), []);
  t.is(host.locator.get(secret), undefined, 'publication dropped');
  await t.throwsAsync(() => E(counter).incr(), {
    message: /retired/,
  });
});

test('retired links tombstone across host restarts', async t => {
  const store = makeMemoryStore();
  const engine = makeJournalReplayEngine();

  {
    const host = await makeSiestaHost({ store, engine });
    const parent = await host.provideWorker('parent');
    const controller = host.makeResource('worker-controller');
    const parentRoot = await parent.evaluate(
      PARENT_SOURCE,
      ['controller'],
      [controller],
    );
    await E(parentRoot).setup();
    await parent.publish(parentRoot, 'parent-cap');
    await host.retireWorker('child');
    t.regex(
      String(await E(parentRoot).askChild()),
      /^failed: /,
      'the live link rejects after retirement',
    );
    await host.shutdown();
  }

  {
    const host = await makeSiestaHost({ store, engine });
    t.deepEqual(host.listWorkerNames(), ['parent']);
    const parentRoot = host.locator.get('parent-cap');
    t.regex(
      String(await E(parentRoot).askChild()),
      /^failed: /,
      'the tombstoned link still rejects after a restart',
    );
    await host.shutdown();
  }
});

test('a snapshot ref shared between workers is only released with its last user', async t => {
  const store = makeMemoryStore();
  const base = makeSnapshottingReplayEngine();
  /** @type {Array<unknown>} */
  const released = [];
  // Simulate content-addressed aliasing: both workers' snapshots hash
  // to the same ref.
  /** @type {import('../src/host.js').WorkerEngine} */
  const engine = harden({
    canSnapshot: true,
    start: async options => {
      const incarnation = await base.start({ ...options, snapshot: null });
      return harden({
        deliver: incarnation.deliver,
        terminate: incarnation.terminate,
        snapshot: async () => 'shared-hash',
      });
    },
    releaseSnapshot: async ref => {
      released.push(ref);
    },
  });

  const host = await makeSiestaHost({ store, engine });
  const alice = await host.provideWorker('alice');
  const bob = await host.provideWorker('bob');
  await alice.evaluate(COUNTER_SOURCE);
  await bob.evaluate(COUNTER_SOURCE);
  await alice.sleep();
  await bob.sleep();

  await host.retireWorker('alice');
  t.deepEqual(released, [], 'bob still uses the shared ref');
  await host.retireWorker('bob');
  t.deepEqual(released, ['shared-hash'], 'the last user releases it');
});
