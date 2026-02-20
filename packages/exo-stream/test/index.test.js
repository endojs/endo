// @ts-check
import test from '@endo/ses-ava/prepare-endo.js';
import { M } from '@endo/patterns';

import { makePipe } from '@endo/stream';
import { bytesReaderFromIterator } from '../bytes-reader-from-iterator.js';
import { iterateBytesReader } from '../iterate-bytes-reader.js';
import { readerFromIterator } from '../reader-from-iterator.js';
import { iterateReader } from '../iterate-reader.js';
import { writerFromIterator } from '../writer-from-iterator.js';
import { iterateWriter } from '../iterate-writer.js';
import { bytesWriterFromIterator } from '../bytes-writer-from-iterator.js';
import { iterateBytesWriter } from '../iterate-bytes-writer.js';

test('bytes reader round-trip', async t => {
  const messages = [
    new Uint8Array([1, 2, 3]),
    new Uint8Array([4, 5, 6]),
    new Uint8Array([7, 8, 9]),
  ];

  // Create a local async iterator
  async function* localIterator() {
    for (const message of messages) {
      yield message;
    }
  }

  // Convert to reader reference
  const readerRef = bytesReaderFromIterator(localIterator());

  // Convert back to local iterator
  const reader = await iterateBytesReader(readerRef);

  // Collect results
  const results = [];
  for await (const message of reader) {
    results.push(message);
  }

  // Verify
  t.is(results.length, messages.length);
  for (let i = 0; i < messages.length; i += 1) {
    t.deepEqual(results[i], messages[i]);
  }
});

test('passable reader round-trip', async t => {
  const values = [
    { type: 'message', text: 'hello' },
    { type: 'data', value: 42 },
    { type: 'list', items: [1, 2, 3] },
  ];

  // Create a local async iterator
  async function* localIterator() {
    for (const value of values) {
      yield value;
    }
  }

  // Convert to reader reference
  const readerRef = readerFromIterator(localIterator());

  // Convert back to local iterator
  const reader = iterateReader(readerRef);

  // Collect results
  const results = [];
  for await (const value of reader) {
    results.push(value);
  }

  // Verify
  t.is(results.length, values.length);
  for (let i = 0; i < values.length; i += 1) {
    t.deepEqual(results[i], values[i]);
  }
});

test('empty bytes reader', async t => {
  async function* emptyIterator() {
    // yields nothing
  }

  const readerRef = bytesReaderFromIterator(emptyIterator());
  const reader = await iterateBytesReader(readerRef);

  const results = [];
  for await (const message of reader) {
    results.push(message);
  }

  t.is(results.length, 0);
});

test('empty passable reader', async t => {
  async function* emptyIterator() {
    // yields nothing
  }

  const readerRef = readerFromIterator(emptyIterator());
  const reader = iterateReader(readerRef);

  const results = [];
  for await (const value of reader) {
    results.push(value);
  }

  t.is(results.length, 0);
});

test('bytes reader from array', async t => {
  const messages = [new Uint8Array([10, 20]), new Uint8Array([30, 40])];

  const readerRef = bytesReaderFromIterator(messages);
  const reader = await iterateBytesReader(readerRef);

  const results = [];
  for await (const message of reader) {
    results.push(message);
  }

  t.is(results.length, messages.length);
  t.deepEqual(results[0], messages[0]);
  t.deepEqual(results[1], messages[1]);
});

test('passable reader from array', async t => {
  const values = ['hello', 'world', 42, true, null];

  const readerRef = readerFromIterator(values);
  const reader = iterateReader(readerRef);

  const results = [];
  for await (const value of reader) {
    results.push(value);
  }

  t.deepEqual(results, values);
});

test('single-item bytes reader', async t => {
  const message = new Uint8Array([255, 0, 128]);

  const readerRef = bytesReaderFromIterator([message]);
  const reader = await iterateBytesReader(readerRef);

  const result = await reader.next();
  t.false(result.done);
  t.deepEqual(result.value, message);

  const done = await reader.next();
  t.true(done.done);
});

test('large bytes reader', async t => {
  const largeChunk = new Uint8Array(10000);
  for (let i = 0; i < largeChunk.length; i += 1) {
    largeChunk[i] = i % 256;
  }

  const readerRef = bytesReaderFromIterator([largeChunk]);
  const reader = await iterateBytesReader(readerRef);

  const results = [];
  for await (const message of reader) {
    results.push(message);
  }

  t.is(results.length, 1);
  t.deepEqual(results[0], largeChunk);
});

test('passable reader with buffer', async t => {
  const values = [1, 2, 3, 4, 5];

  async function* source() {
    for (const v of values) {
      yield v;
    }
  }

  const readerRef = readerFromIterator(source());
  // Use buffer=2 to pre-ack 2 values
  const reader = iterateReader(readerRef, { buffer: 2 });

  const results = [];
  for await (const value of reader) {
    results.push(value);
  }

  t.deepEqual(results, values);
});

test('bytes reader with buffer', async t => {
  const messages = [
    new Uint8Array([1]),
    new Uint8Array([2]),
    new Uint8Array([3]),
  ];

  const readerRef = bytesReaderFromIterator(messages);
  const reader = await iterateBytesReader(readerRef, { buffer: 1 });

  const results = [];
  for await (const message of reader) {
    results.push(message);
  }

  t.is(results.length, messages.length);
});

test('bytes reader stringLengthLimit allows small messages', async t => {
  // Small message that becomes ~4 characters of base64
  const messages = [new Uint8Array([1, 2, 3])];

  const readerRef = bytesReaderFromIterator(messages);
  // 10 character limit should allow small messages (base64 of 3 bytes = 4 chars)
  const reader = await iterateBytesReader(readerRef, { stringLengthLimit: 10 });

  const results = [];
  for await (const message of reader) {
    results.push(message);
  }

  t.is(results.length, 1);
  t.deepEqual(results[0], messages[0]);
});

test('bytes reader stringLengthLimit rejects large messages', async t => {
  // Large message that becomes ~14 characters of base64 (10 bytes * 4/3 ≈ 14)
  const messages = [new Uint8Array(10)];

  const readerRef = bytesReaderFromIterator(messages);
  // 10 character limit should reject this (~14 char base64)
  const reader = await iterateBytesReader(readerRef, { stringLengthLimit: 10 });

  // Should throw when trying to read the oversized message
  await t.throwsAsync(async () => reader.next(), {
    message: /must not be bigger than/,
  });
});

test('bytes reader stringLengthLimit at exact boundary', async t => {
  // 6 bytes of binary becomes exactly 8 characters of base64 (6 * 4/3 = 8)
  const messages = [new Uint8Array(6)];

  const readerRef = bytesReaderFromIterator(messages);
  // 8 character limit should allow exactly 6 bytes of data
  const reader = await iterateBytesReader(readerRef, { stringLengthLimit: 8 });

  const results = [];
  for await (const message of reader) {
    results.push(message);
  }

  t.is(results.length, 1);
});

test('bytes reader stringLengthLimit one under boundary rejects', async t => {
  // 6 bytes of binary becomes exactly 8 characters of base64
  const messages = [new Uint8Array(6)];

  const readerRef = bytesReaderFromIterator(messages);
  // 7 character limit should reject 6 bytes (which produces 8 chars)
  const reader = await iterateBytesReader(readerRef, { stringLengthLimit: 7 });

  await t.throwsAsync(async () => reader.next(), {
    message: /must not be bigger than/,
  });
});

test('passable reader with valid readPattern', async t => {
  const values = harden([
    { type: 'a', count: 1 },
    { type: 'b', count: 2 },
  ]);

  const readerRef = readerFromIterator(values);
  const readPattern = M.splitRecord({ type: M.string(), count: M.number() });
  const reader = iterateReader(readerRef, { readPattern });

  const results = [];
  for await (const value of reader) {
    results.push(value);
  }

  t.deepEqual(results, values);
});

test('passable reader with invalid readPattern rejects', async t => {
  const values = harden([
    { type: 'a', count: 1 },
    { type: 'b', count: 'not a number' }, // Invalid
  ]);

  const readerRef = readerFromIterator(values);
  const readPattern = M.splitRecord({ type: M.string(), count: M.number() });
  const reader = iterateReader(readerRef, { readPattern });

  // First value should work
  const first = await reader.next();
  t.false(first.done);
  t.deepEqual(first.value, values[0]);

  // Second value should throw due to readPattern mismatch
  await t.throwsAsync(async () => reader.next(), {
    message: /count/,
  });
});

test('reader exposes readPattern and readReturnPattern', async t => {
  const readPattern = M.number();
  const readReturnPattern = M.string();

  const readerRef = readerFromIterator([1, 2, 3], {
    readPattern,
    readReturnPattern,
  });

  t.is(readerRef.readPattern(), readPattern);
  t.is(readerRef.readReturnPattern(), readReturnPattern);
});

test('reader with undefined patterns returns undefined', async t => {
  const readerRef = readerFromIterator([1, 2, 3]);

  t.is(readerRef.readPattern(), undefined);
  t.is(readerRef.readReturnPattern(), undefined);
});

test('passable reader early close', async t => {
  let produced = 0;
  async function* source() {
    for (let i = 0; i < 100; i += 1) {
      produced += 1;
      yield i;
    }
  }

  const readerRef = readerFromIterator(source());
  const reader = iterateReader(readerRef);

  // Read only 3 values
  const r1 = await reader.next();
  t.is(r1.value, 0);
  const r2 = await reader.next();
  t.is(r2.value, 1);
  const r3 = await reader.next();
  t.is(r3.value, 2);

  // Close early
  assert(reader.return, 'iterator should have return method');
  const closed = await reader.return();
  t.true(closed.done);
  t.is(closed.value, undefined);

  // Producer should have only produced a few values (depends on buffer)
  t.true(produced < 10);
});

test('passable reader immediate close via raw stream API', async t => {
  let started = false;
  async function* source() {
    started = true;
    yield 1;
  }

  const readerRef = readerFromIterator(source());

  // Call stream() with a synchronize chain that immediately signals close
  // The synchronize must be a node (not null) - the node's promise being null signals close
  const immediateCloseSyn = Promise.resolve(
    harden({ value: undefined, promise: null }),
  );

  const ackHead = await readerRef.stream(immediateCloseSyn);

  // The responder should return a done node with undefined value
  t.is(ackHead.promise, null);
  t.is(ackHead.value, undefined);

  // The generator should not have started (no values were requested)
  t.false(started);
});

test('passable reader many items', async t => {
  const count = 100;
  const values = Array.from({ length: count }, (_, i) => i);

  const readerRef = readerFromIterator(values);
  const reader = iterateReader(readerRef);

  const results = [];
  for await (const value of reader) {
    results.push(value);
  }

  t.deepEqual(results, values);
});

test('bytes reader many messages', async t => {
  const count = 50;
  const messages = Array.from(
    { length: count },
    (_, i) => new Uint8Array([i, i + 1, i + 2]),
  );

  const readerRef = bytesReaderFromIterator(messages);
  const reader = await iterateBytesReader(readerRef);

  const results = [];
  for await (const message of reader) {
    results.push(message);
  }

  t.is(results.length, count);
  for (let i = 0; i < count; i += 1) {
    t.deepEqual(results[i], messages[i]);
  }
});

test('passable reader high buffer', async t => {
  const values = [1, 2, 3, 4, 5];

  const readerRef = readerFromIterator(values);
  const reader = iterateReader(readerRef, { buffer: 10 });

  const results = [];
  for await (const value of reader) {
    results.push(value);
  }

  t.deepEqual(results, values);
});

test('passable reader consumed once', async t => {
  const values = [1, 2, 3];

  const readerRef = readerFromIterator(values);

  // First consumer
  const reader1 = iterateReader(readerRef);
  const results1 = [];
  for await (const value of reader1) {
    results1.push(value);
  }
  t.deepEqual(results1, values);

  // Second consumer should get empty or error
  const reader2 = iterateReader(readerRef);
  const results2 = [];
  for await (const value of reader2) {
    results2.push(value);
  }
  t.is(results2.length, 0);
});

test('native async generator with explicit return value', async t => {
  async function* generate() {
    yield 1;
    yield 2;
    return 'a';
  }

  const iterator = generate();

  // Get all yielded values
  const r1 = await iterator.next();
  t.deepEqual(r1, { value: 1, done: false });

  const r2 = await iterator.next();
  t.deepEqual(r2, { value: 2, done: false });

  // Generator returns 'a' when exhausted
  const r3 = await iterator.next();
  t.deepEqual(r3, { value: 'a', done: true });

  // Subsequent next() returns undefined
  const r4 = await iterator.next();
  t.deepEqual(r4, { value: undefined, done: true });
});

test('bridged reader preserves explicit return value', async t => {
  async function* generate() {
    yield harden({ n: 1 });
    yield harden({ n: 2 });
    return 'done';
  }

  const readerRef = readerFromIterator(generate());
  const iterator = iterateReader(readerRef);

  // Get all yielded values
  const r1 = await iterator.next();
  t.deepEqual(r1, { value: { n: 1 }, done: false });

  const r2 = await iterator.next();
  t.deepEqual(r2, { value: { n: 2 }, done: false });

  // Reader preserves the return value 'done'
  const r3 = await iterator.next();
  t.deepEqual(r3, { value: 'done', done: true });

  // Subsequent next() returns undefined
  const r4 = await iterator.next();
  t.deepEqual(r4, { value: undefined, done: true });
});

test('native async generator return(value) behavior', async t => {
  async function* generate() {
    yield 1;
    yield 2;
    yield 3;
  }

  const iterator = generate();

  // Get first value
  const first = await iterator.next();
  t.deepEqual(first, { value: 1, done: false });

  // Call return('a') - should return the passed value
  // Note: TypeScript types return() as accepting TReturn, but at runtime any value works
  assert(iterator.return, 'iterator should have return method');
  const returned = await iterator.return(/** @type {any} */ ('a'));
  t.deepEqual(returned, { value: 'a', done: true });

  // Subsequent calls to return() return undefined
  const returned2 = await iterator.return();
  t.deepEqual(returned2, { value: undefined, done: true });

  // next() after return should still show done
  const afterReturn = await iterator.next();
  t.deepEqual(afterReturn, { value: undefined, done: true });
});

test('bridged reader return(value) behavior', async t => {
  async function* generate() {
    yield 1;
    yield 2;
    yield 3;
  }

  const readerRef = readerFromIterator(generate());
  const iterator = iterateReader(readerRef);

  // Get first value
  const first = await iterator.next();
  t.deepEqual(first, { value: 1, done: false });

  // Call return() to close the reader early
  assert(iterator.return, 'iterator should have return method');
  const returned = await iterator.return();
  t.deepEqual(returned, { value: undefined, done: true });

  // Subsequent calls to return() also return done
  const returned2 = await iterator.return();
  t.deepEqual(returned2, { value: undefined, done: true });

  // next() after return should still show done
  const afterReturn = await iterator.next();
  t.deepEqual(afterReturn, { value: undefined, done: true });
});

// Writer tests

test('writer round-trip', async t => {
  const values = [
    { type: 'message', text: 'hello' },
    { type: 'data', value: 42 },
    { type: 'list', items: [1, 2, 3] },
  ];

  async function* localIterator() {
    for (const value of values) {
      yield value;
    }
  }

  const [pipeReader, pipeWriter] = makePipe();
  const writerRef = writerFromIterator(pipeWriter);

  // Send data to the writer
  const sendDone = iterateWriter(writerRef, localIterator());

  // Consume from the pipe reader
  const results = [];
  for await (const value of pipeReader) {
    results.push(value);
  }

  await sendDone;

  t.is(results.length, values.length);
  for (let i = 0; i < values.length; i += 1) {
    t.deepEqual(results[i], values[i]);
  }
});

test('empty writer', async t => {
  async function* emptyIterator() {
    // yields nothing
  }

  const [pipeReader, pipeWriter] = makePipe();
  const writerRef = writerFromIterator(pipeWriter);

  const sendDone = iterateWriter(writerRef, emptyIterator());

  const results = [];
  for await (const value of pipeReader) {
    results.push(value);
  }

  await sendDone;

  t.is(results.length, 0);
});

test('writer with buffer', async t => {
  const values = [1, 2, 3, 4, 5];

  async function* source() {
    for (const v of values) {
      yield v;
    }
  }

  const [pipeReader, pipeWriter] = makePipe();
  const writerRef = writerFromIterator(pipeWriter, { buffer: 2 });

  const sendDone = iterateWriter(writerRef, source(), { buffer: 2 });

  const results = [];
  for await (const value of pipeReader) {
    results.push(value);
  }

  await sendDone;

  t.deepEqual(results, values);
});

test('writer many items', async t => {
  const count = 100;
  const values = Array.from({ length: count }, (_, i) => i);

  const [pipeReader, pipeWriter] = makePipe();
  const writerRef = writerFromIterator(pipeWriter);

  const sendDone = iterateWriter(writerRef, values);

  const results = [];
  for await (const value of pipeReader) {
    results.push(value);
  }

  await sendDone;

  t.deepEqual(results, values);
});

test('writer exposes writePattern and writeReturnPattern', async t => {
  const writePattern = M.number();
  const writeReturnPattern = M.string();

  const [, pipeWriter] = makePipe();
  const writerRef = writerFromIterator(pipeWriter, {
    writePattern,
    writeReturnPattern,
  });

  t.is(writerRef.writePattern(), writePattern);
  t.is(writerRef.writeReturnPattern(), writeReturnPattern);
});

test('writer with undefined patterns returns undefined', async t => {
  const [, pipeWriter] = makePipe();
  const writerRef = writerFromIterator(pipeWriter);

  t.is(writerRef.writePattern(), undefined);
  t.is(writerRef.writeReturnPattern(), undefined);
});

// Bytes writer tests

test('bytes writer round-trip', async t => {
  const messages = [
    new Uint8Array([1, 2, 3]),
    new Uint8Array([4, 5, 6]),
    new Uint8Array([7, 8, 9]),
  ];

  async function* localIterator() {
    for (const message of messages) {
      yield message;
    }
  }

  const [pipeReader, pipeWriter] = makePipe();
  const writerRef = bytesWriterFromIterator(pipeWriter);

  const sendDone = iterateBytesWriter(writerRef, localIterator());

  const results = [];
  for await (const value of pipeReader) {
    results.push(value);
  }

  await sendDone;

  t.is(results.length, messages.length);
  for (let i = 0; i < messages.length; i += 1) {
    t.deepEqual(results[i], messages[i]);
  }
});

test('empty bytes writer', async t => {
  async function* emptyIterator() {
    // yields nothing
  }

  const [pipeReader, pipeWriter] = makePipe();
  const writerRef = bytesWriterFromIterator(pipeWriter);

  const sendDone = iterateBytesWriter(writerRef, emptyIterator());

  const results = [];
  for await (const value of pipeReader) {
    results.push(value);
  }

  await sendDone;

  t.is(results.length, 0);
});

test('bytes writer with buffer', async t => {
  const messages = [
    new Uint8Array([1]),
    new Uint8Array([2]),
    new Uint8Array([3]),
    new Uint8Array([4]),
    new Uint8Array([5]),
  ];

  async function* source() {
    for (const m of messages) {
      yield m;
    }
  }

  const [pipeReader, pipeWriter] = makePipe();
  const writerRef = bytesWriterFromIterator(pipeWriter, { buffer: 2 });

  const sendDone = iterateBytesWriter(writerRef, source(), { buffer: 2 });

  const results = [];
  for await (const value of pipeReader) {
    results.push(value);
  }

  await sendDone;

  t.is(results.length, messages.length);
  for (let i = 0; i < messages.length; i += 1) {
    t.deepEqual(results[i], messages[i]);
  }
});

test('bytes writer many messages', async t => {
  const count = 50;
  const messages = Array.from(
    { length: count },
    (_, i) => new Uint8Array([i, i + 1, i + 2]),
  );

  const [pipeReader, pipeWriter] = makePipe();
  const writerRef = bytesWriterFromIterator(pipeWriter);

  const sendDone = iterateBytesWriter(writerRef, messages);

  const results = [];
  for await (const value of pipeReader) {
    results.push(value);
  }

  await sendDone;

  t.is(results.length, count);
  for (let i = 0; i < count; i += 1) {
    t.deepEqual(results[i], messages[i]);
  }
});

test('bytes writer exposes writeReturnPattern', async t => {
  const writeReturnPattern = M.string();

  const [, pipeWriter] = makePipe();
  const writerRef = bytesWriterFromIterator(pipeWriter, {
    writeReturnPattern,
  });

  t.is(writerRef.writeReturnPattern(), writeReturnPattern);
});

test('bytes writer with undefined pattern returns undefined', async t => {
  const [, pipeWriter] = makePipe();
  const writerRef = bytesWriterFromIterator(pipeWriter);

  t.is(writerRef.writeReturnPattern(), undefined);
});

test('large bytes writer', async t => {
  const largeChunk = new Uint8Array(10000);
  for (let i = 0; i < largeChunk.length; i += 1) {
    largeChunk[i] = i % 256;
  }

  const [pipeReader, pipeWriter] = makePipe();
  const writerRef = bytesWriterFromIterator(pipeWriter);

  const sendDone = iterateBytesWriter(writerRef, [largeChunk]);

  const results = [];
  for await (const value of pipeReader) {
    results.push(value);
  }

  await sendDone;

  t.is(results.length, 1);
  t.deepEqual(results[0], largeChunk);
});
