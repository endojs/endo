import test from '@endo/ses-ava/prepare-endo.js';

import {
  makeBidirectionalMap,
  makeBidirectionalMultimap,
  makeMultimap,
  makeWeakMultimap,
} from '../src/multimap.js';

[
  [makeMultimap, 'multimap'],
  [makeWeakMultimap, 'weakMultimap'],
].forEach(([multimapConstructor, mapName]) => {
  test(`${mapName}: add`, t => {
    const multimap = multimapConstructor();
    const key = {};
    const value = 'foo';

    multimap.add(key, value);
    t.is(multimap.get(key), value);

    // Adding a value for a key should be idempotent.
    multimap.add(key, value);
    t.is(multimap.get(key), value);
  });

  test(`${mapName}: get`, t => {
    const multimap = multimapConstructor();
    const key1 = {};
    const key2 = {};
    const value1 = 'foo';
    const value2 = 'bar';

    multimap.add(key1, value1);
    multimap.add(key1, value2);
    multimap.add(key2, value1);

    t.is(multimap.get(key1), value1);
    t.deepEqual(multimap.getAll(key1), [value1, value2]);
    t.is(multimap.get(key2), value1);
    t.deepEqual(multimap.getAll(key2), [value1]);
  });

  test(`${mapName}: getAll`, t => {
    const multimap = multimapConstructor();
    const key1 = {};
    const key2 = {};
    const value1 = 'foo';
    const value2 = 'bar';

    multimap.add(key1, value1);
    multimap.add(key1, value2);
    t.deepEqual(multimap.getAll(key1), [value1, value2]);
    t.deepEqual(multimap.getAll(key2), []);

    // Adding a value for a key should be idempotent.
    multimap.add(key1, value1);
    multimap.add(key1, value2);
    t.deepEqual(multimap.getAll(key1), [value1, value2]);
    t.deepEqual(multimap.getAll(key2), []);
  });

  test(`${mapName}: has`, t => {
    const multimap = multimapConstructor();
    const key1 = {};
    const key2 = {};
    const key3 = {};
    const value1 = 'foo';
    const value2 = 'bar';

    multimap.add(key1, value1);
    multimap.add(key1, value2);
    multimap.add(key2, value1);

    t.is(multimap.has(key1), true);
    t.is(multimap.has(key2), true);
    t.is(multimap.has(key3), false);
  });

  test(`${mapName}: delete`, t => {
    const multimap = multimapConstructor();
    const key = {};
    const value = 'foo';

    multimap.add(key, value);

    t.is(multimap.get(key), value);
    t.is(multimap.delete(key, value), true);
    t.is(multimap.get(key), undefined);

    // Deleting should be idempotent.
    t.is(multimap.delete(key, value), false);
    t.is(multimap.get(key), undefined);
  });

  test(`${mapName}: deleteAll`, t => {
    const multimap = multimapConstructor();
    const key = {};
    const value1 = 'foo';
    const value2 = 'bar';

    multimap.add(key, value1);
    multimap.add(key, value2);

    t.deepEqual(multimap.getAll(key), [value1, value2]);
    t.is(multimap.deleteAll(key), true);
    t.is(multimap.get(key), undefined);

    // Deleting should be idempotent.
    t.is(multimap.deleteAll(key), false);
    t.is(multimap.get(key), undefined);
  });
});

[
  [makeBidirectionalMap, 'set', 'bimap'],
  [makeBidirectionalMultimap, 'add', 'multi-bimap'],
].forEach(([bimapConstructor, insertionFnName, bimapName]) => {
  test(`${bimapName}: ${insertionFnName}`, t => {
    const bimap = bimapConstructor();
    const key = 'foo';
    const value = {};

    bimap[insertionFnName](key, value);
    t.is(bimap.get(key), value);
    t.is(bimap.getKey(value), key);

    // Adding a value for the same key should be idempotent.
    bimap[insertionFnName](key, value);
    t.is(bimap.get(key), value);
    t.is(bimap.getKey(value), key);
  });

  test(`${bimapName}: get`, t => {
    const bimap = bimapConstructor();
    const key1 = 'foo';
    const key2 = 'bar';
    const key3 = 'baz';
    const value1 = {};
    const value2 = {};

    bimap[insertionFnName](key1, value1);
    bimap[insertionFnName](key2, value2);

    t.is(bimap.get(key1), value1);
    t.is(bimap.get(key2), value2);
    t.is(bimap.get(key3), undefined);
  });

  test(`${bimapName}: getAll`, t => {
    const bimap = bimapConstructor();
    const key1 = 'foo';
    const value1 = {};
    const value2 = {};

    t.deepEqual(bimap.getAll(), []);

    bimap[insertionFnName](key1, value1);
    bimap[insertionFnName](key1, value2);

    t.deepEqual(bimap.getAll(), [value1, value2]);
  })

  test(`${bimapName}: getKey`, t => {
    const bimap = bimapConstructor();
    const key1 = 'foo';
    const value1 = {};
    const value2 = {};
    const value3 = {};

    bimap[insertionFnName](key1, value1);
    bimap[insertionFnName](key1, value2);

    t.is(bimap.getKey(value1), key1);
    t.is(bimap.getKey(value2), key1);
    t.is(bimap.getKey(value3), undefined);
  });

  test(`${bimapName}: has`, t => {
    const bimap = bimapConstructor();
    const key1 = 'foo';
    const key2 = 'bar';
    const key3 = 'baz';
    const value1 = {};
    const value2 = {};

    bimap[insertionFnName](key1, value1);
    bimap[insertionFnName](key2, value2);

    t.is(bimap.has(key1), true);
    t.is(bimap.has(key2), true);
    t.is(bimap.has(key3), false);
  });

  test(`${bimapName}: hasValue`, t => {
    const bimap = bimapConstructor();
    const key1 = 'foo';
    const key2 = 'bar';
    const value1 = {};
    const value2 = {};
    const value3 = {};

    bimap[insertionFnName](key1, value1);
    bimap[insertionFnName](key2, value2);

    t.is(bimap.hasValue(value1), true);
    t.is(bimap.hasValue(value2), true);
    t.is(bimap.hasValue(value3), false);
  });

  test(`${bimapName}: delete`, t => {
    const bimap = bimapConstructor();
    const key = 'foo';
    const value = {};

    bimap[insertionFnName](key, value);

    t.is(bimap.get(key), value);
    t.is(bimap.delete(key, value), true);
    t.is(bimap.get(key), undefined);

    // Deleting should be idempotent.
    t.is(bimap.delete(key, value), false);
    t.is(bimap.get(key), undefined);
  });
});

test('bimap: key remapping', t => {
  const bimap = makeBidirectionalMap();
  const key1 = 'foo';
  const key2 = 'bar';
  const value1 = {};
  const value2 = {};

  bimap.set(key1, value1);
  bimap.set(key2, value2);
  t.is(bimap.getKey(value1), key1);
  t.is(bimap.getKey(value2), key2);

  bimap.set(key1, value2);
  bimap.set(key2, value1);

  t.is(bimap.getKey(value1), key2);
  t.is(bimap.getKey(value2), key1);
});

test('multi-bimap: key remapping', t => {
  const bimap = makeBidirectionalMultimap();
  const key1 = 'foo';
  const key2 = 'bar';
  const value1 = {};
  const value2 = {};

  bimap.add(key1, value1);
  bimap.add(key1, value2);
  t.is(bimap.getKey(value1), key1);
  t.is(bimap.getKey(value2), key1);

  t.throws(() => bimap.add(key2, value1), {
    message: `May not remap key "foo" of existing value to new key "bar". Delete the original mapping first.`,
  });

  bimap.delete(key1, value2);
  bimap.add(key2, value2);

  t.is(bimap.getKey(value1), key1);
  t.is(bimap.getKey(value2), key2);
});

test('multi-bimap: getValue (multiple per key)', t => {
  const bimap = makeBidirectionalMultimap();
  const key1 = 'foo';
  const key2 = 'bar';
  const value1 = {};
  const value2 = {};
  const value3 = {};

  bimap.add(key1, value1);
  bimap.add(key1, value2);
  bimap.add(key2, value3);

  t.is(bimap.get(key1), value1);
  t.is(bimap.get(key2), value3);
  t.is(bimap.hasValue(value2), true);
});

test('multi-bimap: getAllFor', t => {
  const bimap = makeBidirectionalMultimap();
  const key1 = 'foo';
  const key2 = 'bar';
  const value1 = {};
  const value2 = {};

  bimap.add(key1, value1);
  bimap.add(key1, value2);
  t.deepEqual(bimap.getAllFor(key1), [value1, value2]);
  t.deepEqual(bimap.getAllFor(key2), []);

  // Adding a value for the same key should be idempotent.
  bimap.add(key1, value1);
  bimap.add(key1, value2);
  t.deepEqual(bimap.getAllFor(key1), [value1, value2]);
  t.deepEqual(bimap.getAllFor(key2), []);
});

test('multi-bimap: deleteAll', t => {
  const bimap = makeBidirectionalMultimap();
  const key = 'foo';
  const value1 = {};
  const value2 = {};

  bimap.add(key, value1);
  bimap.add(key, value2);

  t.deepEqual(bimap.getAllFor(key), [value1, value2]);
  t.is(bimap.deleteAll(key), true);
  t.is(bimap.get(key), undefined);

  // Deleting should be idempotent.
  t.is(bimap.deleteAll(key), false);
  t.is(bimap.get(key), undefined);
});
