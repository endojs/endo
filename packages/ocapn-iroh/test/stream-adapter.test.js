// @ts-check

import test from '@endo/ses-ava/test.js';

import { adaptIrohStream } from '../src/stream-adapter.js';

/**
 * Build a fake iroh BiStream whose reads drain `inbound` (then EOF) and
 * whose writes are captured.
 *
 * @param {number[][]} inbound
 */
const makeFakeBi = inbound => {
  const chunks = [...inbound];
  /** @type {number[][]} */
  const written = [];
  const calls = { finish: 0, reset: 0 };
  const bi = {
    send: {
      /** @param {number[]} buf */
      async writeAll(buf) {
        written.push(Array.from(buf));
      },
      async finish() {
        calls.finish += 1;
      },
      /** @param {bigint} _code */
      async reset(_code) {
        calls.reset += 1;
      },
    },
    recv: {
      /** @param {number} _sizeLimit */
      async read(_sizeLimit) {
        return chunks.length > 0 ? chunks.shift() : [];
      },
    },
  };
  return { bi, written, calls };
};

test('reader yields chunks as Uint8Array and EOF resolves closed', async t => {
  const { bi } = makeFakeBi([
    [1, 2, 3],
    [4, 5],
  ]);
  const { reader, closed } = adaptIrohStream(bi);

  const first = await reader.next(undefined);
  t.false(first.done);
  t.deepEqual([...(first.value ?? [])], [1, 2, 3]);

  const second = await reader.next(undefined);
  t.false(second.done);
  t.deepEqual([...(second.value ?? [])], [4, 5]);

  const third = await reader.next(undefined);
  t.true(third.done);
  await closed;
  t.pass();
});

test('writer converts to plain byte arrays and return() finishes', async t => {
  const { bi, written, calls } = makeFakeBi([]);
  const { writer } = adaptIrohStream(bi);

  await writer.next(new Uint8Array([9, 8, 7]));
  t.deepEqual(written, [[9, 8, 7]]);

  await writer.return(undefined);
  t.is(calls.finish, 1);
});

test('writer.throw resets the stream and closes the connection', async t => {
  const { bi, calls } = makeFakeBi([]);
  let connectionClosed = 0;
  const connection = {
    /**
     * @param {bigint} _code
     * @param {number[]} _reason
     */
    close(_code, _reason) {
      connectionClosed += 1;
    },
  };
  const { writer, closed } = adaptIrohStream(bi, connection);

  await t.throwsAsync(() => writer.throw(Error('boom')), {
    message: 'boom',
  });
  t.is(calls.reset, 1);
  t.is(connectionClosed, 1);
  await closed;
});

test('connection.closed settles the adapter closed promise', async t => {
  const { bi } = makeFakeBi([[1]]);
  /** @type {() => void} */
  let resolveConnectionClosed = () => {};
  const connection = {
    closed: () =>
      new Promise(resolve => {
        resolveConnectionClosed = /** @type {() => void} */ (resolve);
      }),
  };
  const { closed } = adaptIrohStream(bi, connection);
  resolveConnectionClosed();
  await closed;
  t.pass();
});
