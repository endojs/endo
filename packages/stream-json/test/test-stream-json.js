// @ts-check

import 'ses';
import './lockdown.js';

import rawTest from 'ava';
import { wrapTest } from '@endo/ses-ava';

import { makePipe } from '@endo/stream';
import { makeJsonReader, makeJsonWriter } from '../index.js';

const test = wrapTest(rawTest);

test('stream JSON', async t => {
  const [consumeBytesFrom, produceBytesTo] = makePipe();
  const consumeFrom = makeJsonReader(consumeBytesFrom);
  const produceTo = makeJsonWriter(produceBytesTo);

  const order = [
    null,
    10,
    1 / 3,
    'hi',
    true,
    false,
    [],
    {},
    [null, 10, 1 / 3, 'hi', true, false, [], {}],
    { a: null, b: 10, c: 1 / 3, d: 'hi', e: true, f: false, g: [], h: {} },
  ];

  const makeProducer = async () => {
    for (const value of order) {
      // eslint-disable-next-line no-await-in-loop
      const { done, value: actual } = await produceTo.next(value);
      t.is(done, false);
      t.is(actual, undefined);
    }
    const { done, value: actual } = await produceTo.return('.');
    t.is(done, true);
    t.is(actual, undefined);
  };

  const makeConsumer = async () => {
    for (const expected of order) {
      // eslint-disable-next-line no-await-in-loop
      const { done, value: actual } = await consumeFrom.next(expected);
      t.is(done, false);
      t.deepEqual(expected, actual);
    }
    const { done, value: actual } = await consumeFrom.return();
    t.is(done, true);
    t.is(actual, undefined);
  };

  await Promise.all([makeProducer(), makeConsumer()]);
});

test('JSON stream terminated with cause', async t => {
  const [consumeBytesFrom, produceBytesTo] = makePipe();
  const consumeFrom = makeJsonReader(consumeBytesFrom);
  const produceTo = makeJsonWriter(produceBytesTo);

  const makeProducer = async () => {
    await produceTo.throw(new Error('Exit early'));
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
