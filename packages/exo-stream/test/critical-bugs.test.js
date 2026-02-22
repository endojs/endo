// @ts-check
import test from '@endo/ses-ava/prepare-endo.js';
import { M } from '@endo/patterns';
import { makePromiseKit } from '@endo/promise-kit';

import { readerFromIterator } from '../reader-from-iterator.js';
import { iterateReader } from '../iterate-reader.js';

// Issue 1: When mustMatch() throws in iterateReader (iterate-reader.js:100),
// the `done` flag is never set and `nodePromise` is never advanced to the next
// node. Subsequent next() calls re-read the same failed node and throw the
// same pattern error indefinitely. The responder's syn chain is also never
// terminated, so the reader pump keeps producing values that nobody consumes.

test.failing(
  'readPattern failure terminates the iterator',
  async t => {
    let returnCalled = false;

    async function* source() {
      try {
        yield harden({ type: 'a', count: 1 });
        yield harden({ type: 'b', count: 'not a number' });
        yield harden({ type: 'c', count: 3 });
      } finally {
        returnCalled = true;
      }
    }

    const readPattern = M.splitRecord({
      type: M.string(),
      count: M.number(),
    });
    const readerRef = readerFromIterator(source());
    const reader = iterateReader(readerRef, { readPattern });

    // First value is valid
    const r1 = await reader.next();
    t.false(r1.done);
    t.deepEqual(r1.value, { type: 'a', count: 1 });

    // Second value fails pattern validation
    await t.throwsAsync(() => reader.next(), {
      message: /count/,
    });

    // After a validation failure, subsequent calls should return done.
    const r3 = await reader.next();
    t.true(r3.done);

    // Allow microtasks to settle for cleanup
    await new Promise(resolve => setTimeout(resolve, 50));

    // The responder's source iterator should be cleaned up
    t.true(returnCalled);
  },
);

// Issue 2: When the syn promise chain rejects (e.g., the initiator aborts),
// the reader pump's catch handler (reader-pump.js:98-101) propagates the error
// on the ack chain via ackResolve(Promise.reject(err)), but never calls
// iterator.return() on the source iterator. Any resources held by the source
// (file handles, network connections) are leaked.

test.failing(
  'reader pump cleans up source iterator when syn chain rejects',
  async t => {
    const { promise: returnCalledPromise, resolve: resolveReturnCalled } =
      makePromiseKit();

    // An async iterator that yields indefinitely and tracks cleanup
    const source = harden({
      async next() {
        return harden({ value: 'data', done: false });
      },
      async return() {
        resolveReturnCalled(true);
        return harden({ value: undefined, done: true });
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    });

    const readerRef = readerFromIterator(source);

    // Build a syn chain: first node resolves normally, second rejects
    const { promise: synHead, resolve: synResolve } = makePromiseKit();
    const { promise: secondSyn, reject: rejectSecondSyn } = makePromiseKit();
    synResolve(harden({ value: undefined, promise: secondSyn }));

    // Start the pump via the raw stream API
    const ackHead = await readerRef.stream(synHead);

    // First ack should carry data from the source
    t.is(ackHead.value, 'data');

    // Reject the syn chain, simulating an initiator abort
    rejectSecondSyn(Error('initiator aborted'));

    // The error should propagate through the ack chain
    await t.throwsAsync(() => ackHead.promise, {
      message: /initiator aborted/,
    });

    // The source iterator's return() should have been called for cleanup.
    const returnCalled = await Promise.race([
      returnCalledPromise,
      // eslint-disable-next-line no-restricted-globals
      new Promise(resolve => setTimeout(() => resolve(false), 200)),
    ]);
    t.true(returnCalled);
  },
);
