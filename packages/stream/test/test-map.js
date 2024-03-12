// @ts-check
import test from '@endo/ses-ava/prepare-endo.js';

import { mapReader, mapWriter, makePipe } from '../index.js';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

test('map reader', async (/** @type {import('ava').Assertions} */ t) => {
  const [consumeBytesFrom, produceBytesTo] = makePipe();
  const consumeFrom = mapReader(
    consumeBytesFrom,
    (/** @type {Uint8Array} */ bytes) => textDecoder.decode(bytes),
  );
  const produceTo = mapWriter(produceBytesTo, (/** @type {string} */ text) =>
    textEncoder.encode(text),
  );

  const order = ['', 'Hello, World!', '\x00', '😇   '];

  const makeProducer = async () => {
    for (const value of order) {
      // eslint-disable-next-line no-await-in-loop
      const { done, value: actual } = await produceTo.next(value);
      t.is(done, false);
      t.is(actual, undefined);
    }
    const { done, value: actual } = await produceTo.return();
    t.is(done, true);
    t.is(actual, undefined);
  };

  const makeConsumer = async () => {
    for (const expected of order) {
      // eslint-disable-next-line no-await-in-loop
      const { done, value: actual } = await consumeFrom.next(undefined);
      t.is(done, false);
      t.deepEqual(expected, actual);
    }
    const { done, value: actual } = await consumeFrom.return();
    t.is(done, true);
    t.is(actual, undefined);
  };

  await Promise.all([makeProducer(), makeConsumer()]);
});

test('transcoding stream terminated with cause', async (/** @type {import('ava').Assertions} */ t) => {
  const [consumeStringsFrom, produceStringsTo] = makePipe();
  const consumeFrom = mapReader(
    consumeStringsFrom,
    (/** @type {Uint8Array} */ bytes) => textDecoder.decode(bytes),
  );
  const produceTo = mapWriter(produceStringsTo, (/** @type {string} */ text) =>
    textEncoder.encode(text),
  );

  const makeProducer = async () => {
    await produceTo.throw(Error('Exit early'));
  };

  const makeConsumer = async () => {
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
