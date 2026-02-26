// @ts-check
/* eslint-disable no-await-in-loop */
import test from '@endo/ses-ava/prepare-endo.js';
import { M } from '@endo/patterns';
import { makePromiseKit } from '@endo/promise-kit';
import { Far } from '@endo/far';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';

import { readerFromIterator } from '../reader-from-iterator.js';
import { iterateReader } from '../iterate-reader.js';

/** @import { Passable } from '@endo/pass-style' */
/** @import { ReaderIterator, StreamNode } from '../types.js' */

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

test('passable reader with valid readPattern', async t => {
  const values = [
    { type: 'a', count: 1 },
    { type: 'b', count: 2 },
  ];

  const readerRef = readerFromIterator(values);
  const readPattern = M.splitRecord({ type: M.string(), count: M.number() });
  const reader = iterateReader(readerRef, { readPattern });

  // All values should be accepted
  const results = [];
  for await (const value of reader) {
    results.push(value);
  }

  t.deepEqual(results, values);
});

test('passable reader with invalid readPattern rejects', async t => {
  const values = [
    { type: 'a', count: 1 },
    { type: 'b', count: 'not a number' },
  ];

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

  const iterator =
    /** @type {AsyncGenerator<number, string | undefined, unknown>} */ (
      /** @type {unknown} */ (generate())
    );

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

  // Subsequent next() returns the same final value
  const r4 = await iterator.next();
  t.deepEqual(r4, { value: 'done', done: true });
});

test('native async generator return(value) behavior', async t => {
  async function* generate() {
    yield 1;
    yield 2;
    yield 3;
  }

  const iterator =
    /** @type {AsyncGenerator<number, string | undefined, unknown>} */ (
      /** @type {unknown} */ (generate())
    );

  // Get first value
  const first = await iterator.next();
  t.deepEqual(first, { value: 1, done: false });

  // Call return('a') - should return the passed value
  // Note: TypeScript types return() as accepting TReturn, but at runtime any value works
  assert(iterator.return, 'iterator should have return method');
  const returned = await iterator.return('a');
  t.deepEqual(returned, { value: 'a', done: true });

  // Subsequent calls to return() return undefined
  const returned2 = await iterator.return(undefined);
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

  // Subsequent calls to return() return undefined
  const returned2 = await iterator.return();
  t.deepEqual(returned2, { value: undefined, done: true });

  // next() after return should still show done
  const afterReturn = await iterator.next();
  t.deepEqual(afterReturn, { value: undefined, done: true });
});

test('readPattern failure repeats the same terminal error', async t => {
  let returnCalled = false;

  async function* source() {
    try {
      yield harden({ type: 'a', count: 1 });
      yield harden({ type: 'b', count: 'not a number' });
      yield harden({ type: 'c', count: 3 });
    } finally {
      returnCalled = true;
    }
  }

  const readPattern = M.splitRecord({
    type: M.string(),
    count: M.number(),
  });
  const readerRef = readerFromIterator(source());
  const reader = iterateReader(readerRef, { readPattern });

  // First value is valid
  const r1 = await reader.next();
  t.false(r1.done);
  t.deepEqual(r1.value, { type: 'a', count: 1 });

  // Second value fails pattern validation
  const err1 = await t.throwsAsync(() => reader.next(), {
    message: /count/,
  });

  // After a validation failure, subsequent calls should repeat the error.
  const err2 = await t.throwsAsync(() => reader.next(), {
    message: /count/,
  });
  t.is(err2.message, err1.message);

  // Allow microtasks to settle for cleanup
  await delay(50);

  // The responder's source iterator should be cleaned up
  t.true(returnCalled);
});

test('terminal read errors repeat on subsequent next() calls', async t => {
  const readerRef = readerFromIterator([1, 'bad', 3]);
  const reader = iterateReader(readerRef, { readPattern: M.number() });

  const r1 = await reader.next();
  t.is(r1.value, 1);

  const err1 = await t.throwsAsync(() => reader.next(), {
    message: /number/,
  });
  const err2 = await t.throwsAsync(() => reader.next(), {
    message: /number/,
  });

  t.is(err2.message, err1.message);
});

test('terminal done values replay indefinitely with their final value', async t => {
  let calls = 0;
  const source = harden({
    async next() {
      calls += 1;
      if (calls === 1) {
        return harden({ value: 'first', done: false });
      }
      return harden({ value: 'final', done: true });
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  });

  const reader = iterateReader(readerFromIterator(source));

  const r1 = await reader.next();
  t.false(r1.done);
  t.is(r1.value, 'first');

  const r2 = await reader.next();
  t.true(r2.done);
  t.is(r2.value, 'final');

  const r3 = await reader.next();
  t.true(r3.done);
  t.is(r3.value, 'final');
});

test('iterateReader concurrent return() calls share terminal result', async t => {
  async function* source() {
    yield 1;
    yield 2;
  }

  const reader =
    /** @type {ReaderIterator<Passable, string>} */ (
      iterateReader(readerFromIterator(source()))
    );

  assert(reader.return, 'reader should have return method');
  const p1 = reader.return('first');
  const p2 = reader.return('second');

  const [r1, r2] = await Promise.all([p1, p2]);
  t.deepEqual(r1, { done: true, value: 'first' });
  t.deepEqual(r2, { done: true, value: 'first' });

  const r3 = await reader.next();
  t.deepEqual(r3, { done: true, value: 'first' });
});

test('syn chain rejection triggers iterator.return() on responder side', async t => {
  const { promise: returnCalledPromise, resolve: resolveReturnCalled } =
    makePromiseKit();

  const source = harden({
    async next() {
      return harden({ value: 'data', done: false });
    },
    async return() {
      resolveReturnCalled(true);
      return harden({ value: undefined, done: true });
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  });

  const readerRef = readerFromIterator(source);

  const { promise: synHead, resolve: synResolve } = makePromiseKit();
  const { promise: secondSyn, reject: rejectSecondSyn } = makePromiseKit();
  synResolve(harden({ value: undefined, promise: secondSyn }));

  const ackHead = await readerRef.stream(synHead);
  t.is(ackHead.value, 'data');

  rejectSecondSyn(Error('initiator aborted'));

  const ackPromise = /** @type {Promise<unknown>} */ (ackHead.promise);
  await t.throwsAsync(() => ackPromise, {
    message: /initiator aborted/,
  });

  const returnCalled = await Promise.race([
    returnCalledPromise,
    delay(200).then(() => false),
  ]);
  t.true(returnCalled);
});

test('readReturnPattern rejects undefined on early close', async t => {
  let returnCalled = false;
  const source = harden({
    async next() {
      t.fail('next should not be called');
      return harden({ value: 1, done: false });
    },
    async return() {
      returnCalled = true;
      return harden({ value: undefined, done: true });
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  });

  const readerRef = readerFromIterator(source, {
    readReturnPattern: M.number(),
  });

  const { promise: synHead, resolve: synResolve } = makePromiseKit();
  synResolve(harden({ value: undefined, promise: null }));

  await t.throwsAsync(() => readerRef.stream(synHead), {
    message: /number/,
  });
  t.true(returnCalled);
});

test('iterateReader return(value) matches local iterator behavior', async t => {
  const makeSource = () => {
    let seen;
    const iterator = harden(
      /** @type {AsyncIterator<number, string>} */ ({
        async next() {
          return harden({ value: 1, done: false });
        },
        async return(value) {
          seen = value;
          return harden({ value: `returned:${value}`, done: true });
        },
        [Symbol.asyncIterator]() {
          return this;
        },
      }),
    );
    return { iterator, getSeen: () => seen };
  };

  const exercise = async makeIterator => {
    await null;
    const iterator = makeIterator();
    return [await iterator.next(), await iterator.return('value')];
  };

  const localSource = makeSource();
  const localResults = await exercise(() => localSource.iterator);
  t.is(localSource.getSeen(), 'value');

  const remoteSource = makeSource();
  const remoteResults = await exercise(() =>
    iterateReader(readerFromIterator(remoteSource.iterator)),
  );
  t.is(remoteSource.getSeen(), 'value');

  t.deepEqual(remoteResults, localResults);
});

test('concurrent next() calls consume sequential values', async t => {
  const values = [1, 2, 3, 4, 5];
  const reader = iterateReader(readerFromIterator(values));

  const p1 = reader.next();
  const p2 = reader.next();

  const [r1, r2] = await Promise.all([p1, p2]);

  t.false(r1.done);
  t.false(r2.done);
  t.is(r1.value, 1);
  t.is(r2.value, 2);
});

test('iterateReader pre-resolves the syn pipeline to the buffer width', async t => {
  const buffer = 3;
  const { promise: inspected, resolve: resolveInspected } = makePromiseKit();

  const readerRef = Far('FakeReader', {
    async stream(synHead) {
      /** @type {StreamNode<undefined, Passable>} */
      let node = await synHead;

      for (let i = 1; i < buffer; i += 1) {
        const nextPromise = node.promise;
        if (nextPromise === null) {
          t.fail('expected buffered syn promise');
          return harden({ value: 'done', promise: null });
        }
        let resolved = false;
        nextPromise.then(() => {
          resolved = true;
        });
        await null;
        t.true(resolved);
        node = await nextPromise;
      }

      const tailPromise = node.promise;
      if (tailPromise === null) {
        t.fail('expected tail syn promise');
        return harden({ value: 'done', promise: null });
      }
      let tailResolved = false;
      tailPromise.then(() => {
        tailResolved = true;
      });
      await null;
      t.false(tailResolved);

      resolveInspected(true);
      return harden({ value: 'done', promise: null });
    },
    readPattern() {
      return undefined;
    },
    readReturnPattern() {
      return undefined;
    },
  });

  const reader = iterateReader(readerRef, { buffer });

  await inspected;

  const result = await reader.next();
  t.true(result.done);
  t.is(result.value, 'done');
});

test('readerFromIterator enforces local readPattern', async t => {
  const readerRef = readerFromIterator(['not a number'], {
    readPattern: M.number(),
  });
  const reader = iterateReader(readerRef);

  await t.throwsAsync(() => reader.next(), {
    message: /number/,
  });
});

test('iterateReader enforces local readPattern', async t => {
  const readerRef = readerFromIterator(['not a number']);
  const reader = iterateReader(readerRef, { readPattern: M.number() });

  await t.throwsAsync(() => reader.next(), {
    message: /number/,
  });
});

test('iterateReader uses its local readPattern over a remote advertised pattern', async t => {
  const readerRef = readerFromIterator(['not a number'], {
    readPattern: M.any(),
  });
  const reader = iterateReader(readerRef, { readPattern: M.number() });

  await t.throwsAsync(() => reader.next(), {
    message: /number/,
  });
});

test('iterateReader uses its local readPattern when both patterns allow the value', async t => {
  const readerRef = readerFromIterator([42], {
    readPattern: M.any(),
  });
  const reader = iterateReader(readerRef, { readPattern: M.number() });

  const r1 = await reader.next();
  t.false(r1.done);
  t.is(r1.value, 42);
});

test('readerFromIterator applies readReturnPattern on natural completion', async t => {
  async function* source() {
    yield 1;
    return 7;
  }

  const readerRef = readerFromIterator(source(), {
    readReturnPattern: M.number(),
  });
  const reader = iterateReader(readerRef);

  const r1 = await reader.next();
  t.false(r1.done);
  t.is(r1.value, 1);

  const r2 = await reader.next();
  t.true(r2.done);
  t.is(r2.value, 7);
});

test('iterateReader rejects invalid readReturnPattern on natural completion', async t => {
  async function* source() {
    yield 1;
    return 'bad';
  }

  const reader = iterateReader(readerFromIterator(source()), {
    readReturnPattern: M.number(),
  });

  const r1 = await reader.next();
  t.false(r1.done);
  t.is(r1.value, 1);

  const err1 = await t.throwsAsync(() => reader.next(), {
    message: /number/,
  });
  const err2 = await t.throwsAsync(() => reader.next(), {
    message: /number/,
  });
  t.is(err2.message, err1.message);
});

test('iterateReader return() drains ack chain and enforces readReturnPattern', async t => {
  const { promise: ackPromise, resolve: resolveAck } = makePromiseKit();

  const fakeReader = Far('FakeReader', {
    async stream(_synHead) {
      return harden({ value: 'data', promise: ackPromise });
    },
    readPattern() {
      return undefined;
    },
    readReturnPattern() {
      return undefined;
    },
  });

  const reader = iterateReader(fakeReader, { readReturnPattern: M.string() });

  assert(reader.return, 'reader should have return method');
  const returnPromise = reader.return('bye');
  resolveAck(harden({ value: 'terminal', promise: null }));

  const result = await returnPromise;
  t.deepEqual(result, { done: true, value: 'terminal' });
});

test('iterateReader throw() closes syn chain', async t => {
  const { promise: streamCalled, resolve: resolveStreamCalled } =
    makePromiseKit();
  /** @type {Promise<StreamNode<undefined, Passable>>} */
  let capturedSynHead = Promise.resolve(
    harden({ value: undefined, promise: null }),
  );

  const fakeReader = Far('FakeReader', {
    async stream(synHead) {
      capturedSynHead = synHead;
      resolveStreamCalled(true);
      return harden({ value: 'data', promise: null });
    },
    readPattern() {
      return undefined;
    },
    readReturnPattern() {
      return undefined;
    },
  });

  const reader = iterateReader(fakeReader);
  await streamCalled;

  await t.throwsAsync(() => reader.throw(new Error('boom')), {
    message: 'boom',
  });

  const synNode = await capturedSynHead;
  t.is(synNode.promise, null);
  t.is(synNode.value, undefined);
});
