// @ts-check
import test from '@endo/ses-ava/prepare-endo.js';
import { M } from '@endo/patterns';
import { makePromiseKit } from '@endo/promise-kit';
import { Far } from '@endo/far';
import assert from 'node:assert/strict';

import { bytesReaderFromIterator } from '../bytes-reader-from-iterator.js';
import { iterateBytesReader } from '../iterate-bytes-reader.js';

/** @import { ERef } from '@endo/far' */
/** @import { Passable } from '@endo/pass-style' */
/** @import { PassableBytesReader, StreamNode } from '../types.js' */

test('bytes reader exposes readReturnPattern', async t => {
  const readReturnPattern = M.string();
  const readerRef = bytesReaderFromIterator([], { readReturnPattern });

  t.is(readerRef.readReturnPattern(), readReturnPattern);
});

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

test('iterateBytesReader applies readReturnPattern on terminal value', async t => {
  const fakeReader =
    /** @type {PassableBytesReader<string>} */ (
      Far('FakeBytesReader', {
        async streamBase64(_synHead) {
          return harden({ value: 'Zg==', promise: null });
        },
        readReturnPattern() {
          return undefined;
        },
      })
    );

  const reader = iterateBytesReader(fakeReader, {
    readReturnPattern: M.string(),
  });

  const result = await reader.next();
  t.true(result.done);
  t.is(result.value, 'Zg==');
});

test('iterateBytesReader rejects invalid readReturnPattern on natural completion', async t => {
  const fakeReader =
    /** @type {PassableBytesReader<string>} */ (
      Far('FakeBytesReader', {
        async streamBase64(_synHead) {
          return harden({ value: 'not a number', promise: null });
        },
        readReturnPattern() {
          return undefined;
        },
      })
    );

  const reader = iterateBytesReader(fakeReader, { readReturnPattern: M.number() });

  const err1 = await t.throwsAsync(() => reader.next(), {
    message: /number/,
  });
  const err2 = await t.throwsAsync(() => reader.next(), {
    message: /number/,
  });
  t.is(err2.message, err1.message);
});

test('iterateBytesReader return() drains ack chain and enforces readReturnPattern', async t => {
  const { promise: ackPromise, resolve: resolveAck } = makePromiseKit();

  const fakeReader =
    /** @type {PassableBytesReader<string>} */ (
      Far('FakeBytesReader', {
        async streamBase64(_synHead) {
          return harden({ value: 'first', promise: ackPromise });
        },
        readReturnPattern() {
          return undefined;
        },
      })
    );

  const reader = iterateBytesReader(fakeReader, { readReturnPattern: M.string() });

  assert(reader.return, 'reader should have return method');
  const returnPromise = reader.return('bye');
  resolveAck(harden({ value: 'terminal', promise: null }));

  const result = await returnPromise;
  t.deepEqual(result, { done: true, value: 'terminal' });
});

test('iterateBytesReader return() closes syn chain', async t => {
  const { promise: streamCalled, resolve: resolveStreamCalled } =
    makePromiseKit();
  /** @type {ERef<StreamNode<Passable, string>> | undefined} */
  let capturedSynHead;

  const fakeReader =
    /** @type {PassableBytesReader<string>} */ (
      Far('FakeBytesReader', {
        async streamBase64(synHead) {
          capturedSynHead = synHead;
          resolveStreamCalled(true);
          return harden({ value: 'Zg==', promise: null });
        },
        readReturnPattern() {
          return undefined;
        },
      })
    );

  const reader = iterateBytesReader(fakeReader);
  await streamCalled;

  assert(capturedSynHead, 'syn head should be captured');
  assert(reader.return, 'reader should have return method');
  const result = await reader.return('bye');
  t.deepEqual(result, { done: true, value: 'Zg==' });

  const synNode = await capturedSynHead;
  t.is(synNode.promise, null);
  t.is(synNode.value, 'bye');
});

test('iterateBytesReader throw() closes syn chain', async t => {
  const { promise: streamCalled, resolve: resolveStreamCalled } =
    makePromiseKit();
  /** @type {ERef<StreamNode<Passable, undefined>> | undefined} */
  let capturedSynHead;

  const fakeReader =
    /** @type {PassableBytesReader<undefined>} */ (
      Far('FakeBytesReader', {
        async streamBase64(synHead) {
          capturedSynHead = synHead;
          resolveStreamCalled(true);
          return harden({ value: undefined, promise: null });
        },
        readReturnPattern() {
          return undefined;
        },
      })
    );

  const reader = iterateBytesReader(fakeReader);
  await streamCalled;

  assert(capturedSynHead, 'syn head should be captured');
  await t.throwsAsync(() => reader.throw(new Error('boom')), {
    message: 'boom',
  });

  const synNode = await capturedSynHead;
  t.is(synNode.promise, null);
  t.is(synNode.value, undefined);
});

test('iterateBytesReader rejects invalid base64 and repeats the error', async t => {
  const { promise: ackPromise, resolve: resolveAck } = makePromiseKit();

  const fakeReader =
    /** @type {PassableBytesReader<undefined>} */ (
      Far('FakeBytesReader', {
        async streamBase64(_synHead) {
          resolveAck(harden({ value: 'Zg==', promise: null }));
          return harden({ value: '!', promise: ackPromise });
        },
        readReturnPattern() {
          return undefined;
        },
      })
    );

  const reader = iterateBytesReader(fakeReader);

  const err1 = await t.throwsAsync(() => reader.next());
  const err2 = await t.throwsAsync(() => reader.next());
  t.is(err2.message, err1.message);
});
