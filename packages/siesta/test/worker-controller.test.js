// @ts-check
import test from '@endo/ses-ava/test.js';

import { E } from '@endo/eventual-send';

import { makeSiestaHost } from '../src/host.js';
import { makeJournalReplayEngine } from '../src/journal-replay-engine.js';
import { makeMemoryStore } from '../src/store-fs.js';

const PARENT_SOURCE = `
(() => {
  let childRoot;
  const shared = Far('Shared', {
    secret: () => 'from-parent',
  });
  return Far('Parent', {
    setup: async () => {
      const child = await E(controller).provideWorker('child');
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

  {
    const host = await makeSiestaHost({ store, engine });
    const parent = await host.provideWorker('parent');
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
    t.deepEqual(host.listWorkerNames(), ['child', 'parent']);

    const child = await host.provideWorker('child');
    await child.publish(childRoot, 'child-cap');
    await host.shutdown();
  }

  {
    // Cross-worker links survive the host restart: the child's session
    // records the parent-origin endowment as "import slot S of worker
    // parent" in its export table, and both workers stay asleep until
    // the pull arrives.
    const host = await makeSiestaHost({ store, engine });
    const parent = await host.provideWorker('parent');
    const child = await host.provideWorker('child');
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

test('controller and facades are durable resources', async t => {
  const store = makeMemoryStore();
  const engine = makeJournalReplayEngine();

  {
    const host = await makeSiestaHost({ store, engine });
    const parent = await host.provideWorker('parent');
    const controller = host.makeResource('worker-controller');
    const parentRoot = await parent.evaluate(
      `
      (() => {
        let facade;
        return Far('Keeper', {
          keep: async () => {
            facade = await E(controller).provideWorker('kept');
            return E(facade).getName();
          },
          useKept: () => E(facade).evaluate('21 * 2'),
        });
      })()
      `,
      ['controller'],
      [controller],
    );
    t.is(await E(parentRoot).keep(), 'kept');
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
