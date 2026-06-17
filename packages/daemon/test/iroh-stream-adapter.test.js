// @ts-nocheck
import test from '@endo/ses-ava/prepare-endo.js';

import { adaptIrohStream } from '../src/networks/iroh-stream-adapter.js';
import { deriveIrohSecretKey } from '../src/networks/iroh.js';

/**
 * A fake iroh RecvStream: serves queued chunks, then EOF (null).
 *
 * @param {Uint8Array[]} chunks
 */
const makeFakeRecv = chunks => {
  const queue = [...chunks];
  return {
    async read(buf) {
      if (queue.length === 0) {
        return null;
      }
      const chunk = queue.shift();
      buf.set(chunk);
      return BigInt(chunk.length);
    },
  };
};

/**
 * A fake iroh SendStream that records writes and lifecycle calls.
 */
const makeFakeSend = () => {
  const writes = [];
  const calls = { finished: 0, reset: 0 };
  return {
    writes,
    calls,
    async writeAll(buf) {
      writes.push(Uint8Array.prototype.slice.call(buf));
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

test('reader yields an empty chunk on a 0-byte read without ending', async t => {
  const enc = new TextEncoder();
  // recv returns 0 (no bytes this turn, not EOF), then a real chunk, then EOF.
  let phase = 0;
  const recv = {
    async read(buf) {
      phase += 1;
      if (phase === 1) return 0n;
      if (phase === 2) {
        buf.set(enc.encode('hi'));
        return 2n;
      }
      return null;
    },
  };
  const { reader } = adaptIrohStream({ send: makeFakeSend(), recv });

  const empty = await reader.next();
  t.false(empty.done);
  t.is(empty.value.length, 0);

  const data = await reader.next();
  t.false(data.done);
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
