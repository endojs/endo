import test from 'ava';

import { makeCacheMap } from '../index.js';

/** @import { ExecutionContext } from 'ava'; */

/**
 * @template [T=unknown]
 * @param {ExecutionContext<T>} t
 * @param {object} config
 * @param {any} [config.makeMap]
 * @param {string} config.expectTag
 * @param {[unknown, unknown, unknown]} config.keys
 * @param {unknown[]} [config.badKeys]
 */
const testMakeCacheMap = test.macro(
  (t, { makeMap, expectTag, keys, badKeys = [] }) => {
    const cache = makeCacheMap(2, makeMap && { makeMap });

    t.is(cache[Symbol.toStringTag], expectTag);

    for (const key of badKeys) {
      t.throws(
        () => cache.set(key, {}),
        undefined,
        `must reject ${typeof key} ${key}`,
      );
    }

    const [key1, key2, key3] = keys;

    const assertNoEntry = key => {
      t.is(cache.has(key), false);
      t.is(cache.get(key), undefined);
    };
    const assertEntry = (key, expectedValue) => {
      t.is(cache.has(key), true);
      t.is(cache.get(key), expectedValue);
    };

    assertNoEntry(key1);
    assertNoEntry(key2);
    assertNoEntry(key3);

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
  },
);

test('makeCacheMap (implicitly weak)', testMakeCacheMap, {
  makeMap: undefined,
  expectTag: 'WeakCacheMap',
  keys: [{}, Symbol('unique symbol'), {}],
  badKeys: /** @type {any} */ (['unweakable']),
});
test('makeCacheMap (weak)', testMakeCacheMap, {
  makeMap: () => new WeakMap(),
  expectTag: 'WeakCacheMap',
  keys: [{}, Symbol('unique symbol'), {}],
  badKeys: /** @type {any} */ (['unweakable']),
});
test('makeCacheMap (strong)', testMakeCacheMap, {
  makeMap: Map,
  expectTag: 'CacheMap',
  keys: [{}, Symbol('unique symbol'), 'string key'],
});

test('makeCacheMap argument validation', t => {
  const badCapacities = [
    NaN,
    -1,
    0.5,
    2 ** 53,
    Infinity,
    '1',
    // eslint-disable-next-line
    new Number(1),
    {
      [Symbol.toStringTag]: '{[Symbol.toPrimitive]}',
      [Symbol.toPrimitive]: () => 1,
    },
  ];
  for (const capacity of badCapacities) {
    t.throws(
      // @ts-expect-error intentional violation
      () => makeCacheMap(capacity),
      undefined,
      `capacity: ${typeof capacity} ${capacity}`,
    );
  }
});
