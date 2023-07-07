import './enforce-cjs-strict.js';
import './core-js-configuration.js';
import 'core-js/actual/async-iterator/index.js';
import '../index.js';
import './lockdown-safe.js';
import test from 'ava';

test('shimmed async-iterator helpers', async t => {
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
