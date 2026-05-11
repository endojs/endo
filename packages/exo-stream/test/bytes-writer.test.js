// @ts-check
import test from '@endo/ses-ava/prepare-endo.js';
import { makePromiseKit } from '@endo/promise-kit';
import { Far } from '@endo/far';
import { setTimeout as delay } from 'node:timers/promises';

import { makePipe } from '@endo/stream';
import { bytesWriterFromIterator } from '../bytes-writer-from-iterator.js';
import { iterateBytesWriter } from '../iterate-bytes-writer.js';

/** @import { BytesWriterIterator, PassableBytesWriter, StreamNode } from '../types.js' */

const writeAll = async (writer, iterable) => {
  for await (const value of iterable) {
    await writer.next(value);
  }
  return writer.return();
};

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

  const writer = iterateBytesWriter(writerRef);
  const sendDone = writeAll(writer, localIterator());

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

  const writer = iterateBytesWriter(writerRef);
  const sendDone = writeAll(writer, emptyIterator());

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

  const writer = iterateBytesWriter(writerRef, { buffer: 2 });
  const sendDone = writeAll(writer, source());

  const results = [];
  for await (const value of pipeReader) {
    results.push(value);
  }

  await sendDone;

  t.is(results.length, messages.length);
});

test('bytes writer many messages', async t => {
  const count = 50;
  const messages = Array.from(
    { length: count },
    (_, i) => new Uint8Array([i, i + 1, i + 2]),
  );

  const [pipeReader, pipeWriter] = makePipe();
  const writerRef = bytesWriterFromIterator(pipeWriter);

  const writer = iterateBytesWriter(writerRef);
  const sendDone = writeAll(writer, messages);

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
  const [, pipeWriter] = makePipe();
  const writerRef = bytesWriterFromIterator(pipeWriter, {
    writeReturnPattern: undefined,
  });

  t.is(writerRef.writeReturnPattern(), undefined);
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

  const writer = iterateBytesWriter(writerRef);
  const sendDone = writeAll(writer, [largeChunk]);

  const results = [];
  for await (const value of pipeReader) {
    results.push(value);
  }

  await sendDone;

  t.is(results.length, 1);
  t.deepEqual(results[0], largeChunk);
});

test('bytes writer fallback return when sink lacks return', async t => {
  const sink = {
    async next(_value) {
      return { done: false, value: undefined };
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };

  const writerRef = /** @type {PassableBytesWriter<string | undefined>} */ (
    bytesWriterFromIterator(sink)
  );

  /** @type {Promise<StreamNode<string, string | undefined>>} */
  const synHead = Promise.resolve(harden({ value: 'done', promise: null }));
  /** @type {StreamNode<undefined, string | undefined>} */
  const ackHead = await writerRef.streamBase64(synHead);

  t.is(ackHead.promise, null);
  t.is(ackHead.value, undefined);
});

test('bytes writer returns completion value from sink return', async t => {
  const sink = {
    async next(_value) {
      return { done: false, value: undefined };
    },
    async return(value) {
      return { done: true, value };
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };

  const writerRef = /** @type {PassableBytesWriter<string>} */ (
    bytesWriterFromIterator(sink)
  );

  /** @type {Promise<StreamNode<string, string>>} */
  const synHead = Promise.resolve(harden({ value: 'done', promise: null }));
  /** @type {StreamNode<undefined, string>} */
  const ackHead = await writerRef.streamBase64(synHead);

  t.is(ackHead.promise, null);
  t.is(ackHead.value, 'done');
});

test('iterateBytesWriter pre-buffered send resolves before ack', async t => {
  const { promise: ackPromise, resolve: resolveAck } = makePromiseKit();

  const fakeWriter = Far('FakeBytesWriter', {
    async streamBase64(_synHead) {
      return ackPromise;
    },
    writeReturnPattern() {
      return undefined;
    },
  });

  const writer = iterateBytesWriter(fakeWriter, { buffer: 1 });

  const nextPromise = writer.next(new Uint8Array([1]));
  const settledEarly = await Promise.race([
    nextPromise.then(() => true),
    delay(50).then(() => false),
  ]);
  t.true(settledEarly);

  const returnPromise = writer.return();
  resolveAck(harden({ value: 'terminal', promise: null }));

  const result = await returnPromise;
  t.deepEqual(result, { done: true, value: 'terminal' });
});

test('iterateBytesWriter returns done when responder closes early', async t => {
  const fakeWriter = Far('FakeBytesWriter', {
    async streamBase64(_synHead) {
      return harden({ value: 'closed', promise: null });
    },
    writeReturnPattern() {
      return undefined;
    },
  });

  const writer = /** @type {BytesWriterIterator<string>} */ (
    iterateBytesWriter(fakeWriter)
  );
  const result = await writer.next(new Uint8Array([1]));

  t.true(result.done);
  t.is(result.value, 'closed');
});

test('iterateBytesWriter return() is idempotent', async t => {
  const { promise: ackPromise, resolve: resolveAck } = makePromiseKit();

  const fakeWriter = Far('FakeBytesWriter', {
    async streamBase64(_synHead) {
      return ackPromise;
    },
    writeReturnPattern() {
      return undefined;
    },
  });

  const writer = /** @type {BytesWriterIterator<string>} */ (
    iterateBytesWriter(fakeWriter)
  );

  const p1 = writer.return('first');
  const p2 = writer.return('second');

  resolveAck(harden({ value: 'terminal', promise: null }));

  const [r1, r2] = await Promise.all([p1, p2]);
  t.deepEqual(r1, { done: true, value: 'terminal' });
  t.deepEqual(r2, { done: true, value: 'terminal' });
});

test('iterateBytesWriter next() replays terminal result after return()', async t => {
  const { promise: ackPromise, resolve: resolveAck } = makePromiseKit();

  const fakeWriter = Far('FakeBytesWriter', {
    async streamBase64(_synHead) {
      return ackPromise;
    },
    writeReturnPattern() {
      return undefined;
    },
  });

  const writer = /** @type {BytesWriterIterator<string>} */ (
    iterateBytesWriter(fakeWriter)
  );

  const returnPromise = writer.return('done');
  resolveAck(harden({ value: 'terminal', promise: null }));

  const result = await returnPromise;
  const nextResult = await writer.next(new Uint8Array([1]));

  t.deepEqual(nextResult, result);
});

test('iterateBytesWriter rejects ack errors and repeats the error', async t => {
  const { promise: ackPromise, reject: rejectAck } = makePromiseKit();

  const fakeWriter = Far('FakeBytesWriter', {
    async streamBase64(_synHead) {
      return ackPromise;
    },
    writeReturnPattern() {
      return undefined;
    },
  });

  const writer = /** @type {BytesWriterIterator<undefined>} */ (
    iterateBytesWriter(fakeWriter)
  );

  const nextPromise = writer.next(new Uint8Array([1]));
  rejectAck(new Error('ack failed'));

  const err1 = await t.throwsAsync(() => nextPromise, {
    message: 'ack failed',
  });
  const err2 = await t.throwsAsync(() => writer.next(new Uint8Array([2])), {
    message: 'ack failed',
  });
  t.is(err2.message, err1.message);
});

test('iterateBytesWriter throw() is idempotent', async t => {
  const fakeWriter = Far('FakeBytesWriter', {
    async streamBase64(_synHead) {
      return harden({ value: undefined, promise: null });
    },
    writeReturnPattern() {
      return undefined;
    },
  });

  const writer = /** @type {BytesWriterIterator<undefined>} */ (
    iterateBytesWriter(fakeWriter)
  );
  const error = new Error('boom');

  await t.throwsAsync(() => writer.throw(error), { message: 'boom' });
  await t.throwsAsync(() => writer.throw(error), { message: 'boom' });
});

test('iterateBytesWriter is async iterable', async t => {
  const fakeWriter = Far('FakeBytesWriter', {
    async streamBase64(_synHead) {
      return harden({ value: undefined, promise: null });
    },
    writeReturnPattern() {
      return undefined;
    },
  });

  const writer = iterateBytesWriter(fakeWriter);
  t.is(writer[Symbol.asyncIterator](), writer);
});
