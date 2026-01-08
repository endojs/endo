// @ts-check
import test from '@endo/ses-ava/prepare-endo.js';
import { M } from '@endo/patterns';

import { streamBytesIterator } from '../stream-bytes-iterator.js';
import { iterateBytesStream } from '../iterate-bytes-stream.js';
import { streamIterator } from '../stream-iterator.js';
import { iterateStream } from '../iterate-stream.js';

test('bytes stream round-trip', async t => {
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

  // Convert to stream reference
  const streamRef = streamBytesIterator(localIterator());

  // Convert back to local iterator
  const reader = await iterateBytesStream(streamRef);

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

test('passable stream round-trip', async t => {
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

  // Convert to stream reference
  const streamRef = streamIterator(localIterator());

  // Convert back to local iterator
  const reader = iterateStream(streamRef);

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

test('empty bytes stream', async t => {
  async function* emptyIterator() {
    // yields nothing
  }

  const streamRef = streamBytesIterator(emptyIterator());
  const reader = await iterateBytesStream(streamRef);

  const results = [];
  for await (const message of reader) {
    results.push(message);
  }

  t.is(results.length, 0);
});

test('empty passable stream', async t => {
  async function* emptyIterator() {
    // yields nothing
  }

  const streamRef = streamIterator(emptyIterator());
  const reader = iterateStream(streamRef);

  const results = [];
  for await (const value of reader) {
    results.push(value);
  }

  t.is(results.length, 0);
});

test('bytes stream from array', async t => {
  const messages = [new Uint8Array([10, 20]), new Uint8Array([30, 40])];

  const streamRef = streamBytesIterator(messages);
  const reader = await iterateBytesStream(streamRef);

  const results = [];
  for await (const message of reader) {
    results.push(message);
  }

  t.is(results.length, messages.length);
  t.deepEqual(results[0], messages[0]);
  t.deepEqual(results[1], messages[1]);
});

test('passable stream from array', async t => {
  const values = ['hello', 'world', 42, true, null];

  const streamRef = streamIterator(values);
  const reader = iterateStream(streamRef);

  const results = [];
  for await (const value of reader) {
    results.push(value);
  }

  t.deepEqual(results, values);
});

test('single-item bytes stream', async t => {
  const message = new Uint8Array([255, 0, 128]);

  const streamRef = streamBytesIterator([message]);
  const reader = await iterateBytesStream(streamRef);

  const result = await reader.next();
  t.false(result.done);
  t.deepEqual(result.value, message);

  const done = await reader.next();
  t.true(done.done);
});

test('large bytes stream', async t => {
  const largeChunk = new Uint8Array(10000);
  for (let i = 0; i < largeChunk.length; i += 1) {
    largeChunk[i] = i % 256;
  }

  const streamRef = streamBytesIterator([largeChunk]);
  const reader = await iterateBytesStream(streamRef);

  const results = [];
  for await (const message of reader) {
    results.push(message);
  }

  t.is(results.length, 1);
  t.deepEqual(results[0], largeChunk);
});

test('passable stream with buffer', async t => {
  const values = [1, 2, 3, 4, 5];

  async function* source() {
    for (const v of values) {
      yield v;
    }
  }

  const streamRef = streamIterator(source());
  // Use buffer=2 to pre-ack 2 values
  const reader = iterateStream(streamRef, { buffer: 2 });

  const results = [];
  for await (const value of reader) {
    results.push(value);
  }

  t.deepEqual(results, values);
});

test('bytes stream with buffer', async t => {
  const messages = [
    new Uint8Array([1]),
    new Uint8Array([2]),
    new Uint8Array([3]),
  ];

  const streamRef = streamBytesIterator(messages);
  const reader = await iterateBytesStream(streamRef, { buffer: 1 });

  const results = [];
  for await (const message of reader) {
    results.push(message);
  }

  t.is(results.length, messages.length);
});

test('bytes stream stringLengthLimit allows small messages', async t => {
  // Small message that becomes ~4 characters of base64
  const messages = [new Uint8Array([1, 2, 3])];

  const streamRef = streamBytesIterator(messages);
  // 10 character limit should allow small messages (base64 of 3 bytes = 4 chars)
  const reader = await iterateBytesStream(streamRef, { stringLengthLimit: 10 });

  const results = [];
  for await (const message of reader) {
    results.push(message);
  }

  t.is(results.length, 1);
  t.deepEqual(results[0], messages[0]);
});

test('bytes stream stringLengthLimit rejects large messages', async t => {
  // Large message that becomes ~14 characters of base64 (10 bytes * 4/3 ≈ 14)
  const messages = [new Uint8Array(10)];

  const streamRef = streamBytesIterator(messages);
  // 10 character limit should reject this (~14 char base64)
  const reader = await iterateBytesStream(streamRef, { stringLengthLimit: 10 });

  // Should throw when trying to read the oversized message
  await t.throwsAsync(async () => reader.next(), {
    message: /must not be bigger than/,
  });
});

test('bytes stream stringLengthLimit at exact boundary', async t => {
  // 6 bytes of binary becomes exactly 8 characters of base64 (6 * 4/3 = 8)
  const messages = [new Uint8Array(6)];

  const streamRef = streamBytesIterator(messages);
  // 8 character limit should allow exactly 6 bytes of data
  const reader = await iterateBytesStream(streamRef, { stringLengthLimit: 8 });

  const results = [];
  for await (const message of reader) {
    results.push(message);
  }

  t.is(results.length, 1);
});

test('bytes stream stringLengthLimit one under boundary rejects', async t => {
  // 6 bytes of binary becomes exactly 8 characters of base64
  const messages = [new Uint8Array(6)];

  const streamRef = streamBytesIterator(messages);
  // 7 character limit should reject 6 bytes (which produces 8 chars)
  const reader = await iterateBytesStream(streamRef, { stringLengthLimit: 7 });

  await t.throwsAsync(async () => reader.next(), {
    message: /must not be bigger than/,
  });
});

test('passable stream with valid readPattern', async t => {
  const values = harden([
    { type: 'a', count: 1 },
    { type: 'b', count: 2 },
  ]);

  const streamRef = streamIterator(values);
  const readPattern = M.splitRecord({ type: M.string(), count: M.number() });
  const reader = iterateStream(streamRef, { readPattern });

  const results = [];
  for await (const value of reader) {
    results.push(value);
  }

  t.deepEqual(results, values);
});

test('passable stream with invalid readPattern rejects', async t => {
  const values = harden([
    { type: 'a', count: 1 },
    { type: 'b', count: 'not a number' }, // Invalid
  ]);

  const streamRef = streamIterator(values);
  const readPattern = M.splitRecord({ type: M.string(), count: M.number() });
  const reader = iterateStream(streamRef, { readPattern });

  // First value should work
  const first = await reader.next();
  t.false(first.done);
  t.deepEqual(first.value, values[0]);

  // Second value should throw due to readPattern mismatch
  await t.throwsAsync(async () => reader.next(), {
    message: /count/,
  });
});

test('stream exposes readPattern and readReturnPattern', async t => {
  const readPattern = M.number();
  const readReturnPattern = M.string();

  const streamRef = streamIterator([1, 2, 3], {
    readPattern,
    readReturnPattern,
  });

  t.is(streamRef.readPattern(), readPattern);
  t.is(streamRef.readReturnPattern(), readReturnPattern);
});

test('stream with undefined patterns returns undefined', async t => {
  const streamRef = streamIterator([1, 2, 3]);

  t.is(streamRef.readPattern(), undefined);
  t.is(streamRef.readReturnPattern(), undefined);
});

test('passable stream early close', async t => {
  let produced = 0;
  async function* source() {
    for (let i = 0; i < 100; i += 1) {
      produced += 1;
      yield i;
    }
  }

  const streamRef = streamIterator(source());
  const reader = iterateStream(streamRef);

  // Read only 3 values
  const r1 = await reader.next();
  t.is(r1.value, 0);
  const r2 = await reader.next();
  t.is(r2.value, 1);
  const r3 = await reader.next();
  t.is(r3.value, 2);

  // Close early
  assert(reader.return, 'iterator should have return method');
  // @ts-expect-error - Testing runtime behavior: return() passes value through
  const closed = await reader.return('done');
  t.true(closed.done);
  // @ts-expect-error - Testing runtime behavior: value is passed through
  t.is(closed.value, 'done');

  // Producer should have only produced a few values (depends on buffer)
  t.true(produced < 10);
});

test('passable stream immediate close via raw stream API', async t => {
  let started = false;
  async function* source() {
    started = true;
    yield 1;
  }

  const streamRef = streamIterator(source());

  // Call stream() with a synchronize chain that immediately signals close
  // The synchronize must be a node (not null) - the node's promise being null signals close
  const immediateCloseSyn = Promise.resolve(
    harden({ value: undefined, promise: null }),
  );

  const ackHead = await streamRef.stream(immediateCloseSyn);

  // The responder should return a done node with undefined value
  t.is(ackHead.promise, null);
  t.is(ackHead.value, undefined);

  // The generator should not have started (no values were requested)
  t.false(started);
});

test('passable stream many items', async t => {
  const count = 100;
  const values = Array.from({ length: count }, (_, i) => i);

  const streamRef = streamIterator(values);
  const reader = iterateStream(streamRef);

  const results = [];
  for await (const value of reader) {
    results.push(value);
  }

  t.deepEqual(results, values);
});

test('bytes stream many messages', async t => {
  const count = 50;
  const messages = Array.from(
    { length: count },
    (_, i) => new Uint8Array([i, i + 1, i + 2]),
  );

  const streamRef = streamBytesIterator(messages);
  const reader = await iterateBytesStream(streamRef);

  const results = [];
  for await (const message of reader) {
    results.push(message);
  }

  t.is(results.length, count);
  for (let i = 0; i < count; i += 1) {
    t.deepEqual(results[i], messages[i]);
  }
});

test('passable stream high buffer', async t => {
  const values = [1, 2, 3, 4, 5];

  const streamRef = streamIterator(values);
  const reader = iterateStream(streamRef, { buffer: 10 });

  const results = [];
  for await (const value of reader) {
    results.push(value);
  }

  t.deepEqual(results, values);
});

test('passable stream consumed once', async t => {
  const values = [1, 2, 3];

  const streamRef = streamIterator(values);

  // First consumer
  const reader1 = iterateStream(streamRef);
  const results1 = [];
  for await (const value of reader1) {
    results1.push(value);
  }
  t.deepEqual(results1, values);

  // Second consumer should get empty or error
  const reader2 = iterateStream(streamRef);
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

  const iter = generate();

  // Get all yielded values
  const r1 = await iter.next();
  t.deepEqual(r1, { value: 1, done: false });

  const r2 = await iter.next();
  t.deepEqual(r2, { value: 2, done: false });

  // Generator returns 'a' when exhausted
  const r3 = await iter.next();
  t.deepEqual(r3, { value: 'a', done: true });

  // Subsequent next() returns undefined
  const r4 = await iter.next();
  t.deepEqual(r4, { value: undefined, done: true });
});

test('bridged stream preserves explicit return value', async t => {
  async function* generate() {
    yield harden({ n: 1 });
    yield harden({ n: 2 });
    return 'done';
  }

  const streamRef = streamIterator(generate());
  const iter = iterateStream(streamRef);

  // Get all yielded values
  const r1 = await iter.next();
  t.deepEqual(r1, { value: { n: 1 }, done: false });

  const r2 = await iter.next();
  t.deepEqual(r2, { value: { n: 2 }, done: false });

  // Stream preserves the return value 'done'
  const r3 = await iter.next();
  t.deepEqual(r3, { value: 'done', done: true });

  // Subsequent next() returns undefined
  const r4 = await iter.next();
  t.deepEqual(r4, { value: undefined, done: true });
});

test('native async generator return(value) behavior', async t => {
  async function* generate() {
    yield 1;
    yield 2;
    yield 3;
  }

  const iter = generate();

  // Get first value
  const first = await iter.next();
  t.deepEqual(first, { value: 1, done: false });

  // Call return('a') - should return the passed value
  // Note: TypeScript types return() as accepting TReturn, but at runtime any value works
  assert(iter.return, 'iterator should have return method');
  const returned = await iter.return(/** @type {any} */ ('a'));
  t.deepEqual(returned, { value: 'a', done: true });

  // Subsequent calls to return() return undefined
  const returned2 = await iter.return();
  t.deepEqual(returned2, { value: undefined, done: true });

  // next() after return should still show done
  const afterReturn = await iter.next();
  t.deepEqual(afterReturn, { value: undefined, done: true });
});

test('bridged stream return(value) behavior', async t => {
  async function* generate() {
    yield 1;
    yield 2;
    yield 3;
  }

  const streamRef = streamIterator(generate());
  const iter = iterateStream(streamRef);

  // Get first value
  const first = await iter.next();
  t.deepEqual(first, { value: 1, done: false });

  // Call return('a') - should return the passed value (matching native behavior)
  assert(iter.return, 'iterator should have return method');
  // @ts-expect-error - Testing runtime behavior: return() passes value through
  const returned = await iter.return('a');
  t.deepEqual(returned, { value: 'a', done: true });

  // Subsequent calls to return() return undefined
  // @ts-expect-error - Testing runtime behavior: return() without args
  const returned2 = await iter.return();
  t.deepEqual(returned2, { value: undefined, done: true });

  // next() after return should still show done
  const afterReturn = await iter.next();
  t.deepEqual(afterReturn, { value: undefined, done: true });
});

// Test that all four type parameters (TRead, TWrite, TReadReturn, TWriteReturn)
// are honored when constructing an exo-stream from an endo Stream.
test('exo-stream from endo Stream honors all four type parameters', async t => {
  // Track TWrite values received by the generator
  /** @type {(string | undefined)[]} */
  const receivedWrites = [];

  // Create an async generator that:
  // - Yields TRead values (numbers)
  // - Accepts TWrite values via next() (strings)
  // - Returns TReadReturn when done (object)
  /**
   * @returns {AsyncGenerator<number, {final: string}, string>}
   */
  async function* bidirectionalGenerator() {
    /** @type {string | undefined} */
    let received;

    // First yield: the value passed to the first next() is ignored (generator not yet yielded)
    received = yield 1;
    receivedWrites.push(received);

    // Second yield: receives second next() value
    received = yield 2;
    receivedWrites.push(received);

    // Third yield: receives third next() value
    received = yield 3;
    receivedWrites.push(received);

    // Return value (TReadReturn)
    return harden({ final: 'done' });
  }

  // Wrap the generator in a PassableStream
  const streamRef = streamIterator(bidirectionalGenerator());

  // Create initiator-side stream with buffer=0 for precise TWrite timing
  const reader = iterateStream(streamRef, { buffer: 0 });

  // Read first value - TWrite value here is ignored (generator priming)
  const r1 = await reader.next('ignored');
  t.false(r1.done);
  t.is(r1.value, 1, 'first yielded value should be 1');

  // Read second value, send 'first' as TWrite (received after first yield)
  const r2 = await reader.next('first');
  t.false(r2.done);
  t.is(r2.value, 2, 'second yielded value should be 2');

  // Read third value, send 'second' as TWrite
  const r3 = await reader.next('second');
  t.false(r3.done);
  t.is(r3.value, 3, 'third yielded value should be 3');

  // Read final value (TReadReturn), send 'third' as TWrite
  const r4 = await reader.next('third');
  t.true(r4.done);
  t.deepEqual(
    r4.value,
    { final: 'done' },
    'return value should be the TReadReturn object',
  );

  // Verify TWrite values were properly received
  t.deepEqual(
    receivedWrites,
    ['first', 'second', 'third'],
    'TWrite values should be received',
  );
});
