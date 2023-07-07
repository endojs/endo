import './enforce-cjs-strict.js';
import './core-js-configuration.js';
import 'core-js/actual/iterator/index.js';
import '../index.js';
import './lockdown-safe.js';
import test from 'ava';

test('shimmed iterator helpers', t => {
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
