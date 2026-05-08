// @ts-check

import test from '@endo/ses-ava/test.js';
import { makeQueue } from '@endo/stream';
import { makeNetstringReader, makeNetstringWriter } from '@endo/netstring';

/**
 * A minimal ack-less byte pipe for test-driving `@endo/netstring` over
 * a raw byte stream with deterministic chunk boundaries. `makeWriter`
 * yields a `Writer<Uint8Array>` whose `next(chunk)` hands `chunk` to
 * the reader verbatim, no splitting or coalescing.
 */
const makeBytePipe = () => {
  /** @type {import('@endo/stream').AsyncQueue<IteratorResult<Uint8Array, undefined>>} */
  const queue = makeQueue();
  let closed = false;

  /** @type {import('@endo/stream').Writer<Uint8Array>} */
  const writer = {
    async next(value) {
      if (closed) return { done: true, value: undefined };
      queue.put({ done: false, value });
      return { done: false, value: undefined };
    },
    async return() {
      closed = true;
      queue.put({ done: true, value: undefined });
      return { done: true, value: undefined };
    },
    async throw(error) {
      closed = true;
      queue.put(Promise.reject(error));
      throw error;
    },
    [Symbol.asyncIterator]() {
      return writer;
    },
  };

  /** @type {import('@endo/stream').Reader<Uint8Array>} */
  const reader = {
    next: () => queue.get(),
    async return() {
      closed = true;
      return { done: true, value: undefined };
    },
    async throw(error) {
      closed = true;
      throw error;
    },
    [Symbol.asyncIterator]() {
      return reader;
    },
  };

  return { writer, reader };
};

/**
 * Hand-encode a single netstring (prefix + payload + comma) as raw
 * bytes, matching what `makeNetstringWriter` would have produced. Lets
 * the test split the wire bytes wherever it wants without relying on
 * the writer's internal chunking behavior.
 *
 * @param {Uint8Array} payload
 */
const netstringBytes = payload => {
  const prefix = `${payload.length}:`;
  const out = new Uint8Array(prefix.length + payload.length + 1);
  for (let i = 0; i < prefix.length; i += 1) {
    out[i] = prefix.charCodeAt(i);
  }
  out.set(payload, prefix.length);
  out[out.length - 1] = ','.charCodeAt(0);
  return out;
};

test('netstring reader reassembles a message split across many chunks', async t => {
  // Build a 5-byte netstring and deliver it one byte at a time over
  // the raw pipe: the length prefix, the data, and the terminating
  // comma all land separately.
  const { writer: raw, reader: rawReader } = makeBytePipe();
  const framed = makeNetstringReader(rawReader);

  const wire = netstringBytes(new TextEncoder().encode('hello'));
  t.true(wire.length >= 8, 'wire bytes include prefix, data, and comma');

  // Pump bytes in one-at-a-time without awaiting between writes so the
  // reader sees fragmentation that only a framer could reassemble.
  const writes = [];
  for (let i = 0; i < wire.length; i += 1) {
    writes.push(raw.next(wire.subarray(i, i + 1)));
  }
  await Promise.all(writes);
  await raw.return(undefined);

  const first = await framed.next(undefined);
  t.false(first.done);
  if (!first.done) {
    t.is(new TextDecoder().decode(first.value), 'hello');
  }
});

test('netstring reader delimits two back-to-back messages sharing one raw chunk', async t => {
  const { writer: raw, reader: rawReader } = makeBytePipe();
  const framed = makeNetstringReader(rawReader);

  const a = netstringBytes(new TextEncoder().encode('alpha'));
  const b = netstringBytes(new TextEncoder().encode('bravo'));
  const merged = new Uint8Array(a.length + b.length);
  merged.set(a, 0);
  merged.set(b, a.length);

  // Deliver both messages in a single raw chunk; the reader must
  // still emit them as two distinct frames.
  await raw.next(merged);
  await raw.return(undefined);

  const first = await framed.next(undefined);
  const second = await framed.next(undefined);
  t.false(first.done);
  t.false(second.done);
  if (!first.done && !second.done) {
    t.is(new TextDecoder().decode(first.value), 'alpha');
    t.is(new TextDecoder().decode(second.value), 'bravo');
  }
});

test('netstring writer round-trip reassembles a large message split by the network', async t => {
  // Write a 16 KB message, then hand the raw bytes to the reader a
  // few hundred bytes at a time to simulate TCP fragmentation.
  const { writer: raw, reader: rawReader } = makeBytePipe();
  const framed = makeNetstringReader(rawReader);

  // Collect writer output by using a second pipe: the writer writes
  // into `collect`, we pull bytes out of `collectReader`, then push
  // them fragmented into `raw`.
  const { writer: collect, reader: collectReader } = makeBytePipe();
  const framedWriter = makeNetstringWriter(collect);
  const payload = new Uint8Array(16 * 1024);
  for (let i = 0; i < payload.length; i += 1) payload[i] = i % 256;
  const writeDone = framedWriter
    .next(payload)
    .then(() => collect.return(undefined));

  // Drain everything the writer emitted, concatenate, then splinter.
  const chunks = [];
  await null;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const result = await collectReader.next(undefined);
    if (result.done) break;
    chunks.push(result.value);
  }
  await writeDone;
  const totalLen = chunks.reduce((n, c) => n + c.length, 0);
  const wire = new Uint8Array(totalLen);
  let off = 0;
  for (const c of chunks) {
    wire.set(c, off);
    off += c.length;
  }

  const chunkSize = 300;
  for (let i = 0; i < wire.length; i += chunkSize) {
    // eslint-disable-next-line no-await-in-loop
    await raw.next(wire.subarray(i, Math.min(i + chunkSize, wire.length)));
  }
  await raw.return(undefined);

  const frame = await framed.next(undefined);
  t.false(frame.done);
  if (!frame.done) {
    t.is(frame.value.length, payload.length);
    for (let i = 0; i < payload.length; i += 1) {
      if (frame.value[i] !== payload[i]) {
        t.fail(`mismatch at byte ${i}`);
        return;
      }
    }
    t.pass();
  }
});
