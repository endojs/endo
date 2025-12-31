import test from '@endo/ses-ava/prepare-endo.js';

import { makeLoopback } from '@endo/captp';
import { streamIterator } from '../stream-iterator.js';
import { iterateStream } from '../iterate-stream.js';
import { streamBytesIterator } from '../stream-bytes-iterator.js';
import { iterateBytesStream } from '../iterate-bytes-stream.js';

// Test passable stream over CapTP membrane
test('captp: single-item passable stream', async t => {
  const { makeFar } = makeLoopback('test');

  async function* singleItem() {
    yield harden({ type: 'message', text: 'hello' });
  }

  // Create stream on "remote" side
  const localStream = streamIterator(singleItem());
  const remoteStream = await makeFar(localStream);

  // Consume on "local" side through CapTP
  const reader = iterateStream(remoteStream);

  const result1 = await reader.next();
  t.false(result1.done);
  t.deepEqual(result1.value, { type: 'message', text: 'hello' });

  const result2 = await reader.next();
  t.true(result2.done);
});

// Test empty stream over CapTP
test('captp: empty passable stream', async t => {
  const { makeFar } = makeLoopback('test');

  async function* emptyIterator() {
    // yields nothing
  }

  const localStream = streamIterator(emptyIterator());
  const remoteStream = await makeFar(localStream);

  const reader = iterateStream(remoteStream);

  const results = [];
  for await (const value of reader) {
    results.push(value);
  }

  t.is(results.length, 0);
});

// Test multi-item stream over CapTP
test('captp: multi-item passable stream', async t => {
  const { makeFar } = makeLoopback('test');

  async function* multiItem() {
    yield harden({ n: 1 });
    yield harden({ n: 2 });
    yield harden({ n: 3 });
  }

  const localStream = streamIterator(multiItem());
  const remoteStream = await makeFar(localStream);

  const reader = iterateStream(remoteStream);

  const results = [];
  for await (const value of reader) {
    results.push(value);
  }

  t.deepEqual(results, [{ n: 1 }, { n: 2 }, { n: 3 }]);
});

// Test bytes stream over CapTP
test('captp: bytes stream', async t => {
  const { makeFar } = makeLoopback('test');

  const chunks = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])];

  const localStream = streamBytesIterator(chunks);
  const remoteStream = await makeFar(localStream);

  const reader = await iterateBytesStream(remoteStream);

  const results = [];
  for await (const chunk of reader) {
    results.push(chunk);
  }

  t.is(results.length, 2);
  t.deepEqual(results[0], new Uint8Array([1, 2, 3]));
  t.deepEqual(results[1], new Uint8Array([4, 5, 6]));
});

// Test stream with buffering over CapTP
test('captp: stream with buffer', async t => {
  const { makeFar } = makeLoopback('test');

  async function* items() {
    yield harden({ n: 1 });
    yield harden({ n: 2 });
    yield harden({ n: 3 });
  }

  const localStream = streamIterator(items());
  const remoteStream = await makeFar(localStream);

  const reader = iterateStream(remoteStream, { buffer: 3 });

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

  const localStream = streamIterator(manyItems());
  const remoteStream = await makeFar(localStream);

  const reader = iterateStream(remoteStream);

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
  // @ts-expect-error - Testing runtime behavior: return() without args
  await reader.return();

  // Producer should not have yielded all 100 items
  t.true(yielded < 100);
});
