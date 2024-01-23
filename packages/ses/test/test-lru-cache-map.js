// @ts-check
import test from 'ava';

import { makeLRUCacheMap } from '../src/make-lru-cachemap.js';

test('makeLRUCacheMap', t => {
  /** @type {WeakMap<{}, number>} */
  const lruMap = makeLRUCacheMap(2);
  const assertNoEntry = key => {
    t.is(lruMap.has(key), false);
    t.is(lruMap.get(key), undefined);
  };
  const assertEntry = (key, expectedValue) => {
    t.is(lruMap.has(key), true);
    t.is(lruMap.get(key), expectedValue);
  };
  const key1 = {};
  const key2 = {};
  const key3 = {};
  assertNoEntry(key1);

  // Populate up to capacity.
  lruMap.set(key1, 'x');
  lruMap.set(key2, 'y');
  assertEntry(key2, 'y');
  assertEntry(key1, 'x');
  assertNoEntry(key3);

  // Evict key2.
  lruMap.set(key3, 'z');
  assertEntry(key1, 'x');
  assertNoEntry(key2);
  assertEntry(key3, 'z');

  // Overwrite key3.
  lruMap.set(key3, 'zz');
  assertEntry(key1, 'x');
  assertNoEntry(key2);
  assertEntry(key3, 'zz');

  // Evict key1.
  lruMap.set(key2, 'y');
  assertNoEntry(key1);
  assertEntry(key2, 'y');
  assertEntry(key3, 'zz');

  // Delete key3, preserving key2.
  lruMap.delete(key3);
  assertNoEntry(key1);
  assertEntry(key2, 'y');
  assertNoEntry(key3);

  // Add key1, preserving key2.
  lruMap.set(key1, 'x');
  assertEntry(key2, 'y');
  assertEntry(key1, 'x');
  assertNoEntry(key3);

  // Delete key2, preserving key1.
  lruMap.delete(key2);
  assertEntry(key1, 'x');
  assertNoEntry(key2);
  assertNoEntry(key3);

  // Delete key1.
  lruMap.delete(key1);
  assertNoEntry(key1);
  assertNoEntry(key2);
  assertNoEntry(key3);

  // Repopulate with eviction.
  lruMap.set(key1, 'xx');
  lruMap.set(key2, 'yy');
  lruMap.set(key3, 'zz');
  assertNoEntry(key1);
  assertEntry(key2, 'yy');
  assertEntry(key3, 'zz');
});
