// @ts-nocheck
/* global setTimeout */

import '@endo/init/debug.js';

import test from 'ava';
import { makePipe } from '@endo/stream';
import { makeSyrupReader } from '../reader.js';
import { makeSyrupWriter } from '../writer.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function read(source) {
  const array = [];
  for await (const chunk of source) {
    // Capture current state, allocating a copy.
    array.push(chunk.slice());
  }
  return array;
}

const readChunkedMessage = async (t, chunkStrings, expectedDataStrings) => {
  const r = makeSyrupReader(
    chunkStrings.map(chunkString => encoder.encode(chunkString)),
    {
      name: '<unknown>',
    },
  );
  const array = await read(r);
  t.deepEqual(
    expectedDataStrings,
    array.map(chunk => decoder.decode(chunk)),
  );
};

test('read short messages', readChunkedMessage, ['0:1:A'], ['', 'A']);
test(
  'read short messages with data divided over chunk boundaries',
  readChunkedMessage,
  ['0:', '1:A'],
  ['', 'A'],
);

test(
  'read a message in single chunk',
  readChunkedMessage,
  ['5:hello'],
  ['hello'],
);
test(
  'read a message with data in separate chunk',
  readChunkedMessage,
  ['5:', 'hello'],
  ['hello'],
);
test(
  'read a message with data divided over a chunk boundary',
  readChunkedMessage,
  ['5:hel', 'lo'],
  ['hello'],
);

test(
  'read messages divided over chunk boundaries',
  readChunkedMessage,
  ['5:hello', '5:world8:good ', 'bye'],
  ['hello', 'world', 'good bye'],
);

test(
  'read prefix colon divided over chunk boundary',
  readChunkedMessage,
  ['0', ':', '1', ':A'],
  ['', 'A'],
);

test(
  'read length prefix divided over chunk boundaries',
  readChunkedMessage,
  ['1', '1:hello world'],
  ['hello world'],
);

const readErroneousChunkedMessage = async (t, chunkStrings, opts) => {
  const r = makeSyrupReader(
    chunkStrings.map(chunkString => encoder.encode(chunkString)),
    opts,
  );
  return t.throwsAsync(() => read(r));
};

test('fails reading invalid prefix', readErroneousChunkedMessage, ['1.0:A']);
test('fails reading incomplete data', readErroneousChunkedMessage, ['5:hell']);
test('fails reading no colon', readErroneousChunkedMessage, ['1A']);
test('fails reading empty prefix before colon', readErroneousChunkedMessage, [
  ':',
]);

test(
  'fails reading too long prefix',
  readErroneousChunkedMessage,
  ['11:hello world'],
  { maxMessageLength: 9 },
);
test(
  'fails reading if message length over max',
  readErroneousChunkedMessage,
  ['11:hello world'],
  { maxMessageLength: 10 },
);

// Trailing characters after a valid frame are treated as the beginning
// of the next frame's length prefix.  A ',' is not a digit, so the
// reader rejects it.  This test exists specifically to confirm that the
// reader does not consume a trailing comma (the one behavioral departure
// from @endo/netstring).
test(
  'trailing comma after frame is rejected (not silently consumed)',
  readErroneousChunkedMessage,
  ['5:hello,'],
);

function delay(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

// TODO refactor: when `@endo/stream` gains a `mapReader` (or similar)
// helper that can capture a snapshot of each yielded chunk, replace
// `makeArrayWriter` with `makePipe()` + the mapped reader so the
// writer-to-reader bridge is the same shape these tests would
// actually use in production. Per kriskowal review on PR #109; the
// same opportunity exists in the sibling `cbor-frame` test suite,
// where the TODO landed under PR #288.
const makeArrayWriter = opts => {
  const array = [];
  const writer = makeSyrupWriter(
    {
      async next(value) {
        // Provide some back pressure to give the producer an
        // opportunity to make the mistake of overwriting the given
        // slice.
        await delay(10);
        // slice to capture before yielding.
        array.push(value.slice());
        return { done: false };
      },
      async return() {
        return { done: true };
      },
      async throw() {
        return { done: true };
      },
    },
    opts,
  );
  return { array, writer };
};

const shortMessages = async (t, opts) => {
  const { array, writer } = makeArrayWriter(opts);
  await writer.next(encoder.encode(''));
  await writer.next(encoder.encode('A'));
  await writer.next(encoder.encode('hello'));
  await writer.return();

  t.deepEqual(
    [encoder.encode(''), encoder.encode('A'), encoder.encode('hello')],
    await read(makeSyrupReader(array)),
  );
};
test('round-trip short messages', shortMessages);
test('round-trip short messages (chunked)', shortMessages, { chunked: true });

const concurrentWrites = async (t, opts) => {
  const { array, writer } = makeArrayWriter(opts);
  await Promise.all([
    writer.next(encoder.encode('')),
    writer.next(encoder.encode('A')),
    writer.next(encoder.encode('hello')),
    writer.return(),
  ]);

  t.deepEqual(
    [encoder.encode(''), encoder.encode('A'), encoder.encode('hello')],
    await read(makeSyrupReader(array)),
  );
};
test('concurrent writes', concurrentWrites);
test('concurrent writes (chunked)', concurrentWrites, { chunked: true });

const chunkedWrite = async (t, opts) => {
  const { array, writer } = makeArrayWriter(opts);
  const strChunks = ['hello', ' ', 'world'];
  await writer.next(strChunks.map(strChunk => encoder.encode(strChunk)));
  await writer.return();

  t.deepEqual(
    [encoder.encode(strChunks.join(''))],
    await read(makeSyrupReader(array)),
  );
};
test('chunked write', chunkedWrite);
test('chunked write (chunked)', chunkedWrite, { chunked: true });

test('writer closes anywhere within chunk', async t => {
  await null;
  // The chunked write produces prefix + N payload chunks (no trailing
  // comma); iterate past each boundary and confirm that closing the
  // reader at any point yields `done: true` to the writer.
  for (let count = 0; count < 3; count += 1) {
    const pipe = makePipe();
    const writer = makeSyrupWriter(pipe[1], { chunked: true });
    for (let i = 0; i < count; i += 1) {
      pipe[0].next();
    }
    // close the writer:
    pipe[0].return();
    // eslint-disable-next-line no-await-in-loop
    const { done } = await writer.next(
      ['Hello, ', 'World!\n'].map(str => encoder.encode(str)),
    );
    t.assert(done);
  }
});

const varyingMessages = async (t, opts) => {
  const array = ['', 'A', 'hello'];

  for (let i = 1020; i < 1030; i += 1) {
    array.push(new Array(i).fill(':').join(''));
  }
  for (let i = 2040; i < 2050; i += 1) {
    array.push(new Array(i).fill(':').join(''));
  }

  t.plan(array.length);

  const [input, output] = makePipe();

  const producer = (async () => {
    await null;
    /** @type {import('@endo/stream').Writer<Uint8Array, undefined>} */
    const w = makeSyrupWriter(output, opts);
    for (let i = 0; i < array.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await w.next(encoder.encode(array[i]));
      // eslint-disable-next-line no-await-in-loop
      await delay(10);
    }
    await w.return();
  })();

  const consumer = (async () => {
    /** @type {import('@endo/stream').Reader<Uint8Array, undefined>} */
    const r = makeSyrupReader(input);
    let i = 0;
    for await (const message of r) {
      await delay(10);
      t.is(array[i], decoder.decode(message));
      i += 1;
    }
    t.log('end');
  })();

  await Promise.all([producer, consumer]);
};
test('round-trip varying messages', varyingMessages);
test('round-trip varying messages (chunked)', varyingMessages, {
  chunked: true,
});

// Exercise the exact motivating case: small concurrent writes whose
// frames straddle arbitrary chunk boundaries must reassemble correctly.
test('round-trip across adversarial chunk boundaries', async t => {
  const messages = ['', 'A', 'hello', 'op:start-session', '1234567890'];
  const [input, output] = makePipe();

  const producer = (async () => {
    await null;
    const w = makeSyrupWriter(output);
    for (const m of messages) {
      // eslint-disable-next-line no-await-in-loop
      await w.next(encoder.encode(m));
    }
    await w.return();
  })();

  // Fragment into tiny 1-byte slices on the read side by wrapping the
  // input in a generator that yields byte-at-a-time.
  async function* byteByByteGen() {
    for await (const chunk of input) {
      const n = Number(chunk.length);
      for (let i = 0; i < n; i += 1) {
        yield chunk.subarray(i, i + 1);
      }
    }
  }
  const byteByByte = byteByByteGen();

  const r = makeSyrupReader(byteByByte);
  const got = await read(r);
  await producer;
  t.deepEqual(
    messages.map(m => encoder.encode(m)),
    got,
  );
});

// Exercise writer.throw(): the syrup writer must forward the error to
// the underlying output stream's throw().  pump() in @endo/stream calls
// writer.throw(err) when the reader side fails, so the writer must
// honor the iterator-protocol throw method.
test('writer.throw forwards the error to the underlying output', async t => {
  /** @type {Error[]} */
  const thrown = [];
  const writer = makeSyrupWriter({
    async next() {
      return { done: false };
    },
    async return() {
      return { done: true };
    },
    async throw(error) {
      thrown.push(error);
      return { done: true };
    },
  });
  const boom = Error('boom');
  const result = await writer.throw(boom);
  t.is(result.done, true);
  t.deepEqual(thrown, [boom]);
});

// Exercise Symbol.asyncIterator: the syrup writer is itself an async
// iterator, and `for await ... of writer` is the protocol-level way to
// drive a writer.  This confirms the writer returns itself from
// Symbol.asyncIterator (the iterable contract).
test('writer is its own async iterator', t => {
  const writer = makeSyrupWriter({
    async next() {
      return { done: false };
    },
    async return() {
      return { done: true };
    },
    async throw() {
      return { done: true };
    },
  });
  t.is(writer[Symbol.asyncIterator](), writer);
});

// maxMessageLength is the upper bound; a payload of exactly that length
// must round-trip without error.  Catches an off-by-one in either the
// prefix-length cap or the message-length cap.
test('reads message at exactly maxMessageLength', async t => {
  await null;
  const payload = encoder.encode('a'.repeat(10));
  const r = makeSyrupReader([encoder.encode('10:'), payload], {
    maxMessageLength: 10,
  });
  const got = await read(r);
  t.deepEqual(got, [payload]);
});

// A prefix with leading zeros is well-formed (digits only).  This
// confirms the reader does not reject it as invalid.
test('reads message with leading-zero prefix', async t => {
  await null;
  const r = makeSyrupReader([encoder.encode('05:hello')]);
  const got = await read(r);
  t.deepEqual(got, [encoder.encode('hello')]);
});

// A clean EOF after consuming zero bytes must not throw.  The
// contract's "Unexpected dangling message" error is for a partial
// frame at end-of-stream; an empty stream is a valid no-frame stream.
test('empty input yields no frames without error', async t => {
  await null;
  const r = makeSyrupReader([]);
  t.deepEqual(await read(r), []);
});

// A zero-length chunk in the input must not advance state and must not
// throw.  Real socket sources can yield empty chunks when the kernel
// buffers are momentarily empty.
test('zero-length chunks are skipped without error', async t => {
  await null;
  const r = makeSyrupReader([
    encoder.encode(''),
    encoder.encode('5:'),
    encoder.encode(''),
    encoder.encode('hello'),
    encoder.encode(''),
  ]);
  t.deepEqual(await read(r), [encoder.encode('hello')]);
});

// Two adjacent valid frames in a single chunk must be read as two
// frames, not one.  The contract requires the reader to rearm its
// length-buffer state after each yielded frame.
test('two adjacent frames in one chunk read as two', async t => {
  await null;
  const r = makeSyrupReader([encoder.encode('5:hello5:world')]);
  t.deepEqual(await read(r), [
    encoder.encode('hello'),
    encoder.encode('world'),
  ]);
});

// maxMessageLength: 0 must reject any non-empty message.  An empty
// frame ('0:') is below the limit and must round-trip; '1:A' must
// reject.
test('maxMessageLength: 0 accepts empty frame and rejects non-empty', async t => {
  await null;
  const accepting = makeSyrupReader([encoder.encode('0:')], {
    maxMessageLength: 0,
  });
  t.deepEqual(await read(accepting), [encoder.encode('')]);

  const rejecting = makeSyrupReader([encoder.encode('1:A')], {
    maxMessageLength: 0,
  });
  await t.throwsAsync(() => read(rejecting), {
    message: /too big/,
  });
});

// writer.return() must propagate to the underlying output exactly
// once.  The writer is documented as a transparent forwarder; a
// double-close upstream would surface as a double-close downstream
// and confuse half-closed sockets.
test('writer.return propagates exactly once to the underlying output', async t => {
  await null;
  let returnCalls = 0;
  const writer = makeSyrupWriter({
    async next() {
      return { done: false };
    },
    async return() {
      returnCalls += 1;
      return { done: true };
    },
    async throw() {
      return { done: true };
    },
  });
  const result = await writer.return();
  t.is(result.done, true);
  t.is(returnCalls, 1);
});

// A partial prefix at EOF (digits only, no colon) is silently
// discarded by the reader: the "Unexpected dangling message" check
// only fires when the prefix completed and the payload was partial
// (`lengthBuffer === null` at the post-loop check).  This matches the
// inherited behavior of @endo/netstring and is not claimed otherwise
// by the syrup contract; documented here as the explicit invariant.
test('partial prefix at EOF is silently discarded (matches netstring)', async t => {
  await null;
  const r = makeSyrupReader([encoder.encode('123')]);
  t.deepEqual(await read(r), []);
});
