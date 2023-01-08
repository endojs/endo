// @ts-check
/* eslint-disable no-await-in-loop */

import '@endo/init/debug.js';

import rawTest from 'ava';
import { wrapTest } from '@endo/ses-ava';
import { makePromiseKit } from '@endo/promise-kit';
import { makeTopic } from '../index.js';

const test = wrapTest(rawTest);

test('topic supports parallel subscriptions', async (/** @type {import('ava').Assertions} */ t) => {
  const { publisher, subscribe } = makeTopic();

  // Coordinated checkpoints.
  const [a, b, c, d, e, f, g] = (function* generatePromiseKits() {
    for (;;) yield makePromiseKit();
  })();

  await Promise.all([
    (async () => {
      // This await ensures that the synchronous portion of the first, full
      // subscription obtains a subscriber before it yields to the event loop
      // the first time.
      await null;
      await publisher.next(1);
      a.resolve();

      await b.promise;
      await publisher.next(2);
      c.resolve();

      await Promise.all([d.promise, e.promise]);
      await publisher.next(3);

      await publisher.next(4);
      f.resolve();

      await g.promise;
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
      await a.promise;
      const subscription = subscribe();
      b.resolve();

      let expected = 2;
      for await (const actual of subscription) {
        t.is(actual, expected);
        expected += 1;
      }
      t.is(expected, 5);
    })(),

    // Further delayed subscriber.
    (async () => {
      await c.promise;
      const subscription = subscribe();
      d.resolve();

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
      await c.promise;
      const subscription = subscribe();
      e.resolve();

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
      await f.promise;
      const subscription = subscribe();
      g.resolve();

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

test('topic terminates with error', async (/** @type {import('ava').Assertions} */ t) => {
  const { publisher, subscribe } = makeTopic();

  const subscription = subscribe();

  await publisher.throw(new TypeError('sentinel'));

  await t.throwsAsync(() => subscription.next(), {
    instanceOf: TypeError,
    message: 'sentinel',
  });
});
