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
      const child = await E(controller).createWorker('child');
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

  const parent = await host.createWorker({ debugLabel: 'parent' });
  const controller = host.makeResource('worker-controller');
  const parentRoot = await parent.evaluate(
    PARENT_SOURCE,
    ['controller'],
    [controller],
  );
  const childRoot = await E(parentRoot).setup();
  t.is(await E(childRoot).pull(), 'from-parent');
  await parent.publish(parentRoot, 'parent-cap');
  const childId = /** @type {string} */ (
    host.listWorkerIds().find(id => id !== parent.workerId)
  );

  // An orphan: created and used, never published, linked from nowhere.
  const orphan = await host.createWorker({ debugLabel: 'orphan' });
  await orphan.evaluate(COUNTER_SOURCE);

  // Awake workers are pinned; sleep everyone so reachability decides.
  for (const workerId of host.listWorkerIds()) {
    // eslint-disable-next-line no-await-in-loop
    await host.getWorker(workerId).sleep();
  }

  const kept = [parent.workerId, childId].sort();
  t.deepEqual(await host.collectVats(), [orphan.workerId]);
  t.deepEqual(host.listWorkerIds(), kept);
  t.deepEqual(store.listWorkerIds(), kept);

  // The kept graph still works, including the cross-worker link.
  t.is(await E(parentRoot).askChild(), 'from-parent');

  // Unpublishing the only root makes the whole parent-child cycle
  // (parent links child, child links parent) collectible together.
  host.unpublish('parent-cap');
  for (const workerId of host.listWorkerIds()) {
    // eslint-disable-next-line no-await-in-loop
    await host.getWorker(workerId).sleep();
  }
  t.deepEqual(await host.collectVats(), kept);
  t.deepEqual(host.listWorkerIds(), []);
  t.deepEqual(store.listWorkerIds(), []);
});

test('retire rejects live presences and deletes durable state', async t => {
  const store = makeMemoryStore();
  const engine = makeJournalReplayEngine();
  const host = await makeSiestaHost({ store, engine });

  const worker = await host.createWorker({ debugLabel: 'counter' });
  const counter = await worker.evaluate(COUNTER_SOURCE);
  t.is(await E(counter).incr(), 1);
  const secret = await worker.publish(counter);

  await worker.retire();
  t.deepEqual(host.listWorkerIds(), []);
  t.deepEqual(store.listWorkerIds(), []);
  t.is(host.locator.get(secret), undefined, 'publication dropped');
  await t.throwsAsync(() => E(counter).incr(), {
    message: /retired/,
  });
});

test('retired links tombstone across host restarts', async t => {
  const store = makeMemoryStore();
  const engine = makeJournalReplayEngine();

  /** @type {string} */
  let parentId;
  {
    const host = await makeSiestaHost({ store, engine });
    const parent = await host.createWorker({ debugLabel: 'parent' });
    parentId = parent.workerId;
    const controller = host.makeResource('worker-controller');
    const parentRoot = await parent.evaluate(
      PARENT_SOURCE,
      ['controller'],
      [controller],
    );
    await E(parentRoot).setup();
    await parent.publish(parentRoot, 'parent-cap');
    const childId = /** @type {string} */ (
      host.listWorkerIds().find(id => id !== parentId)
    );
    await host.getWorker(childId).retire();
    t.regex(
      String(await E(parentRoot).askChild()),
      /^failed: /,
      'the live link rejects after retirement',
    );
    await host.shutdown();
  }

  {
    const host = await makeSiestaHost({ store, engine });
    t.deepEqual(host.listWorkerIds(), [parentId]);
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
  const alice = await host.createWorker({ debugLabel: 'alice' });
  const bob = await host.createWorker({ debugLabel: 'bob' });
  await alice.evaluate(COUNTER_SOURCE);
  await bob.evaluate(COUNTER_SOURCE);
  await alice.sleep();
  await bob.sleep();

  await alice.retire();
  t.deepEqual(released, [], 'bob still uses the shared ref');
  await bob.retire();
  t.deepEqual(released, ['shared-hash'], 'the last user releases it');
});
