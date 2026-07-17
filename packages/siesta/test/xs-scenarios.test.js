// @ts-check
/* global process, setTimeout */

/**
 * End-to-end scenario parity on the real XS engine: the machine's
 * distinguishing behaviors — cross-worker links and promises across
 * host restarts, at-most-once aborts after a host crash, and vat GC
 * with content-addressed snapshot release — exercised against
 * `siesta-xs-worker` heap snapshots rather than the internal replay
 * doubles. Requires the same built artifacts as xs-engine.test.js and
 * skips itself when they are absent.
 */
import test from '@endo/ses-ava/test.js';

import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { E } from '@endo/eventual-send';
import { Far } from '@endo/far';

import { makeSiestaHost } from '../src/host.js';
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
    'xs-scenarios tests skipped: build siesta-xs-worker and dist-xs first',
  );
}

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

/** @param {import('ava').ExecutionContext} t */
const makeKit = async t => {
  const statePath = await mkdtemp(join(tmpdir(), 'siesta-xs-scenario-'));
  t.teardown(() => rm(statePath, { recursive: true, force: true }));
  const casPath = join(statePath, 'cas');
  const engine = makeXsEngine({
    workerBinary,
    bootPath,
    bundlePath,
    casPath,
  });
  return { statePath, casPath, engine };
};

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

testXs('XS cross-worker links survive a host restart asleep', async t => {
  const { statePath, engine } = await makeKit(t);

  {
    const host = await makeSiestaHost({
      store: makeFsStore(statePath),
      engine,
    });
    const parent = await host.createWorker({ debugLabel: 'parent' });
    const controller = host.makeResource('worker-controller');
    const parentRoot = await parent.evaluate(
      PARENT_SOURCE,
      ['controller'],
      [controller],
    );
    const childRoot = await E(parentRoot).setup();
    t.deepEqual(await E(childRoot).pull(), [1, 'from-parent']);
    const childId = /** @type {string} */ (
      host.listWorkerIds().find(id => id !== parent.workerId)
    );
    await host.getWorker(childId).publish(childRoot, 'child-cap');
    await host.shutdown();
  }

  {
    const host = await makeSiestaHost({
      store: makeFsStore(statePath),
      engine,
    });
    for (const workerId of host.listWorkerIds()) {
      t.false(host.getWorker(workerId).isAwake(), 'restored asleep');
    }
    const childRoot = host.locator.get('child-cap');
    t.deepEqual(
      await E(childRoot).pull(),
      [2, 'from-parent'],
      'the pull woke the child from its XS snapshot and crossed to the parent',
    );
    await host.shutdown();
  }
});

testXs('XS cross-worker promise survives a host restart', async t => {
  const { statePath, engine } = await makeKit(t);

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
    const host = await makeSiestaHost({
      store: makeFsStore(statePath),
      engine,
    });
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
    await host.getWorker(childId).publish(childRoot, 'promise-child');
    await parent.publish(parentRoot, 'promise-parent');
    await host.shutdown();
  }

  {
    const host = await makeSiestaHost({
      store: makeFsStore(statePath),
      engine,
    });
    const childRoot = host.locator.get('promise-child');
    t.is(
      await E(childRoot).getGot(),
      null,
      'the pending cross-worker promise was NOT aborted by the restart',
    );
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

testXs('XS at-most-once: a crashed host aborts pending requests', async t => {
  const { statePath, engine } = await makeKit(t);
  /** @type {Array<unknown>} */
  const notes = [];
  const resources = {
    gate: () =>
      Far('Gate', {
        wait: async () => new Promise(() => {}),
      }),
    echo: () =>
      Far('Echo', {
        note: value => {
          notes.push(value);
        },
      }),
  };

  {
    const host = await makeSiestaHost({
      store: makeFsStore(statePath),
      engine,
      resources,
    });
    const worker = await host.createWorker({ debugLabel: 'waiter' });
    const gate = host.makeResource('gate');
    const echo = host.makeResource('echo');
    const waiter = await worker.evaluate(
      `
      (() => {
        let failure = null;
        E(gate)
          .wait()
          .catch(reason => {
            failure = String((reason && reason.message) || reason);
            E(echo).note('saw-abort');
          });
        return Far('Waiter', {
          getFailure: () => failure,
        });
      })()
      `,
      ['gate', 'echo'],
      [gate, echo],
    );
    t.is(await E(waiter).getFailure(), null, 'the request is outstanding');
    await worker.publish(waiter, 'waiter-cap');
    // Crash: drop the host without shutdown. The gate's answer dies
    // with host memory; only the recorded question ID survives.
  }

  {
    const host = await makeSiestaHost({
      store: makeFsStore(statePath),
      engine,
      resources,
    });
    const waiter = host.locator.get('waiter-cap');
    t.regex(
      String(await E(waiter).getFailure()),
      /host restarted/,
      'the guest promise rejected instead of hanging',
    );
    await tickUntil(() => notes.includes('saw-abort'));
    t.true(
      notes.includes('saw-abort'),
      "the guest's reaction to the abort reached the host",
    );
    await host.shutdown();
  }
});

testXs('XS vat GC sweeps orphans and releases their snapshots', async t => {
  const { statePath, casPath, engine } = await makeKit(t);
  const host = await makeSiestaHost({
    store: makeFsStore(statePath),
    engine,
  });

  const keeper = await host.createWorker({ debugLabel: 'keeper' });
  const kept = await keeper.evaluate(`Far('Kept', { ping: () => 'pong' })`);
  await keeper.publish(kept, 'kept-cap');

  const orphan = await host.createWorker({ debugLabel: 'orphan' });
  await orphan.evaluate(`Far('Orphan', { hi: () => 'hi' })`);

  for (const workerId of host.listWorkerIds()) {
    // eslint-disable-next-line no-await-in-loop
    await host.getWorker(workerId).sleep();
  }
  const orphanRef = String(
    makeFsStore(statePath).provideWorkerStore(orphan.workerId).getMeta()
      .snapshot?.ref,
  );
  t.true(existsSync(join(casPath, orphanRef)), 'orphan snapshot in the CAS');

  t.deepEqual(await host.collectVats(), [orphan.workerId]);
  t.deepEqual(host.listWorkerIds(), [keeper.workerId]);
  t.false(
    existsSync(join(casPath, orphanRef)),
    'the swept vat released its content-addressed snapshot',
  );

  t.is(await E(host.locator.get('kept-cap')).ping(), 'pong');

  // Retirement as a capability also releases the snapshot.
  await host.getWorker(keeper.workerId).retire();
  t.deepEqual(host.listWorkerIds(), []);
  await t.throwsAsync(() => E(kept).ping(), { message: /retired/ });
});
