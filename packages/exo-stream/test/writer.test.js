// @ts-check
/* eslint-disable no-await-in-loop */
import test from '@endo/ses-ava/prepare-endo.js';
import { M } from '@endo/patterns';
import { makePromiseKit } from '@endo/promise-kit';
import { Far } from '@endo/far';
import { setTimeout as delay } from 'node:timers/promises';

import { makePipe } from '@endo/stream';
import { writerFromIterator } from '../writer-from-iterator.js';
import { iterateWriter } from '../iterate-writer.js';

/** @import { Passable } from '@endo/pass-style' */
/** @import { PassableWriter, StreamNode, WriterIterator } from '../types.js' */

const writeAll = async (writer, iterable) => {
  for await (const value of iterable) {
    await writer.next(value);
  }
  return writer.return();
};

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
  const writer = iterateWriter(writerRef);
  const sendDone = writeAll(writer, localIterator());

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

  const writer = iterateWriter(writerRef);
  const sendDone = writeAll(writer, emptyIterator());

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

  const writer = iterateWriter(writerRef, { buffer: 2 });
  const sendDone = writeAll(writer, source());

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

  const writer = iterateWriter(writerRef);
  const sendDone = writeAll(writer, values);

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

test('iterateWriter returns done when responder closes', async t => {
  const fakeWriter = Far('FakeWriter', {
    async stream(_synHead) {
      return harden({ value: 'closed', promise: null });
    },
    writePattern() {
      return undefined;
    },
    writeReturnPattern() {
      return undefined;
    },
  });

  const writer = /** @type {WriterIterator<Passable, string>} */ (
    iterateWriter(fakeWriter)
  );
  const result = await writer.next(1);

  t.true(result.done);
  t.is(result.value, 'closed');
});

test('iterateWriter validates writeReturnPattern on terminal ack', async t => {
  const fakeWriter = Far('FakeWriter', {
    async stream(_synHead) {
      return harden({ value: 'terminal', promise: null });
    },
    writePattern() {
      return undefined;
    },
    writeReturnPattern() {
      return undefined;
    },
  });

  const writer = iterateWriter(fakeWriter, { writeReturnPattern: M.string() });
  const result = await writer.next(1);

  t.true(result.done);
  t.is(result.value, 'terminal');
});

test('iterateWriter concurrent return() calls share terminal result', async t => {
  const { promise: ackPromise, resolve: resolveAck } = makePromiseKit();

  const fakeWriter = Far('FakeWriter', {
    async stream(_synHead) {
      return ackPromise;
    },
    writePattern() {
      return undefined;
    },
    writeReturnPattern() {
      return undefined;
    },
  });

  const writer = /** @type {WriterIterator<Passable, string>} */ (
    iterateWriter(fakeWriter)
  );

  const p1 = writer.return('first');
  const p2 = writer.return('second');

  resolveAck(harden({ value: 'terminal', promise: null }));

  const [r1, r2] = await Promise.all([p1, p2]);
  t.deepEqual(r1, { done: true, value: 'terminal' });
  t.deepEqual(r2, { done: true, value: 'terminal' });
});

test('iterateWriter return() is idempotent', async t => {
  const { promise: ackPromise, resolve: resolveAck } = makePromiseKit();

  const fakeWriter = Far('FakeWriter', {
    async stream(_synHead) {
      return ackPromise;
    },
    writePattern() {
      return undefined;
    },
    writeReturnPattern() {
      return undefined;
    },
  });

  const writer = /** @type {WriterIterator<Passable, string>} */ (
    iterateWriter(fakeWriter)
  );

  const p1 = writer.return('first');
  const p2 = writer.return('second');

  resolveAck(harden({ value: 'terminal', promise: null }));

  const [r1, r2] = await Promise.all([p1, p2]);
  t.deepEqual(r1, { done: true, value: 'terminal' });
  t.deepEqual(r2, { done: true, value: 'terminal' });
});

test('iterateWriter next() replays terminal result after return()', async t => {
  const { promise: ackPromise, resolve: resolveAck } = makePromiseKit();

  const fakeWriter = Far('FakeWriter', {
    async stream(_synHead) {
      return ackPromise;
    },
    writePattern() {
      return undefined;
    },
    writeReturnPattern() {
      return undefined;
    },
  });

  const writer = /** @type {WriterIterator<Passable, string>} */ (
    iterateWriter(fakeWriter)
  );

  const returnPromise = writer.return('done');
  resolveAck(harden({ value: 'terminal', promise: null }));

  const result = await returnPromise;
  const nextResult = await writer.next(1);

  t.deepEqual(nextResult, result);
});

test('iterateWriter throw() is idempotent', async t => {
  const fakeWriter = Far('FakeWriter', {
    async stream(_synHead) {
      return harden({ value: undefined, promise: null });
    },
    writePattern() {
      return undefined;
    },
    writeReturnPattern() {
      return undefined;
    },
  });

  const writer = /** @type {WriterIterator<Passable, undefined>} */ (
    iterateWriter(fakeWriter)
  );
  const error = new Error('boom');

  await t.throwsAsync(() => writer.throw(error), { message: 'boom' });
  await t.throwsAsync(() => writer.throw(error), { message: 'boom' });
});
test('iterateWriter return waits for terminal ack', async t => {
  const { promise: gate, resolve: openGate } = makePromiseKit();

  const fakeWriter = Far('FakeWriter', {
    async stream(_synHead) {
      return gate;
    },
    writePattern() {
      return undefined;
    },
    writeReturnPattern() {
      return undefined;
    },
  });

  const writer = /** @type {WriterIterator<Passable, string>} */ (
    iterateWriter(fakeWriter)
  );
  const returnPromise = writer.return('done');

  let settled = false;
  returnPromise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );

  await null;
  t.false(settled);

  openGate(harden({ value: 'final', promise: null }));

  const result = await returnPromise;
  t.deepEqual(result, { done: true, value: 'final' });
});

test('iterateWriter rejects undefined when writeReturnPattern disallows it', async t => {
  const fakeWriter = Far('FakeWriter', {
    async stream(_synHead) {
      return harden({ value: undefined, promise: null });
    },
    writePattern() {
      return undefined;
    },
    writeReturnPattern() {
      return undefined;
    },
  });

  const writer = iterateWriter(fakeWriter, { writeReturnPattern: M.number() });

  await t.throwsAsync(() => writer.return(undefined), {
    message: /number/,
  });
});

test('iterateWriter hardens syn nodes before sending', async t => {
  async function* source() {
    yield harden({ nested: harden({ inner: 1 }) });
    yield { nested: { inner: 2 } };
    yield harden({ nested: { inner: 3 } });
  }

  const values = [];
  const { promise: sawSyn, resolve: resolveSawSyn } = makePromiseKit();

  const fakeWriter = Far('FakeWriter', {
    async stream(synHead) {
      const drain = (async () => {
        let node = await synHead;
        while (node.promise !== null) {
          values.push(node.value);
          node = await node.promise;
        }
        resolveSawSyn(true);
      })();
      drain.catch(() => undefined);
      return harden({ value: undefined, promise: null });
    },
    writePattern() {
      return undefined;
    },
    writeReturnPattern() {
      return undefined;
    },
  });

  const writer = iterateWriter(fakeWriter, { buffer: 10 });
  await writeAll(writer, source());
  await sawSyn;

  t.is(values.length, 3);
  t.true(Object.isFrozen(values[0]));
  t.true(Object.isFrozen(values[0].nested));
  t.true(Object.isFrozen(values[1]));
  t.true(Object.isFrozen(values[1].nested));
  t.true(Object.isFrozen(values[2]));
  t.true(Object.isFrozen(values[2].nested));
});

test('writerFromIterator enforces local writePattern', async t => {
  const received = [];
  const sink = harden({
    async next(value) {
      if (value !== undefined) {
        received.push(value);
      }
      return harden({ value: undefined, done: false });
    },
    async return() {
      return harden({ value: undefined, done: true });
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  });

  const writerRef = writerFromIterator(sink, { writePattern: M.number() });

  const writer = iterateWriter(writerRef);
  await t.throwsAsync(() => writer.next('not a number'), {
    message: /number/,
  });

  t.is(received.length, 0);
});

test('iterateWriter enforces local writePattern', async t => {
  const received = [];
  const sink = harden({
    async next(value) {
      if (value !== undefined) {
        received.push(value);
      }
      return harden({ value: undefined, done: false });
    },
    async return() {
      return harden({ value: undefined, done: true });
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  });

  const writerRef = writerFromIterator(sink);

  const writer = iterateWriter(writerRef, { writePattern: M.number() });
  await t.throwsAsync(() => writer.next('not a number'), {
    message: /number/,
  });

  t.is(received.length, 0);
});

test('iterateWriter uses its local writePattern over a remote advertised pattern', async t => {
  const received = [];
  const sink = harden({
    async next(value) {
      if (value !== undefined) {
        received.push(value);
      }
      return harden({ value: undefined, done: false });
    },
    async return() {
      return harden({ value: undefined, done: true });
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  });

  const writerRef = writerFromIterator(sink, { writePattern: M.any() });

  const writer = iterateWriter(writerRef, { writePattern: M.number() });
  await t.throwsAsync(() => writer.next('not a number'), {
    message: /number/,
  });

  t.is(received.length, 0);
});

test('iterateWriter uses its local writePattern when both patterns allow the value', async t => {
  const received = [];
  const sink = harden({
    async next(value) {
      if (value !== undefined) {
        received.push(value);
      }
      return harden({ value: undefined, done: false });
    },
    async return() {
      return harden({ value: undefined, done: true });
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  });

  const writerRef = writerFromIterator(sink, { writePattern: M.any() });

  const writer = iterateWriter(writerRef, { writePattern: M.number() });
  await writer.next(42);
  await writer.return();

  t.deepEqual(received, [42]);
});

test('iterateWriter validates writeReturnPattern with buffered sends', async t => {
  const { promise: ackPromise, resolve: resolveAck } = makePromiseKit();

  const fakeWriter = Far('FakeWriter', {
    async stream(_synHead) {
      return ackPromise;
    },
    writePattern() {
      return undefined;
    },
    writeReturnPattern() {
      return undefined;
    },
  });

  const writer = /** @type {WriterIterator<Passable, string>} */ (
    iterateWriter(fakeWriter, {
      buffer: 1,
      writeReturnPattern: M.string(),
    })
  );

  const nextPromise = writer.next(1);
  const settledEarly = await Promise.race([
    nextPromise.then(() => true),
    delay(50).then(() => false),
  ]);
  t.true(settledEarly);

  const returnPromise = writer.return('done');
  resolveAck(harden({ value: 'terminal', promise: null }));

  const result = await returnPromise;
  t.deepEqual(result, { done: true, value: 'terminal' });
});

test('iterateWriter validates writePattern in pre-buffer branch', async t => {
  const { promise: ackPromise, resolve: resolveAck } = makePromiseKit();

  const fakeWriter = Far('FakeWriter', {
    async stream(_synHead) {
      return ackPromise;
    },
    writePattern() {
      return undefined;
    },
    writeReturnPattern() {
      return undefined;
    },
  });

  const writer = iterateWriter(fakeWriter, {
    buffer: 1,
    writePattern: M.number(),
  });

  await t.throwsAsync(() => writer.next('not a number'), {
    message: /number/,
  });

  resolveAck(harden({ value: undefined, promise: null }));
});

test('iterateWriter throw() closes the stream', async t => {
  const { promise: streamCalled, resolve: resolveStreamCalled } =
    makePromiseKit();
  /** @type {Promise<StreamNode<Passable, undefined>>} */
  let capturedSynHead = Promise.resolve(
    harden({ value: undefined, promise: null }),
  );

  const fakeWriter = Far('FakeWriter', {
    async stream(synHead) {
      capturedSynHead = synHead;
      resolveStreamCalled(true);
      return harden({ value: undefined, promise: null });
    },
    writePattern() {
      return undefined;
    },
    writeReturnPattern() {
      return undefined;
    },
  });

  const writer = /** @type {WriterIterator<Passable, undefined>} */ (
    iterateWriter(fakeWriter)
  );
  await streamCalled;

  await t.throwsAsync(() => writer.throw(new Error('boom')), {
    message: 'boom',
  });

  const synNode = await capturedSynHead;
  t.is(synNode.promise, null);
  t.is(synNode.value, undefined);
});

test('iterateWriter is async iterable', async t => {
  const fakeWriter = Far('FakeWriter', {
    async stream(_synHead) {
      return harden({ value: undefined, promise: null });
    },
    writePattern() {
      return undefined;
    },
    writeReturnPattern() {
      return undefined;
    },
  });

  const writer = iterateWriter(fakeWriter);
  t.is(writer[Symbol.asyncIterator](), writer);
});

test('writerFromIterator enforces writeReturnPattern on early close', async t => {
  /** @type {number | undefined} */
  let returnedValue;
  const sink = harden({
    async next(_value) {
      return { done: false, value: undefined };
    },
    async return(value) {
      returnedValue = value;
      return { done: true, value };
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  });

  const writerRef = /** @type {PassableWriter<Passable, number>} */ (
    writerFromIterator(sink, {
      writeReturnPattern: M.number(),
    })
  );

  /** @type {Promise<StreamNode<Passable, number>>} */
  const synHead = Promise.resolve(harden({ value: 123, promise: null }));
  /** @type {StreamNode<undefined, number>} */
  const ackHead = await writerRef.stream(synHead);

  t.is(ackHead.promise, null);
  t.is(ackHead.value, 123);
  t.is(returnedValue, 123);
});
