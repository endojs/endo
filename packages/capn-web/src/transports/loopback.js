// In-memory transport pair, useful for tests.

import harden from '@endo/harden';

/**
 * Make a queue: send() enqueues, receive() dequeues (resolves on next push).
 */
const makeQueue = () => {
  /** @type {string[]} */
  const buf = [];
  /** @type {Array<(s: string | null) => void>} */
  const waiters = [];
  let closed = false;
  return harden({
    push(s) {
      if (closed) return;
      const w = waiters.shift();
      if (w) {
        w(s);
        return;
      }
      buf.push(s);
    },
    pull() {
      if (buf.length > 0) return Promise.resolve(buf.shift());
      if (closed) return Promise.resolve(null);
      return new Promise(resolve => waiters.push(resolve));
    },
    close() {
      closed = true;
      for (const w of waiters.splice(0)) w(null);
    },
  });
};

/**
 * Returns a pair of `RpcTransport` objects connected back-to-back.  Each
 * `send` on side A is delivered to side B's `receive`.
 */
export const makeLoopbackPair = () => {
  const aToB = makeQueue();
  const bToA = makeQueue();
  const a = harden({
    send: s => {
      aToB.push(s);
    },
    receive: () => bToA.pull(),
    abort: () => {
      aToB.close();
      bToA.close();
    },
  });
  const b = harden({
    send: s => {
      bToA.push(s);
    },
    receive: () => aToB.pull(),
    abort: () => {
      aToB.close();
      bToA.close();
    },
  });
  return harden({ a, b });
};
