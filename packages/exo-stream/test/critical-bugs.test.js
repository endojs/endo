// @ts-check
import test from '@endo/ses-ava/prepare-endo.js';
import { M } from '@endo/patterns';

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
