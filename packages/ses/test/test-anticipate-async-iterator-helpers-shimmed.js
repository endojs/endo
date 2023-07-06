// KLUDGE HAZARD The core-js shims are written as sloppy code
// and so introduce sloppy functions.
import 'core-js/actual/async-iterator/index.js';
import test from 'ava';
import '../index.js';

// KLUDGE HAZARD only for testing with the sloppy modules of the
// core-js iterator shim.
// We mutate the permits to tolerates the sloppy functions for testing
// by sacrificing security. The caller and arguments properties of
// sloppy functions violate ocap encapsulation rules.
import { AsyncFunctionInstance } from '../src/permits.js';

AsyncFunctionInstance.arguments = {};
AsyncFunctionInstance.caller = {};

// Skipped because the core-js shim seems to miss the
// actual %AsyncIteratorPrototype%,
// so it creates a new one, causing us to fail because lockdown correctly
// detects the conflicting definitions.
// TODO report the bug to core-js
test.skip('shimmed async-iterator helpers', async t => {
  lockdown();
  
  t.deepEqual(
    await (async function* g(i) {
      // eslint-disable-next-line no-plusplus
      while (true) yield i++;
    })(1)
      .drop(1)
      .take(5)
      .filter(it => it % 2)
      .map(it => it ** 2)
      .toArray(),
    [9, 25],
  );

  const AsyncIteratorHelperPrototype = Object.getPrototypeOf(
    AsyncIterator.from([]).take(0),
  );
  t.assert(Object.isFrozen(AsyncIteratorHelperPrototype));

  const WrapForValidAsyncIteratorPrototype = Object.getPrototypeOf(
    AsyncIterator.from({
      async next() {
        return undefined;
      },
    }),
  );
  t.assert(Object.isFrozen(WrapForValidAsyncIteratorPrototype));
});
