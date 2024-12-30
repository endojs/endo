// @ts-nocheck
/* global setTimeout */
import test from '@endo/ses-ava/prepare-endo.js';

import { makePipe } from '@endo/stream';
import { makeLp32Reader } from '../reader.js';
import { makeLp32Writer } from '../writer.js';
import { hostIsLittleEndian } from '../src/host-endian.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * @param {import('@endo/stream').Stream<T, U, V>} reader
 */
async function arrayFromAsync(reader) {
  const array = [];
  for await (const chunk of reader) {
    // Capture current state, allocating a copy.
    array.push(chunk.slice());
  }
  return array;
}

test('read null message', async t => {
  const r = makeLp32Reader([new Uint8Array([0, 0, 0, 0])], {
    capacity: 1,
  });
  const array = await arrayFromAsync(r);
  t.deepEqual(
    [''],
    array.map(chunk => decoder.decode(chunk)),
  );
});

test('read null message across chunk boundary', async t => {
  const r = makeLp32Reader([new Uint8Array([0, 0, 0]), new Uint8Array([0])], {
    capacity: 1,
  });
  const array = await arrayFromAsync(r);
  t.deepEqual(
    [''],
    array.map(chunk => decoder.decode(chunk)),
  );
});

test('read messags of varying length at arbitrary chunk boundaries', async t => {
  const order = [];

  // Create a template of data to put in each message, as sequential numbers.
  const template = new Uint8Array(10);
  for (let i = 0; i < 10; i += 1) {
    template[i] = i + 1;
  }

  // Measure out how long the whole stream will be.
  let totalLength = 0;
  for (let i = 0; i < 100; i += 1) {
    const length = i % 10;
    totalLength += 4 + length;
  }

  // Construct a scratch space of expected byte sequence of the entire stream.
  const scratch = new Uint8Array(totalLength);
  const data = new DataView(scratch.buffer);
  {
    let offset = 0;
    for (let i = 0; i < 100; i += 1) {
      const length = i % 10;
      data.setUint32(offset, length, hostIsLittleEndian);
      offset += 4;
      const message = scratch.subarray(offset, offset + length);
      message.set(template.subarray(0, length));
      order.push(message.slice());
      offset += length;
    }
  }

  // Cut chunks along entirely different boundaries.
  // Specifically Fibonacci lengths.
  const chunks = [];
  {
    let offset = 0;
    for (let i = 1, j = 1; offset < totalLength; [i, j] = [j, j + i]) {
      const length = Math.min(i, totalLength - offset);
      chunks.push(scratch.slice(offset, offset + length));
      offset += length;
    }
  }

  const totalChunkLength = chunks.reduce(
    (length, chunk) => length + chunk.length,
    0,
  );
  t.is(totalChunkLength, totalLength);

  const r = makeLp32Reader(chunks, {
    capacity: 1,
    name: '<fib-chunks>',
  });
  const array = await arrayFromAsync(r);
  t.deepEqual(order, array);
});

/** @param {number} ms */
function delay(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

const makeArrayWriter = () => {
  const array = [];
  const writer = makeLp32Writer({
    /**
     * @param {Uint8Array} value
     */
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
    await arrayFromAsync(makeLp32Reader(array)),
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
    await arrayFromAsync(makeLp32Reader(array)),
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
    await null;
    /** @type {import('@endo/stream').Writer<Uint8Array, undefined>} */
    const w = makeLp32Writer(output);
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
    const r = makeLp32Reader(input);
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
