// @ts-check
/* global setTimeout */
import test from '@endo/ses-ava/test.js';

import { E } from '@endo/eventual-send';
import { Far } from '@endo/far';

import { makeSiestaHost } from '../src/host.js';
import {
  makeJournalReplayEngine,
  makeSnapshottingReplayEngine,
} from '../src/journal-replay-engine.js';
import { makeTimerResource } from '../src/resources.js';
import { makeMemoryStore } from '../src/store-fs.js';

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

const CLOCK_SOURCE = `
(() => {
  let readings = [];
  return Far('Clock', {
    read: async () => {
      const reading = await E(timer).now();
      readings.push(reading);
      return reading;
    },
    getReadings: () => harden([...readings]),
  });
})()
`;

test('granted resources survive host restarts at the same slot', async t => {
  const store = makeMemoryStore();
  const engine = makeJournalReplayEngine();
  const resources = { timer: makeTimerResource };

  /** @type {number} */
  let firstReading;
  {
    const host = await makeSiestaHost({ store, engine, resources });
    const worker = await host.provideWorker('clock');
    const timer = host.makeResource('timer');
    const clock = await worker.evaluate(CLOCK_SOURCE, ['timer'], [timer]);
    firstReading = /** @type {number} */ (await E(clock).read());
    t.is(typeof firstReading, 'number');
    await worker.publish(clock, 'clock-cap');
    await host.shutdown();
  }

  {
    const host = await makeSiestaHost({ store, engine, resources });
    const clock = host.locator.get('clock-cap');

    // Journaled nondeterminism: replay reproduces the recorded reading
    // rather than consulting the clock again.
    t.deepEqual(await E(clock).getReadings(), [firstReading]);

    // The re-instantiated export serves new calls at the old slot: the
    // timer presence inside the worker's restored state still works.
    const secondReading = /** @type {number} */ (await E(clock).read());
    t.is(typeof secondReading, 'number');
    t.true(secondReading >= firstReading);
    t.deepEqual(await E(clock).getReadings(), [firstReading, secondReading]);
    await host.shutdown();
  }
});

test('restart without the resource maker fails loudly', async t => {
  const store = makeMemoryStore();
  const engine = makeJournalReplayEngine();

  {
    const host = await makeSiestaHost({
      store,
      engine,
      resources: { timer: makeTimerResource },
    });
    const worker = await host.provideWorker('clock');
    const timer = host.makeResource('timer');
    await worker.evaluate(CLOCK_SOURCE, ['timer'], [timer]);
    await host.shutdown();
  }

  await t.throwsAsync(() => makeSiestaHost({ store, engine }), {
    message: /No resource maker registered for type "timer"/,
  });
});

test('worker-to-host requests pending across a host crash reject instead of hanging', async t => {
  const store = makeMemoryStore();
  const engine = makeJournalReplayEngine();
  // A host resource whose answer never comes: the guest's promise can
  // only settle through the at-most-once abort on restart.
  const resources = {
    gate: () =>
      Far('Gate', {
        wait: async () => new Promise(() => {}),
      }),
  };

  {
    const host = await makeSiestaHost({ store, engine, resources });
    const worker = await host.provideWorker('waiter');
    const gate = host.makeResource('gate');
    const waiter = await worker.evaluate(
      `
      (() => {
        let failure = null;
        E(gate)
          .wait()
          .catch(reason => {
            failure = String((reason && reason.message) || reason);
          });
        return Far('Waiter', {
          getFailure: () => failure,
        });
      })()
      `,
      ['gate'],
      [gate],
    );
    t.is(await E(waiter).getFailure(), null, 'the request is outstanding');
    await worker.publish(waiter, 'waiter-cap');
    // Crash: drop the host without shutdown. The gate's answer dies
    // with host memory; only the recorded question ID survives.
  }

  {
    const host = await makeSiestaHost({ store, engine, resources });
    const waiter = host.locator.get('waiter-cap');
    t.regex(
      String(await E(waiter).getFailure()),
      /host restarted/,
      'the guest promise rejected instead of hanging',
    );
    await host.shutdown();
  }
});

test('a pending timer wakes a sleeping worker', async t => {
  const store = makeMemoryStore();
  const engine = makeSnapshottingReplayEngine();
  const resources = { timer: makeTimerResource };

  const host = await makeSiestaHost({ store, engine, resources });
  const worker = await host.provideWorker('waiter');
  const timer = host.makeResource('timer');
  const waiter = await worker.evaluate(
    `
    (() => {
      let wakes = 0;
      return Far('Waiter', {
        arm: ms => {
          E(timer).delay(ms).then(() => {
            wakes += 1;
          });
          return 'armed';
        },
        getWakes: () => wakes,
      });
    })()
    `,
    ['timer'],
    [timer],
  );

  t.is(await E(waiter).arm(60), 'armed');
  await worker.sleep();
  t.false(worker.isAwake());

  // The timer's resolution routes through the worker's session and
  // transparently wakes it, with no inbound traffic from anyone.
  await tickUntil(() => worker.isAwake());
  t.is(await E(waiter).getWakes(), 1);
  await host.shutdown();
});
