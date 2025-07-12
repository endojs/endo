import test from 'ava';

import { makeCacheMapKit } from '../index.js';

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
const testMakeCacheMapKit = test.macro(
  (t, { makeMap, expectTag, keys, badKeys = [] }) => {
    const { cache, getMetrics } = makeCacheMapKit(2, makeMap && { makeMap });

    t.is(cache[Symbol.toStringTag], expectTag);

    const expectMetrics = { totalQueryCount: 0, totalHitCount: 0 };

    for (const key of badKeys) {
      t.throws(
        () => cache.set(key, {}),
        undefined,
        `must reject ${typeof key} ${key}`,
      );
      expectMetrics.totalQueryCount += 1;
      t.deepEqual(getMetrics(), expectMetrics);
    }

    const [key1, key2, key3] = keys;

    const assertNoEntry = key => {
      t.is(cache.has(key), false);
      t.is(cache.get(key), undefined);
      expectMetrics.totalQueryCount += 2;
      t.deepEqual(getMetrics(), expectMetrics);
    };
    const assertEntry = (key, expectedValue) => {
      t.is(cache.has(key), true);
      t.is(cache.get(key), expectedValue);
      expectMetrics.totalQueryCount += 2;
      expectMetrics.totalHitCount += 2;
      t.deepEqual(getMetrics(), expectMetrics);
    };

    assertNoEntry(key1);
    assertNoEntry(key2);
    assertNoEntry(key3);

    // Populate up to capacity.
    cache.set(key1, 'x');
    cache.set(key2, 'y');
    expectMetrics.totalQueryCount += 2;
    t.deepEqual(getMetrics(), expectMetrics);
    assertEntry(key2, 'y');
    assertEntry(key1, 'x');
    assertNoEntry(key3);

    // Evict key2.
    cache.set(key3, 'z');
    expectMetrics.totalQueryCount += 1;
    t.deepEqual(getMetrics(), expectMetrics);
    assertEntry(key1, 'x');
    assertNoEntry(key2);
    assertEntry(key3, 'z');

    // Overwrite key3.
    cache.set(key3, 'zz');
    expectMetrics.totalQueryCount += 1;
    expectMetrics.totalHitCount += 1;
    t.deepEqual(getMetrics(), expectMetrics);
    assertEntry(key1, 'x');
    assertNoEntry(key2);
    assertEntry(key3, 'zz');

    // Evict key1.
    cache.set(key2, 'y');
    expectMetrics.totalQueryCount += 1;
    t.deepEqual(getMetrics(), expectMetrics);
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
    expectMetrics.totalQueryCount += 1;
    t.deepEqual(getMetrics(), expectMetrics);
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
    expectMetrics.totalQueryCount += 3;
    t.deepEqual(getMetrics(), expectMetrics);
    assertNoEntry(key1);
    assertEntry(key2, 'yy');
    assertEntry(key3, 'zz');
  },
);

test('makeCacheMapKit (implicitly weak)', testMakeCacheMapKit, {
  makeMap: undefined,
  expectTag: 'WeakCacheMap',
  keys: [{}, Symbol('unique symbol'), {}],
  badKeys: /** @type {any} */ (['unweakable']),
});
test('makeCacheMapKit (weak)', testMakeCacheMapKit, {
  makeMap: () => new WeakMap(),
  expectTag: 'WeakCacheMap',
  keys: [{}, Symbol('unique symbol'), {}],
  badKeys: /** @type {any} */ (['unweakable']),
});
test('makeCacheMapKit (strong)', testMakeCacheMapKit, {
  makeMap: Map,
  expectTag: 'CacheMap',
  keys: [{}, Symbol('unique symbol'), 'string key'],
});

test('makeCacheMapKit(1)', t => {
  const { cache, getMetrics } = makeCacheMapKit(1);

  const expectMetrics = { totalQueryCount: 0, totalHitCount: 0 };

  const [key1, key2] = [{}, Symbol('unique symbol')];

  const assertNoEntry = key => {
    t.is(cache.has(key), false);
    t.is(cache.get(key), undefined);
    expectMetrics.totalQueryCount += 2;
    t.deepEqual(getMetrics(), expectMetrics);
  };
  const assertEntry = (key, expectedValue) => {
    t.is(cache.has(key), true);
    t.is(cache.get(key), expectedValue);
    expectMetrics.totalQueryCount += 2;
    expectMetrics.totalHitCount += 2;
    t.deepEqual(getMetrics(), expectMetrics);
  };

  assertNoEntry(key1);
  assertNoEntry(key2);

  // Populate up to capacity.
  cache.set(key1, 'x');
  expectMetrics.totalQueryCount += 1;
  assertEntry(key1, 'x');

  // Evict key1.
  cache.set(key2, 'y');
  expectMetrics.totalQueryCount += 1;
  assertNoEntry(key1);
  assertEntry(key2, 'y');

  // Evict key2.
  cache.set(key1, 'xx');
  expectMetrics.totalQueryCount += 1;
  assertNoEntry(key2);
  assertEntry(key1, 'xx');

  // Overwrite key1.
  cache.set(key1, 'xxx');
  expectMetrics.totalQueryCount += 1;
  expectMetrics.totalHitCount += 1;
  assertNoEntry(key2);
  assertEntry(key1, 'xxx');

  // Delete key1.
  cache.delete(key1);
  assertNoEntry(key1);
  assertNoEntry(key2);
});

test('makeCacheMapKit(0)', t => {
  const { cache, getMetrics } = makeCacheMapKit(0);

  const expectMetrics = { totalQueryCount: 0, totalHitCount: 0 };

  const [key1, key2] = [{}, Symbol('unique symbol')];

  const assertNoEntry = key => {
    t.is(cache.has(key), false);
    t.is(cache.get(key), undefined);
    expectMetrics.totalQueryCount += 2;
    t.deepEqual(getMetrics(), expectMetrics);
  };
  // eslint-disable-next-line no-unused-vars
  const assertEntry = (key, expectedValue) => {
    t.is(cache.has(key), true);
    t.is(cache.get(key), expectedValue);
    expectMetrics.totalQueryCount += 2;
    expectMetrics.totalHitCount += 2;
    t.deepEqual(getMetrics(), expectMetrics);
  };

  assertNoEntry(key1);
  assertNoEntry(key2);

  cache.set(key1, 'x');
  expectMetrics.totalQueryCount += 1;
  assertNoEntry(key1);
  assertNoEntry(key2);

  cache.set(key1, 'xx');
  expectMetrics.totalQueryCount += 1;
  assertNoEntry(key1);
  assertNoEntry(key2);

  cache.set(key2, 'y');
  expectMetrics.totalQueryCount += 1;
  assertNoEntry(key1);
  assertNoEntry(key2);

  cache.delete(key1);
  assertNoEntry(key1);
  assertNoEntry(key2);
});

test('makeCacheMapKit argument validation', t => {
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
      () => makeCacheMapKit(capacity),
      undefined,
      `capacity: ${typeof capacity} ${capacity}`,
    );
  }
});
