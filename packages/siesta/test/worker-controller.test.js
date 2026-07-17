// @ts-check
/* global setTimeout */
import test from '@endo/ses-ava/test.js';

import { E } from '@endo/eventual-send';

import { makeSiestaHost } from '../src/host.js';
import { makeJournalReplayEngine } from '../src/journal-replay-engine.js';
import { makeMemoryStore } from '../src/store-fs.js';

/** @param {() => boolean} predicate */
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

const PARENT_SOURCE = `
(() => {
  let childRoot;
  const shared = Far('Shared', {
    secret: () => 'from-parent',
  });
  return Far('Parent', {
    setup: async () => {
      const child = await E(controller).createWorker('child');
      childRoot = await E(child).evaluate(
        \`
        (() => {
          let pulls = 0;
          return Far('Child', {
            pull: async () => {
              pulls += 1;
              return [pulls, await E(shared).secret()];
            },
          });
        })()
        \`,
        ['shared'],
        [shared],
      );
      return childRoot;
    },
  });
})()
`;

test('a controlling worker creates a worker with endowments from its own heap', async t => {
  const store = makeMemoryStore();
  const engine = makeJournalReplayEngine();

  /** @type {string} */
  let parentId;
  /** @type {string} */
  let childId;
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
    const childRoot = await E(parentRoot).setup();

    // The child worker exists and its guest holds the parent's endowment:
    // a pull crosses child -> host -> parent and back.
    t.deepEqual(await E(childRoot).pull(), [1, 'from-parent']);
    t.deepEqual(await E(childRoot).pull(), [2, 'from-parent']);
    t.is(host.listWorkerIds().length, 2);
    childId = /** @type {string} */ (
      host.listWorkerIds().find(id => id !== parentId)
    );

    const child = host.getWorker(childId);
    t.is(child.debugLabel, 'child', 'the guest-chosen debug label landed');
    await child.publish(childRoot, 'child-cap');
    await host.shutdown();
  }

  {
    // Cross-worker links survive the host restart: the child's session
    // records the parent-origin endowment as "import slot S of worker
    // <parent id>" in its export table, and both workers stay asleep
    // until the pull arrives.
    const host = await makeSiestaHost({ store, engine });
    const parent = host.getWorker(parentId);
    const child = host.getWorker(childId);
    t.false(parent.isAwake());
    t.false(child.isAwake());

    const childRoot = host.locator.get('child-cap');
    t.deepEqual(
      await E(childRoot).pull(),
      [3, 'from-parent'],
      'child state and the parent link both survived the restart',
    );
    t.true(child.isAwake(), 'the pull woke the child');
    t.true(parent.isAwake(), 'the cross-worker call woke the parent');
    await host.shutdown();
  }
});

test('a cross-worker promise survives a host restart', async t => {
  const store = makeMemoryStore();
  const engine = makeJournalReplayEngine();

  const PROMISE_PARENT_SOURCE = `
  (() => {
    let release = null;
    return Far('Parent', {
      setup: async () => {
        const child = await E(controller).createWorker('child');
        const gift = new Promise(resolve => {
          release = resolve;
        });
        return E(child).evaluate(
          \`
          (() => {
            let got = null;
            gift.then(
              value => {
                got = value;
              },
              reason => {
                got = 'rejected: ' + String((reason && reason.message) || reason);
              },
            );
            return Far('Child', { getGot: () => got });
          })()
          \`,
          ['gift'],
          [gift],
        );
      },
      release: value => {
        release(value);
        return 'released';
      },
    });
  })()
  `;

  {
    const host = await makeSiestaHost({ store, engine });
    const parent = await host.createWorker({ debugLabel: 'parent' });
    const controller = host.makeResource('worker-controller');
    const parentRoot = await parent.evaluate(
      PROMISE_PARENT_SOURCE,
      ['controller'],
      [controller],
    );
    const childRoot = await E(parentRoot).setup();
    t.is(await E(childRoot).getGot(), null, 'the gift is still pending');
    const childId = /** @type {string} */ (
      host.listWorkerIds().find(id => id !== parent.workerId)
    );
    const child = host.getWorker(childId);
    await child.publish(childRoot, 'promise-child');
    await parent.publish(parentRoot, 'promise-parent');
    // Crash without shutdown: the promise link must survive through its
    // durable worker-promise description, not host memory.
  }

  {
    const host = await makeSiestaHost({ store, engine });
    const childRoot = host.locator.get('promise-child');
    t.is(
      await E(childRoot).getGot(),
      null,
      'the pending cross-worker promise was NOT aborted by the restart',
    );

    // The parent resolving after the restart still reaches the child.
    const parentRoot = host.locator.get('promise-parent');
    t.is(await E(parentRoot).release('gifted'), 'released');
    /** @type {any} */
    let got = null;
    await tickUntil(() => {
      E(childRoot)
        .getGot()
        .then(value => {
          got = value;
        });
      return got !== null;
    });
    t.is(got, 'gifted', 'the resolution crossed workers after the restart');
    await host.shutdown();
  }
});

test('controller and facades are durable resources', async t => {
  const store = makeMemoryStore();
  const engine = makeJournalReplayEngine();

  {
    const host = await makeSiestaHost({ store, engine });
    const parent = await host.createWorker({ debugLabel: 'parent' });
    const controller = host.makeResource('worker-controller');
    const parentRoot = await parent.evaluate(
      `
      (() => {
        let facade;
        return Far('Keeper', {
          keep: async () => {
            facade = await E(controller).createWorker('kept');
            return E(facade).getId();
          },
          useKept: () => E(facade).evaluate('21 * 2'),
        });
      })()
      `,
      ['controller'],
      [controller],
    );
    const keptId = await E(parentRoot).keep();
    t.regex(
      String(keptId),
      /^[0-9a-f]{32}$/,
      'the facade names its worker by generated id',
    );
    t.is(await E(parentRoot).useKept(), 42);
    await parent.publish(parentRoot, 'keeper');
    await host.shutdown();
  }

  {
    const host = await makeSiestaHost({ store, engine });
    const keeper = host.locator.get('keeper');
    t.is(
      await E(keeper).useKept(),
      42,
      'the kept worker facade was re-instantiated from its description',
    );
    await host.shutdown();
  }
});
