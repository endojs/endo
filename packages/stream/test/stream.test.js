// @ts-check
import test from '@endo/ses-ava/prepare-endo.js';

import { makePipe } from '../index.js';

test('stream', async (/** @type {import('ava').Assertions} */ t) => {
  const [consumeFrom, produceTo] = makePipe();

  const order = [10, 20, 30];

  const makeProducer = async () => {
    await null;
    for (const expected of order) {
      // eslint-disable-next-line no-await-in-loop
      const { done, value: actual } = await produceTo.next(expected);
      t.is(done, false);
      t.is(actual, expected);
    }
    const { done, value: actual } = await produceTo.return('.');
    t.is(done, true);
    t.is(actual, '!');
  };

  const makeConsumer = async () => {
    await null;
    for (const expected of order) {
      // eslint-disable-next-line no-await-in-loop
      const { done, value: actual } = await consumeFrom.next(expected);
      t.is(done, false);
      t.is(expected, actual);
    }
    const { done, value: actual } = await consumeFrom.return('!');
    t.is(done, true);
    t.is(actual, '.');
  };

  await Promise.all([makeProducer(), makeConsumer()]);
});

test('stream terminated with cause', async (/** @type {import('ava').Assertions} */ t) => {
  const [consumeFrom, produceTo] = makePipe();

  const makeProducer = async () => {
    await produceTo.throw(Error('Exit early'));
  };

  const makeConsumer = async () => {
    await null;
    try {
      for await (const _ of consumeFrom) {
        t.fail();
      }
    } catch (error) {
      t.is(error.message, 'Exit early');
    }
  };

  await Promise.all([makeProducer(), makeConsumer()]);
});
