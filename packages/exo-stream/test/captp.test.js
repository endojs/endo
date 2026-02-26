import test from '@endo/ses-ava/prepare-endo.js';

import { makeLoopback } from '@endo/captp';
import { makePipe } from '@endo/stream';
import { readerFromIterator } from '../reader-from-iterator.js';
import { iterateReader } from '../iterate-reader.js';
import { bytesReaderFromIterator } from '../bytes-reader-from-iterator.js';
import { iterateBytesReader } from '../iterate-bytes-reader.js';
import { writerFromIterator } from '../writer-from-iterator.js';
import { iterateWriter } from '../iterate-writer.js';
import { bytesWriterFromIterator } from '../bytes-writer-from-iterator.js';
import { iterateBytesWriter } from '../iterate-bytes-writer.js';

const writeAll = async (writer, iterable) => {
  for await (const value of iterable) {
    await writer.next(value);
  }
  return writer.return();
};

// Test passable reader over CapTP membrane
test('captp: single-item passable reader', async t => {
  const { makeFar } = makeLoopback('test');

  async function* singleItem() {
    yield harden({ type: 'message', text: 'hello' });
  }

  // Create reader on "remote" side
  const localReader = readerFromIterator(singleItem());
  const remoteReader = await makeFar(localReader);

  // Consume on "local" side through CapTP
  const reader = iterateReader(remoteReader);

  const result1 = await reader.next();
  t.false(result1.done);
  t.deepEqual(result1.value, { type: 'message', text: 'hello' });

  const result2 = await reader.next();
  t.true(result2.done);
});

// Test empty reader over CapTP
test('captp: empty passable reader', async t => {
  const { makeFar } = makeLoopback('test');

  async function* emptyIterator() {
    // yields nothing
  }

  const localReader = readerFromIterator(emptyIterator());
  const remoteReader = await makeFar(localReader);

  const reader = iterateReader(remoteReader);

  const results = [];
  for await (const value of reader) {
    results.push(value);
  }

  t.is(results.length, 0);
});

// Test multi-item reader over CapTP
test('captp: multi-item passable reader', async t => {
  const { makeFar } = makeLoopback('test');

  async function* multiItem() {
    yield harden({ n: 1 });
    yield harden({ n: 2 });
    yield harden({ n: 3 });
  }

  const localReader = readerFromIterator(multiItem());
  const remoteReader = await makeFar(localReader);

  const reader = iterateReader(remoteReader);

  const results = [];
  for await (const value of reader) {
    results.push(value);
  }

  t.deepEqual(results, [{ n: 1 }, { n: 2 }, { n: 3 }]);
});

// Test bytes reader over CapTP
test('captp: bytes reader', async t => {
  const { makeFar } = makeLoopback('test');

  const chunks = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])];

  const localReader = bytesReaderFromIterator(chunks);
  const remoteReader = await makeFar(localReader);

  const reader = await iterateBytesReader(remoteReader);

  const results = [];
  for await (const chunk of reader) {
    results.push(chunk);
  }

  t.is(results.length, 2);
  t.deepEqual(results[0], new Uint8Array([1, 2, 3]));
  t.deepEqual(results[1], new Uint8Array([4, 5, 6]));
});

// Test reader with buffering over CapTP
test('captp: reader with buffer', async t => {
  const { makeFar } = makeLoopback('test');

  async function* items() {
    yield harden({ n: 1 });
    yield harden({ n: 2 });
    yield harden({ n: 3 });
  }

  const localReader = readerFromIterator(items());
  const remoteReader = await makeFar(localReader);

  const reader = iterateReader(remoteReader, { buffer: 3 });

  const results = [];
  for await (const value of reader) {
    results.push(value);
  }

  t.deepEqual(results, [{ n: 1 }, { n: 2 }, { n: 3 }]);
});

// Test early close over CapTP
test('captp: early close', async t => {
  const { makeFar } = makeLoopback('test');

  let yielded = 0;
  async function* manyItems() {
    for (let i = 0; i < 100; i += 1) {
      yielded += 1;
      yield harden({ n: i });
    }
  }

  const localReader = readerFromIterator(manyItems());
  const remoteReader = await makeFar(localReader);

  const reader = iterateReader(remoteReader);

  // Only consume first 3 items
  const r1 = await reader.next();
  t.false(r1.done);
  t.is(/** @type {{n: number}} */ (r1.value).n, 0);

  const r2 = await reader.next();
  t.false(r2.done);
  t.is(/** @type {{n: number}} */ (r2.value).n, 1);

  const r3 = await reader.next();
  t.false(r3.done);
  t.is(/** @type {{n: number}} */ (r3.value).n, 2);

  // Close early
  assert(reader.return, 'iterator should have return method');
  await reader.return();

  // Producer should not have yielded all 100 items
  t.true(yielded < 100);
});

// Test writer over CapTP
test('captp: writer round-trip', async t => {
  const { makeFar } = makeLoopback('test');

  const values = [
    harden({ type: 'message', text: 'hello' }),
    harden({ type: 'data', value: 42 }),
  ];

  async function* source() {
    for (const v of values) {
      yield v;
    }
  }

  const [pipeReader, pipeWriter] = makePipe();
  const localWriter = writerFromIterator(pipeWriter);
  const remoteWriter = await makeFar(localWriter);

  const writer = iterateWriter(remoteWriter);
  const sendDone = writeAll(writer, source());

  const results = [];
  for await (const value of pipeReader) {
    results.push(value);
  }

  await sendDone;

  t.deepEqual(results, values);
});

// Test writer with buffering over CapTP
test('captp: writer with buffer', async t => {
  const { makeFar } = makeLoopback('test');

  const values = [harden({ n: 1 }), harden({ n: 2 }), harden({ n: 3 })];

  async function* source() {
    for (const v of values) {
      yield v;
    }
  }

  const [pipeReader, pipeWriter] = makePipe();
  const localWriter = writerFromIterator(pipeWriter, { buffer: 2 });
  const remoteWriter = await makeFar(localWriter);

  const writer = iterateWriter(remoteWriter, { buffer: 2 });
  const sendDone = writeAll(writer, source());

  const results = [];
  for await (const value of pipeReader) {
    results.push(value);
  }

  await sendDone;

  t.deepEqual(results, values);
});

// Test empty writer over CapTP
test('captp: empty writer', async t => {
  const { makeFar } = makeLoopback('test');

  async function* emptySource() {
    // yields nothing
  }

  const [pipeReader, pipeWriter] = makePipe();
  const localWriter = writerFromIterator(pipeWriter);
  const remoteWriter = await makeFar(localWriter);

  const writer = iterateWriter(remoteWriter);
  const sendDone = writeAll(writer, emptySource());

  const results = [];
  for await (const value of pipeReader) {
    results.push(value);
  }

  await sendDone;

  t.is(results.length, 0);
});

// Test bytes writer over CapTP
test('captp: bytes writer round-trip', async t => {
  const { makeFar } = makeLoopback('test');

  const chunks = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])];

  const [pipeReader, pipeWriter] = makePipe();
  const localWriter = bytesWriterFromIterator(pipeWriter);
  const remoteWriter = await makeFar(localWriter);

  const writer = iterateBytesWriter(remoteWriter);
  const sendDone = writeAll(writer, chunks);

  const results = [];
  for await (const value of pipeReader) {
    results.push(value);
  }

  await sendDone;

  t.is(results.length, 2);
  t.deepEqual(results[0], new Uint8Array([1, 2, 3]));
  t.deepEqual(results[1], new Uint8Array([4, 5, 6]));
});

// Test bytes writer with buffering over CapTP
test('captp: bytes writer with buffer', async t => {
  const { makeFar } = makeLoopback('test');

  const chunks = [
    new Uint8Array([1]),
    new Uint8Array([2]),
    new Uint8Array([3]),
  ];

  const [pipeReader, pipeWriter] = makePipe();
  const localWriter = bytesWriterFromIterator(pipeWriter, { buffer: 2 });
  const remoteWriter = await makeFar(localWriter);

  const writer = iterateBytesWriter(remoteWriter, { buffer: 2 });
  const sendDone = writeAll(writer, chunks);

  const results = [];
  for await (const value of pipeReader) {
    results.push(value);
  }

  await sendDone;

  t.is(results.length, 3);
  t.deepEqual(results[0], new Uint8Array([1]));
  t.deepEqual(results[1], new Uint8Array([2]));
  t.deepEqual(results[2], new Uint8Array([3]));
});
