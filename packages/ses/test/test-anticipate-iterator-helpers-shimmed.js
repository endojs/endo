// KLUDGE HAZARD The core-js shims are written as sloppy code
// and so introduce sloppy functions.
import 'core-js/actual/iterator/index.js';
import test from 'ava';
import '../index.js';

// KLUDGE HAZARD only for testing with the sloppy modules of the
// core-js iterator shim.
// We mutate the permits to tolerates the sloppy functions for testing
// by sacrificing security. The caller and arguments properties of
// sloppy functions violate ocap encapsulation rules.
import { FunctionInstance } from '../src/permits.js';

FunctionInstance.arguments = {};
FunctionInstance.caller = {};

test('shimmed iterator helpers', t => {
  lockdown();

  t.deepEqual(
    (function* g(i) {
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

  const IteratorHelperPrototype = Object.getPrototypeOf(
    Iterator.from([]).take(0),
  );
  t.assert(Object.isFrozen(IteratorHelperPrototype));

  const WrapForValidIteratorPrototype = Object.getPrototypeOf(
    Iterator.from({ next() {} }),
  );
  t.assert(Object.isFrozen(WrapForValidIteratorPrototype));
});
