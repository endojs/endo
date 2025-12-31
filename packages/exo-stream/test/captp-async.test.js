/**
 * Tests using CapTP with async message dispatch to simulate real network conditions.
 * This is closer to how the daemon uses CapTP over Unix sockets.
 */
import test from '@endo/ses-ava/prepare-endo.js';

import { Far } from '@endo/far';
import { makeCapTP, E } from '@endo/captp';
import { streamIterator } from '../stream-iterator.js';
import { iterateStream } from '../iterate-stream.js';

/**
 * Create a CapTP bridge with async message dispatch.
 * Messages are queued and dispatched asynchronously to simulate network delay.
 *
 * @param {string} name - Name for the CapTP connection
 * @param {unknown} bootstrap - Bootstrap object to expose
 */
const makeAsyncCapTPBridge = (name, bootstrap) => {
  /** @type {unknown[]} */
  const nearToFarQueue = [];
  /** @type {unknown[]} */
  const farToNearQueue = [];
  /** @type {((msg: unknown) => void) | undefined} */
  let nearDispatch;
  /** @type {((msg: unknown) => void) | undefined} */
  let farDispatch;

  /**
   * @param {unknown[]} queue
   * @param {(msg: unknown) => void} dispatch
   */
  const processQueue = async (queue, dispatch) => {
    await null;
    // eslint-disable-next-line no-await-in-loop
    while (queue.length > 0) {
      const msg = queue.shift();
      dispatch(msg);
      // eslint-disable-next-line no-await-in-loop
      await Promise.resolve();
    }
  };

  const nearSend = obj => {
    nearToFarQueue.push(obj);
    assert(farDispatch);
    processQueue(nearToFarQueue, farDispatch).catch(() => {});
  };

  const farSend = obj => {
    farToNearQueue.push(obj);
    assert(nearDispatch);
    processQueue(farToNearQueue, nearDispatch).catch(() => {});
  };

  const nearCapTP = makeCapTP(`near-${name}`, nearSend, undefined);
  nearDispatch = nearCapTP.dispatch;

  const farCapTP = makeCapTP(`far-${name}`, farSend, bootstrap);
  farDispatch = farCapTP.dispatch;

  return {
    getBootstrap: nearCapTP.getBootstrap,
    abort: () => {
      nearCapTP.abort();
      farCapTP.abort();
    },
  };
};

test('async-captp: single-item stream', async t => {
  async function* singleItem() {
    yield harden({ msg: 'hello' });
  }

  const localStream = streamIterator(singleItem());

  const bootstrap = Far('bootstrap', {
    getStream() {
      return localStream;
    },
  });

  const { getBootstrap } = makeAsyncCapTPBridge('test', bootstrap);
  const remoteBootstrap = getBootstrap();

  const remoteStream = await E(remoteBootstrap).getStream();
  const reader = iterateStream(remoteStream);

  const r1 = await reader.next();
  t.false(r1.done);
  t.deepEqual(r1.value, { msg: 'hello' });

  const r2 = await reader.next();
  t.true(r2.done);
});

test('async-captp: empty stream', async t => {
  async function* emptyGen() {
    // yields nothing
  }

  const localStream = streamIterator(emptyGen());

  const bootstrap = Far('bootstrap', {
    getStream() {
      return localStream;
    },
  });

  const { getBootstrap } = makeAsyncCapTPBridge('test', bootstrap);
  const remoteBootstrap = getBootstrap();

  const remoteStream = await E(remoteBootstrap).getStream();
  const reader = iterateStream(remoteStream);

  const results = [];
  for await (const value of reader) {
    results.push(value);
  }

  t.is(results.length, 0);
});

test('async-captp: multi-item stream', async t => {
  async function* multiItem() {
    yield harden({ n: 1 });
    yield harden({ n: 2 });
    yield harden({ n: 3 });
  }

  const localStream = streamIterator(multiItem());

  const bootstrap = Far('bootstrap', {
    getStream() {
      return localStream;
    },
  });

  const { getBootstrap } = makeAsyncCapTPBridge('test', bootstrap);
  const remoteBootstrap = getBootstrap();

  const remoteStream = await E(remoteBootstrap).getStream();
  const reader = iterateStream(remoteStream);

  const results = [];
  for await (const value of reader) {
    results.push(value);
  }

  t.deepEqual(results, [{ n: 1 }, { n: 2 }, { n: 3 }]);
});
