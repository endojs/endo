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

const readChunkedMessage = async (t, chunkStrings, expectedDataStrings) => {
  const r = makeNetstringReader(
    chunkStrings.map(chunkString => encoder.encode(chunkString)),
    {
      name: '<unknown>',
    },
  );
  const array = await read(r);
  t.deepEqual(
    expectedDataStrings,
    array.map(chunk => decoder.decode(chunk)),
  );
};

test('read short messages', readChunkedMessage, ['0:,1:A,'], ['', 'A']);
test(
  'read short messages with data divided over chunk boundaries',
  readChunkedMessage,
  ['0:', ',', '1:A', ','],
  ['', 'A'],
);

test(
  'read a message in single chunk',
  readChunkedMessage,
  ['5:hello,'],
  ['hello'],
);
test(
  'read a message with data in separate chunk',
  readChunkedMessage,
  ['5:', 'hello,'],
  ['hello'],
);
test(
  'read a message with data divided over a chunk boundary',
  readChunkedMessage,
  ['5:hel', 'lo,'],
  ['hello'],
);

test(
  'read messages divided over chunk boundaries',
  readChunkedMessage,
  ['5:hello', ',5:world,8:good ', 'bye,'],
  ['hello', 'world', 'good bye'],
);

test(
  'read prefix colon divided over chunk boundary',
  readChunkedMessage,
  ['0', ':,', '1', ':A,'],
  ['', 'A'],
);

test(
  'read length prefix divided over chunk boundaries',
  readChunkedMessage,
  ['1', '1:hello world,'],
  ['hello world'],
);

const readErroneousChunkedMessage = async (t, chunkStrings, opts) => {
  const r = makeNetstringReader(
    chunkStrings.map(chunkString => encoder.encode(chunkString)),
    opts,
  );
  return t.throwsAsync(() => read(r));
};

test('fails reading invalid prefix', readErroneousChunkedMessage, ['1.0:A,']);
test('fails reading incomplete data', readErroneousChunkedMessage, ['5:hello']);
test('fails reading invalid separator', readErroneousChunkedMessage, ['0:~']);
test('fails reading no colon', readErroneousChunkedMessage, ['1A,']);
test('fails reading empty prefix before colon', readErroneousChunkedMessage, [
  ':,',
]);

test(
  'fails reading too long prefix',
  readErroneousChunkedMessage,
  ['11:hello world,'],
  { maxMessageLength: 9 },
);
test(
  'fails reading if message length over max ',
  readErroneousChunkedMessage,
  ['11:hello world,'],
  { maxMessageLength: 10 },
);

function delay(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

const makeArrayWriter = opts => {
  const array = [];
  const writer = makeNetstringWriter(
    {
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
    },
    opts,
  );
  return { array, writer };
};

const shortMessages = async (t, opts) => {
  const { array, writer } = makeArrayWriter(opts);
  await writer.next(encoder.encode(''));
  await writer.next(encoder.encode('A'));
  await writer.next(encoder.encode('hello'));
  await writer.return();

  t.deepEqual(
    [encoder.encode(''), encoder.encode('A'), encoder.encode('hello')],
    await read(makeNetstringReader(array)),
  );
};
test('round-trip short messages', shortMessages);
test('round-trip short messages (chunked)', shortMessages, { chunked: true });

const concurrentWrites = async (t, opts) => {
  const { array, writer } = makeArrayWriter(opts);
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
};
test('concurrent writes', concurrentWrites);
test('concurrent writes (chunked)', concurrentWrites, { chunked: true });

const chunkedWrite = async (t, opts) => {
  const { array, writer } = makeArrayWriter(opts);
  const strChunks = ['hello', ' ', 'world'];
  await writer.next(strChunks.map(strChunk => encoder.encode(strChunk)));
  await writer.return();

  t.deepEqual(
    [encoder.encode(strChunks.join(''))],
    await read(makeNetstringReader(array)),
  );
};
test('chunked write', chunkedWrite);
test('chunked write (chunked)', chunkedWrite, { chunked: true });

const varyingMessages = async (t, opts) => {
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
    const w = makeNetstringWriter(output, opts);
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
};
test('round-trip varying messages', varyingMessages);
test('round-trip varying messages (chunked)', varyingMessages, {
  chunked: true,
});
