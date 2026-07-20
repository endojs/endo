// @ts-check
/* global setTimeout */

/**
 * The unified siesta daemon (protocol unification phase 5): worker
 * lifecycle, built-in worker-controller and worker-facade resources,
 * host resources as endowments, durable publications, and vat-level
 * mark-and-sweep — all over one OCapN client.
 */
import test from '@endo/ses-ava/test.js';

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { E } from '@endo/eventual-send';
import { makeTcpNetLayer } from '@endo/ocapn/netlayer/tcp-testing';
import { syrupCodec } from '@endo/ocapn/syrup';

import { makeSiestaDaemon } from '../src/daemon.js';
import { makePeerJournalReplayEngine } from '../src/peer-replay-engine.js';
import { makeTimerResource } from '../src/resources.js';
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

/** @param {import('ava').ExecutionContext} t */
const makeDaemon = async t => {
  const statePath = await mkdtemp(join(tmpdir(), 'siesta-daemon-test-'));
  t.teardown(() => rm(statePath, { recursive: true, force: true }));
  const daemon = await makeSiestaDaemon({
    store: makeFsStore(statePath),
    engine: makePeerJournalReplayEngine(),
    codec: syrupCodec,
    resources: { timer: makeTimerResource },
    makeNetlayer: ({ handlers, logger }) =>
      makeTcpNetLayer({ handlers, logger }),
  });
  t.teardown(() => daemon.shutdown());
  return daemon;
};

test('workers create workers; vat GC sweeps the unreachable', async t => {
  const daemon = await makeDaemon(t);

  const parent = await daemon.createWorker({ debugLabel: 'parent' });
  const controller = daemon.makeResource('worker-controller');
  const parentRoot = await parent.evaluate(
    `
    (() => {
      let childRoot;
      return Far('Parent', {
        setup: async () => {
          const child = await E(controller).createWorker('child');
          childRoot = await E(child).evaluate(${JSON.stringify(
            COUNTER_SOURCE,
          )});
          return childRoot;
        },
        pull: () => E(childRoot).incr(),
      });
    })()
    `,
    ['controller'],
    [controller],
  );
  const childCounter = await E(parentRoot).setup();
  t.is(await E(parentRoot).pull(), 1, 'the parent drives its child');
  t.is(await E(childCounter).incr(), 2, 'the child capability relayed out');

  const childId = daemon
    .listWorkerIds()
    .find(workerId => workerId !== parent.workerId);
  t.truthy(childId, 'the controller created a second worker');

  // Publish only the child's counter, then sleep everyone: the parent
  // becomes unreachable garbage; the child is rooted by the
  // publication.
  daemon.publish(childCounter, 'child-cap');
  for (const workerId of daemon.listWorkerIds()) {
    // eslint-disable-next-line no-await-in-loop
    await daemon.getWorker(workerId).sleep();
  }
  t.deepEqual(await daemon.collectVats(), [parent.workerId]);
  t.deepEqual(daemon.listWorkerIds(), [childId]);

  t.is(
    await E(await daemon.lookup('child-cap')).incr(),
    3,
    'the surviving vat still serves its publication',
  );

  // Retirement is a capability-shaped end: the worker, its state, and
  // its publications go together.
  await daemon.getWorker(/** @type {string} */ (childId)).retire();
  t.deepEqual(daemon.listWorkerIds(), []);
  await t.throwsAsync(() => daemon.lookup('child-cap'), {
    message: /not found/,
  });
  await t.throwsAsync(() => E(childCounter).incr(), {
    message: /retired/,
  });
});

test('a host resource reaches a guest as an endowment', async t => {
  const daemon = await makeDaemon(t);
  const worker = await daemon.createWorker({ debugLabel: 'clock' });
  const timer = daemon.makeResource('timer');
  const clock = await worker.evaluate(
    `Far('Clock', { read: () => E(timer).now() })`,
    ['timer'],
    [timer],
  );
  t.is(typeof (await E(clock).read()), 'number');

  // The worker sleeps and wakes; the resource endowment still works.
  await worker.sleep();
  t.false(worker.isAwake());
  t.is(typeof (await E(clock).read()), 'number');
  t.true(worker.isAwake());
});

test('an idle worker parks itself and wakes on the next call', async t => {
  t.timeout(10_000);
  const statePath = await mkdtemp(join(tmpdir(), 'siesta-daemon-test-'));
  t.teardown(() => rm(statePath, { recursive: true, force: true }));
  const daemon = await makeSiestaDaemon({
    store: makeFsStore(statePath),
    engine: makePeerJournalReplayEngine(),
    codec: syrupCodec,
    idleSleepMs: 100,
    makeNetlayer: ({ handlers, logger }) =>
      makeTcpNetLayer({ handlers, logger }),
  });
  t.teardown(() => daemon.shutdown());

  const worker = await daemon.createWorker({ debugLabel: 'napper' });
  const counter = await worker.evaluate(COUNTER_SOURCE);
  t.is(await E(counter).incr(), 1);
  t.true(worker.isAwake());

  // Workers run to quiescence after every delivery and have no timer
  // queue, so "no inbound frames for a while" is exact dormancy: the
  // idle policy parks the worker without being asked.
  const deadline = Date.now() + 5000;
  while (worker.isAwake() && Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  t.false(worker.isAwake(), 'the worker parked itself');
  t.is(await E(counter).incr(), 2, 'the next delivery wakes it');
});
