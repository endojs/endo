import test from 'ava';

import { makeCacheMap } from '../index.js';

test('makeCacheMap', t => {
  const cache = makeCacheMap(2);

  // @ts-expect-error intentional violation
  t.throws(() => cache.set('unweakable key', {}));

  const assertNoEntry = key => {
    t.is(cache.has(key), false);
    t.is(cache.get(key), undefined);
  };
  const assertEntry = (key, expectedValue) => {
    t.is(cache.has(key), true);
    t.is(cache.get(key), expectedValue);
  };
  const key1 = {};
  const key2 = Symbol('unique symbol');
  const key3 = {};
  assertNoEntry(key1);

  // Populate up to capacity.
  cache.set(key1, 'x');
  cache.set(key2, 'y');
  assertEntry(key2, 'y');
  assertEntry(key1, 'x');
  assertNoEntry(key3);

  // Evict key2.
  cache.set(key3, 'z');
  assertEntry(key1, 'x');
  assertNoEntry(key2);
  assertEntry(key3, 'z');

  // Overwrite key3.
  cache.set(key3, 'zz');
  assertEntry(key1, 'x');
  assertNoEntry(key2);
  assertEntry(key3, 'zz');

  // Evict key1.
  cache.set(key2, 'y');
  assertNoEntry(key1);
  assertEntry(key2, 'y');
  assertEntry(key3, 'zz');

  // Delete key3, preserving key2.
  cache.delete(key3);
  assertNoEntry(key1);
  assertEntry(key2, 'y');
  assertNoEntry(key3);

  // Add key1, preserving key2.
  cache.set(key1, 'x');
  assertEntry(key2, 'y');
  assertEntry(key1, 'x');
  assertNoEntry(key3);

  // Delete key2, preserving key1.
  cache.delete(key2);
  assertEntry(key1, 'x');
  assertNoEntry(key2);
  assertNoEntry(key3);

  // Delete key1.
  cache.delete(key1);
  assertNoEntry(key1);
  assertNoEntry(key2);
  assertNoEntry(key3);

  // Repopulate with eviction.
  cache.set(key1, 'xx');
  cache.set(key2, 'yy');
  cache.set(key3, 'zz');
  assertNoEntry(key1);
  assertEntry(key2, 'yy');
  assertEntry(key3, 'zz');
});
