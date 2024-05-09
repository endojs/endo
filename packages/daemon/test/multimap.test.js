import test from '@endo/ses-ava/prepare-endo.js';

import {
  makeBidirectionalMultimap,
  makeMultimap,
  makeWeakMultimap,
} from '../src/multimap.js';

[
  [makeMultimap, 'multimap'],
  [makeWeakMultimap, 'weak multimap'],
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
    t.deepEqual(multimap.getAllFor(key1), [value1, value2]);
    t.is(multimap.get(key2), value1);
    t.deepEqual(multimap.getAllFor(key2), [value1]);
  });

  test(`${mapName}: getAll`, t => {
    const multimap = multimapConstructor();
    const key1 = {};
    const key2 = {};
    const value1 = 'foo';
    const value2 = 'bar';

    multimap.add(key1, value1);
    multimap.add(key1, value2);
    t.deepEqual(multimap.getAllFor(key1), [value1, value2]);
    t.deepEqual(multimap.getAllFor(key2), []);

    // Adding a value for a key should be idempotent.
    multimap.add(key1, value1);
    multimap.add(key1, value2);
    t.deepEqual(multimap.getAllFor(key1), [value1, value2]);
    t.deepEqual(multimap.getAllFor(key2), []);
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

    t.deepEqual(multimap.getAllFor(key), [value1, value2]);
    t.is(multimap.deleteAll(key), true);
    t.is(multimap.get(key), undefined);

    // Deleting should be idempotent.
    t.is(multimap.deleteAll(key), false);
    t.is(multimap.get(key), undefined);
  });
});

test('multi-bimap: add', t => {
  const bimap = makeBidirectionalMultimap();
  const key = 'foo';
  const value = {};

  bimap.add(key, value);
  t.is(bimap.get(key), value);
  t.is(bimap.getKey(value), key);

  // Adding a value for the same key should be idempotent.
  bimap.add(key, value);
  t.is(bimap.get(key), value);
  t.is(bimap.getKey(value), key);
});

test('multi-bimap: get', t => {
  const bimap = makeBidirectionalMultimap();
  const key1 = 'foo';
  const key2 = 'bar';
  const key3 = 'baz';
  const value1 = {};
  const value2 = {};

  bimap.add(key1, value1);
  bimap.add(key2, value2);

  t.is(bimap.get(key1), value1);
  t.is(bimap.get(key2), value2);
  t.is(bimap.get(key3), undefined);
});

test('multi-bimap: get (multiple values per key)', t => {
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

test('multi-bimap: getAll', t => {
  const bimap = makeBidirectionalMultimap();
  const key1 = 'foo';
  const value1 = {};
  const value2 = {};

  t.deepEqual(bimap.getAll(), []);

  bimap.add(key1, value1);
  bimap.add(key1, value2);

  t.deepEqual(bimap.getAll(), [value1, value2]);
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

test('multi-bimap: getKey', t => {
  const bimap = makeBidirectionalMultimap();
  const key1 = 'foo';
  const value1 = {};
  const value2 = {};
  const value3 = {};

  bimap.add(key1, value1);
  bimap.add(key1, value2);

  t.is(bimap.getKey(value1), key1);
  t.is(bimap.getKey(value2), key1);
  t.is(bimap.getKey(value3), undefined);
});

test('multi-bimap: has', t => {
  const bimap = makeBidirectionalMultimap();
  const key1 = 'foo';
  const key2 = 'bar';
  const key3 = 'baz';
  const value1 = {};
  const value2 = {};

  bimap.add(key1, value1);
  bimap.add(key2, value2);

  t.is(bimap.has(key1), true);
  t.is(bimap.has(key2), true);
  t.is(bimap.has(key3), false);
});

test('multi-bimap: hasValue', t => {
  const bimap = makeBidirectionalMultimap();
  const key1 = 'foo';
  const key2 = 'bar';
  const value1 = {};
  const value2 = {};
  const value3 = {};

  bimap.add(key1, value1);
  bimap.add(key2, value2);

  t.is(bimap.hasValue(value1), true);
  t.is(bimap.hasValue(value2), true);
  t.is(bimap.hasValue(value3), false);
});

test('multi-bimap: delete', t => {
  const bimap = makeBidirectionalMultimap();
  const key = 'foo';
  const value = {};

  bimap.add(key, value);

  t.is(bimap.get(key), value);
  t.is(bimap.delete(key, value), true);
  t.is(bimap.get(key), undefined);

  // Deleting should be idempotent.
  t.is(bimap.delete(key, value), false);
  t.is(bimap.get(key), undefined);
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
