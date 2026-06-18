// @ts-nocheck
import test from '@endo/ses-ava/prepare-endo.js';

import { adaptIrohStream } from '../src/networks/iroh-stream-adapter.js';
import { deriveIrohSecretKey } from '../src/networks/iroh.js';

/**
 * A fake iroh RecvStream (1.0 contract): `read(sizeLimit)` returns the next
 * queued chunk as an `Array<number>`, then an empty array to signal EOF.
 *
 * @param {Uint8Array[]} chunks
 */
const makeFakeRecv = chunks => {
  const queue = [...chunks];
  return {
    async read(_sizeLimit) {
      if (queue.length === 0) {
        return [];
      }
      return Array.from(queue.shift());
    },
  };
};

/**
 * A fake iroh SendStream that records writes and lifecycle calls. The adapter
 * hands `writeAll` a plain `Array<number>`, matching the 1.0 binding.
 */
const makeFakeSend = () => {
  const writes = [];
  const calls = { finished: 0, reset: 0 };
  return {
    writes,
    calls,
    async writeAll(buf) {
      writes.push(Uint8Array.from(buf));
    },
    async finish() {
      calls.finished += 1;
    },
    async reset() {
      calls.reset += 1;
    },
  };
};

test('reader yields chunks then completes at EOF', async t => {
  const enc = new TextEncoder();
  const recv = makeFakeRecv([enc.encode('hello'), enc.encode(' world')]);
  const send = makeFakeSend();
  const { reader, closed } = adaptIrohStream({ send, recv });

  const dec = new TextDecoder();
  const first = await reader.next();
  t.false(first.done);
  t.is(dec.decode(first.value), 'hello');

  const second = await reader.next();
  t.false(second.done);
  t.is(dec.decode(second.value), ' world');

  const third = await reader.next();
  t.true(third.done);
  t.is(third.value, undefined);

  // EOF resolves the closed promise.
  await closed;
  t.pass();
});

test('reader treats an empty read as EOF and resolves closed', async t => {
  // Under the 1.0 contract `read` only resolves with zero bytes at end of
  // stream, so an empty result must complete the reader rather than yield an
  // empty chunk.
  const recv = {
    async read(_sizeLimit) {
      return [];
    },
  };
  const { reader, closed } = adaptIrohStream({ send: makeFakeSend(), recv });

  const end = await reader.next();
  t.true(end.done);
  t.is(end.value, undefined);
  await closed;
  t.pass();
});

test('reader accepts a Buffer/Uint8Array chunk, not just a plain array', async t => {
  // napi may marshal the `Vec<u8>` return as a Buffer on some platforms; the
  // adapter must normalise either array-like to a Uint8Array.
  let served = false;
  const recv = {
    async read(_sizeLimit) {
      if (served) return [];
      served = true;
      return new Uint8Array([0x68, 0x69]); // "hi"
    },
  };
  const { reader } = adaptIrohStream({ send: makeFakeSend(), recv });

  const data = await reader.next();
  t.false(data.done);
  t.true(data.value instanceof Uint8Array);
  t.is(new TextDecoder().decode(data.value), 'hi');

  const end = await reader.next();
  t.true(end.done);
});

test('reader.next rethrows a recv.read error and resolves closed', async t => {
  const recv = {
    async read() {
      throw new Error('read failed');
    },
  };
  const { reader, closed } = adaptIrohStream({ send: makeFakeSend(), recv });

  await t.throwsAsync(() => reader.next(), { message: /read failed/ });
  // The error path still settles the closed promise.
  await closed;
  t.pass();
});

test('writer.next forwards bytes via writeAll', async t => {
  const send = makeFakeSend();
  const recv = makeFakeRecv([]);
  const { writer } = adaptIrohStream({ send, recv });

  const enc = new TextEncoder();
  await writer.next(enc.encode('yo'));
  await writer.next(enc.encode('!'));

  t.is(send.writes.length, 2);
  t.is(new TextDecoder().decode(send.writes[0]), 'yo');
  t.is(new TextDecoder().decode(send.writes[1]), '!');
});

test('writer.return finishes the send stream and resolves closed', async t => {
  const send = makeFakeSend();
  const recv = makeFakeRecv([]);
  const { writer, closed } = adaptIrohStream({ send, recv });

  await writer.return();
  t.is(send.calls.finished, 1);
  await closed;
  t.pass();
});

test('writer.return swallows a send.finish error and still resolves closed', async t => {
  const send = makeFakeSend();
  send.finish = async () => {
    throw new Error('finish failed');
  };
  const { writer, closed } = adaptIrohStream({ send, recv: makeFakeRecv([]) });

  // The error is swallowed: return resolves normally rather than rejecting.
  const result = await writer.return();
  t.true(result.done);
  await closed;
  t.pass();
});

test('writer.throw resets the send stream and closes the connection', async t => {
  const send = makeFakeSend();
  const recv = makeFakeRecv([]);
  let connClosed = 0;
  const connection = {
    close() {
      connClosed += 1;
    },
  };
  const { writer, closed } = adaptIrohStream({ send, recv }, connection);

  await t.throwsAsync(() => writer.throw(new Error('boom')), {
    message: /boom/,
  });
  t.is(send.calls.reset, 1);
  t.is(connClosed, 1);
  await closed;
  t.pass();
});

test('connection.closed() resolves the adapter closed promise', async t => {
  let resolveConn;
  const connection = {
    closed: () =>
      new Promise(resolve => {
        resolveConn = resolve;
      }),
  };
  const { closed } = adaptIrohStream(
    { send: makeFakeSend(), recv: makeFakeRecv([]) },
    connection,
  );
  resolveConn('closed');
  await closed;
  t.pass();
});

test('deriveIrohSecretKey is deterministic and 32 bytes', t => {
  const nodeId = 'a'.repeat(64);
  const key1 = deriveIrohSecretKey(nodeId);
  const key2 = deriveIrohSecretKey(nodeId);
  t.is(key1.length, 32);
  t.deepEqual(key1, key2);
  // The first byte of fromHex('aa...') is 0xaa.
  t.is(key1[0], 0xaa);
});

test('deriveIrohSecretKey differs for different node numbers', t => {
  const a = deriveIrohSecretKey('a'.repeat(64));
  const b = deriveIrohSecretKey('b'.repeat(64));
  t.notDeepEqual(a, b);
});
