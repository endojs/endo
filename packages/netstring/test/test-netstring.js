/* global setTimeout */
// @ts-check

import '@endo/init/debug.js';

import test from 'ava';
import { makePipe } from '@endo/stream';
import { makeNetstringReader } from '../reader.js';
import { makeNetstringWriter } from '../writer.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function read(source) {
  const array = [];
  for await (const chunk of source) {
    // Capture current state, allocating a copy.
    array.push(chunk.slice());
  }
  return array;
}

test('read short messages', async t => {
  const r = makeNetstringReader([encoder.encode('0:,1:A,')], {
    name: '<unknown>',
    capacity: 1,
  });
  const array = await read(r);
  t.deepEqual(
    ['', 'A'],
    array.map(chunk => decoder.decode(chunk)),
  );
});

test('read a message divided over a chunk boundary', async t => {
  const r = makeNetstringReader(
    [encoder.encode('5:hel'), encoder.encode('lo,')],
    {
      name: '<unknown>',
      capacity: 1,
    },
  );
  const array = await read(r);
  t.deepEqual(
    ['hello'],
    array.map(chunk => decoder.decode(chunk)),
  );
});

test('read messages divided over chunk boundaries', async t => {
  const r = makeNetstringReader(
    [
      encoder.encode('5:hel'),
      encoder.encode('lo,5:world,8:good '),
      encoder.encode('bye,'),
    ],
    {
      name: '<unknown>',
      capacity: 1,
    },
  );
  const array = await read(r);
  t.deepEqual(
    ['hello', 'world', 'good bye'],
    array.map(chunk => decoder.decode(chunk)),
  );
});

function delay(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

const makeArrayWriter = () => {
  const array = [];
  const writer = makeNetstringWriter({
    async next(value) {
      // Provide some back pressure to give the producer an opportunity to make
      // the mistake of overwriting the given slice.
      await delay(10);
      // slice to capture before yielding.
      array.push(value.slice());
      return { done: false };
    },
    async return() {
      return { done: true };
    },
    async throw() {
      return { done: true };
    },
  });
  return { array, writer };
};

test('round-trip short messages', async t => {
  const { array, writer } = makeArrayWriter();
  await writer.next(encoder.encode(''));
  await writer.next(encoder.encode('A'));
  await writer.next(encoder.encode('hello'));
  await writer.return();

  t.deepEqual(
    [encoder.encode(''), encoder.encode('A'), encoder.encode('hello')],
    await read(makeNetstringReader(array)),
  );
});

test('concurrent writes', async t => {
  const { array, writer } = makeArrayWriter();
  await Promise.all([
    writer.next(encoder.encode('')),
    writer.next(encoder.encode('A')),
    writer.next(encoder.encode('hello')),
    writer.return(),
  ]);

  t.deepEqual(
    [encoder.encode(''), encoder.encode('A'), encoder.encode('hello')],
    await read(makeNetstringReader(array)),
  );
});

test('round-trip varying messages', async t => {
  const array = ['', 'A', 'hello'];

  for (let i = 1020; i < 1030; i += 1) {
    array.push(new Array(i).fill(':').join(''));
  }
  for (let i = 2040; i < 2050; i += 1) {
    array.push(new Array(i).fill(':').join(''));
  }

  t.plan(array.length);

  const [input, output] = makePipe();

  const producer = (async () => {
    /** @type {import('@endo/stream').Writer<Uint8Array, undefined>} */
    const w = makeNetstringWriter(output);
    for (let i = 0; i < array.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await w.next(encoder.encode(array[i]));
      // eslint-disable-next-line no-await-in-loop
      await delay(10);
    }
    await w.return();
  })();

  const consumer = (async () => {
    /** @type {import('@endo/stream').Reader<Uint8Array, undefined>} */
    const r = makeNetstringReader(input);
    let i = 0;
    for await (const message of r) {
      await delay(10);
      t.is(array[i], decoder.decode(message));
      i += 1;
    }
    t.log('end');
  })();

  await Promise.all([producer, consumer]);
});
