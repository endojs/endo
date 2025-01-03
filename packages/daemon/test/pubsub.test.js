// @ts-nocheck
/* eslint-disable no-await-in-loop */

import test from '@endo/ses-ava/prepare-endo.js';

import { makePromiseKit } from '@endo/promise-kit';
import { makeChangeTopic } from '../src/pubsub.js';

test('change topic supports parallel subscriptions', async (/** @type {import('ava').Assertions} */ t) => {
  const { publisher, subscribe } = makeChangeTopic();

  // Coordinated checkpoints.
  const [p1, p2, p4, s1, s2, s3, s4] = (function* generatePromiseKits() {
    for (;;) yield makePromiseKit();
  })();

  await Promise.all([
    (async () => {
      // This await ensures that the synchronous portion of the first, full
      // subscription obtains a subscriber before it yields to the event loop
      // the first time.
      await null;
      await publisher.next(1);
      p1.resolve();

      await s1.promise;
      await publisher.next(2);
      p2.resolve();

      await Promise.all([s2.promise, s3.promise]);
      await publisher.next(3);

      await publisher.next(4);
      p4.resolve();

      await s4.promise;
      await publisher.return('EOL');
    })(),

    // Full subscription.
    (async () => {
      let expected = 1;
      const subscription = subscribe();
      for await (const actual of subscription) {
        t.is(actual, expected);
        expected += 1;
      }
      t.is(expected, 5);
    })(),

    // Delayed subscriber.
    (async () => {
      await p1.promise;
      const subscription = subscribe();
      s1.resolve();

      let expected = 2;
      for await (const actual of subscription) {
        t.is(actual, expected);
        expected += 1;
      }
      t.is(expected, 5);
    })(),

    // Further delayed subscriber.
    (async () => {
      await p2.promise;
      const subscription = subscribe();
      s2.resolve();

      let expected = 3;
      for await (const actual of subscription) {
        t.is(actual, expected);
        expected += 1;
      }
      t.is(expected, 5);
    })(),

    // Same subscription timing as previous, but using the iterator protocol to
    // see the final value.
    (async () => {
      await p2.promise;
      const subscription = subscribe();
      s3.resolve();

      let expected = 3;
      for (;;) {
        const iteratorResult = await subscription.next();
        if (iteratorResult.done) {
          t.is(iteratorResult.value, 'EOL');
          break;
        }
        t.is(iteratorResult.value, expected);
        expected += 1;
      }
    })(),

    // Observe the completion value by dint of yield*.
    (async () => {
      await p4.promise;
      const subscription = subscribe();
      s4.resolve();

      const generator = (async function* consumer() {
        return yield* subscription;
      })();
      const { value, done } = await generator.next();
      t.is(done, true);
      t.is(value, 'EOL');
    })(),
  ]);

  t.pass();
});

test('change topic terminates with error', async (/** @type {import('ava').Assertions} */ t) => {
  const { publisher, subscribe } = makeChangeTopic();

  const subscription = subscribe();

  await publisher.throw(new TypeError('sentinel'));

  await t.throwsAsync(() => subscription.next(), {
    instanceOf: TypeError,
    message: 'sentinel',
  });
});
