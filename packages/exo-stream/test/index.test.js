import test from '@endo/ses-ava/prepare-endo.js';
import { M } from '@endo/patterns';

test.skip('placeholder', async t => {
  t.fail('TODO: add tests');
});

// Test passable stream with buffer option
test('passable stream with buffer', async t => {
  const values = [1, 2, 3, 4, 5];

  async function* source() {
    for (const v of values) {
      yield v;
    }
  }

  const streamRef = streamIterator(source());
  // Use buffer=2 to pre-ack 2 values
  const reader = await iterateStream(streamRef, { buffer: 2 });

  const results = [];
  for await (const value of reader) {
    results.push(value);
  }

  t.deepEqual(results, values);
});

// Test bytes stream with buffer option
test('bytes stream with buffer', async t => {
  const chunks = [
    new Uint8Array([1]),
    new Uint8Array([2]),
    new Uint8Array([3]),
  ];

  const streamRef = streamBytesIterator(chunks);
  const reader = await iterateBytesStream(streamRef, { buffer: 1 });

  const results = [];
  for await (const chunk of reader) {
    results.push(chunk);
  }

  t.is(results.length, chunks.length);
});

// Test passable stream with readPattern validation
test('passable stream with valid readPattern', async t => {
  const values = harden([
    { type: 'a', count: 1 },
    { type: 'b', count: 2 },
  ]);

  const streamRef = streamIterator(values);
  const readPattern = M.splitRecord({ type: M.string(), count: M.number() });
  const reader = await iterateStream(streamRef, { readPattern });

  const results = [];
  for await (const value of reader) {
    results.push(value);
  }

  t.deepEqual(results, values);
});

// Test passable stream with readPattern validation failure
test('passable stream with invalid readPattern rejects', async t => {
  const values = harden([
    { type: 'a', count: 1 },
    { type: 'b', count: 'not a number' }, // Invalid
  ]);

  const streamRef = streamIterator(values);
  const readPattern = M.splitRecord({ type: M.string(), count: M.number() });
  const reader = await iterateStream(streamRef, { readPattern });

  // First value should work
  const first = await reader.next();
  t.false(first.done);
  t.deepEqual(first.value, values[0]);

  // Second value should throw due to readPattern mismatch
  await t.throwsAsync(async () => reader.next(), {
    message: /count/,
  });
});

// Test that producer exposes patterns via methods
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

// Test stream with undefined patterns
test('stream with undefined patterns returns undefined', async t => {
  const streamRef = streamIterator([1, 2, 3]);

  t.is(streamRef.readPattern(), undefined);
  t.is(streamRef.readReturnPattern(), undefined);
});

// Test early close via return()
test('passable stream early close', async t => {
  let produced = 0;
  async function* source() {
    for (let i = 0; i < 100; i += 1) {
      produced += 1;
      yield i;
    }
  }

  const streamRef = streamIterator(source());
  const reader = await iterateStream(streamRef);

  // Read only 3 values
  const r1 = await reader.next();
  t.is(r1.value, 0);
  const r2 = await reader.next();
  t.is(r2.value, 1);
  const r3 = await reader.next();
  t.is(r3.value, 2);

  // Close early
  assert(reader.return, 'iterator should have return method');
  const closed = await reader.return('done');
  t.true(closed.done);
  t.is(closed.value, 'done');

  // Producer should have only produced a few values (depends on buffer)
  t.true(produced < 10);
});

// Test immediate close via raw stream() API
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

// Test many items
test('passable stream many items', async t => {
  const count = 100;
  const values = Array.from({ length: count }, (_, i) => i);

  const streamRef = streamIterator(values);
  const reader = await iterateStream(streamRef);

  const results = [];
  for await (const value of reader) {
    results.push(value);
  }

  t.deepEqual(results, values);
});

// Test bytes stream many chunks
test('bytes stream many chunks', async t => {
  const count = 50;
  const chunks = Array.from(
    { length: count },
    (_, i) => new Uint8Array([i, i + 1, i + 2]),
  );

  const streamRef = streamBytesIterator(chunks);
  const reader = await iterateBytesStream(streamRef);

  const results = [];
  for await (const chunk of reader) {
    results.push(chunk);
  }

  t.is(results.length, count);
  for (let i = 0; i < count; i += 1) {
    t.deepEqual(results[i], chunks[i]);
  }
});

// Test passable stream with high buffer
test('passable stream high buffer', async t => {
  const values = [1, 2, 3, 4, 5];

  const streamRef = streamIterator(values);
  const reader = await iterateStream(streamRef, { buffer: 10 });

  const results = [];
  for await (const value of reader) {
    results.push(value);
  }

  t.deepEqual(results, values);
});

// Test consuming same stream twice fails
test('passable stream consumed once', async t => {
  const values = [1, 2, 3];

  const streamRef = streamIterator(values);

  // First consumer
  const reader1 = await iterateStream(streamRef);
  const results1 = [];
  for await (const value of reader1) {
    results1.push(value);
  }
  t.deepEqual(results1, values);

  // Second consumer should get empty or error
  const reader2 = await iterateStream(streamRef);
  const results2 = [];
  for await (const value of reader2) {
    results2.push(value);
  }
  t.is(results2.length, 0);
});

// Test native async generator with explicit return value
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

// Test that bridged stream preserves explicit return value
test('bridged stream preserves explicit return value', async t => {
  async function* generate() {
    yield harden({ n: 1 });
    yield harden({ n: 2 });
    return 'done';
  }

  const streamRef = streamIterator(generate());
  const iter = await iterateStream(streamRef);

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

// Test native async generator iterator.return(value) behavior as baseline
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

// Test that bridged stream matches native iterator.return(value) behavior
test('bridged stream return(value) behavior', async t => {
  async function* generate() {
    yield 1;
    yield 2;
    yield 3;
  }

  const streamRef = streamIterator(generate());
  const iter = await iterateStream(streamRef);

  // Get first value
  const first = await iter.next();
  t.deepEqual(first, { value: 1, done: false });

  // Call return('a') - should return the passed value (matching native behavior)
  assert(iter.return, 'iterator should have return method');
  const returned = await iter.return('a');
  t.deepEqual(returned, { value: 'a', done: true });

  // Subsequent calls to return() return undefined
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
  const reader = await iterateStream(streamRef, { buffer: 0 });

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
