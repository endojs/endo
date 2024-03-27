import test from '@endo/ses-ava/prepare-endo.js';

import {
  makeBidirectionalMultimap,
  makeMultimap,
  makeWeakMultimap,
} from '../src/multimap.js';

[
  [makeMultimap, 'multimap'],
  [makeWeakMultimap, 'weakMultimap'],
].forEach(([multimapConstructor, mapName]) => {
  test(`${mapName}: add and get`, t => {
    const multimap = multimapConstructor();
    const key = {};
    const value = 'foo';

    multimap.add(key, value);
    t.is(multimap.get(key), value);

    // Adding a value for a key should be idempotent.
    multimap.add(key, value);
    t.is(multimap.get(key), value);
  });

  test(`${mapName}: add and get with multiple keys`, t => {
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
    const key = {};
    const value1 = 'foo';
    const value2 = 'bar';

    multimap.add(key, value1);
    multimap.add(key, value2);
    t.deepEqual(multimap.getAll(key), [value1, value2]);

    // Adding a value for a key should be idempotent.
    multimap.add(key, value1);
    multimap.add(key, value2);
    t.deepEqual(multimap.getAll(key), [value1, value2]);
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

test('bimap: add and getValue', t => {
  const bimap = makeBidirectionalMultimap();
  const key = 'foo';
  const value = {};

  bimap.add(key, value);
  t.is(bimap.getValue(key), value);

  // Adding a value for the same key should be idempotent.
  bimap.add(key, value);
  t.is(bimap.getValue(key), value);
});

test('bimap: getAllValues', t => {
  const bimap = makeBidirectionalMultimap();
  const key = 'foo';
  const value1 = {};
  const value2 = {};

  bimap.add(key, value1);
  bimap.add(key, value2);
  t.deepEqual(bimap.getAllValues(key), [value1, value2]);

  // Adding a value for the same key should be idempotent.
  bimap.add(key, value1);
  bimap.add(key, value2);
  t.deepEqual(bimap.getAllValues(key), [value1, value2]);
});

test('bimap: add and get', t => {
  const bimap = makeBidirectionalMultimap();
  const key = 'foo';
  const value = {};

  bimap.add(key, value);
  t.is(bimap.get(value), key);

  // Adding a value for the same key should be idempotent.
  bimap.add(key, value);
  t.is(bimap.get(value), key);
});

test('bimap: add and get with multiple values', t => {
  const bimap = makeBidirectionalMultimap();
  const key1 = 'foo';
  const value1 = {};
  const value2 = {};

  bimap.add(key1, value1);
  bimap.add(key1, value2);

  t.is(bimap.get(value1), key1);
  t.is(bimap.get(value2), key1);
});

test('bimap: key remapping', t => {
  const bimap = makeBidirectionalMultimap();
  const key1 = 'foo';
  const key2 = 'bar';
  const value1 = {};
  const value2 = {};

  bimap.add(key1, value1);
  bimap.add(key1, value2);
  t.is(bimap.get(value1), key1);
  t.is(bimap.get(value2), key1);

  t.throws(() => bimap.add(key2, value1), {
    message: `May not remap key "foo" of existing value to new key "bar". Delete the original mapping first.`,
  });

  bimap.delete(key1, value2);
  bimap.add(key2, value2);

  t.is(bimap.get(value1), key1);
  t.is(bimap.get(value2), key2);
});

test('bimap: delete', t => {
  const bimap = makeBidirectionalMultimap();
  const key = 'foo';
  const value = {};

  bimap.add(key, value);

  t.is(bimap.getValue(key), value);
  t.is(bimap.delete(key, value), true);
  t.is(bimap.getValue(key), undefined);

  // Deleting should be idempotent.
  t.is(bimap.delete(key, value), false);
  t.is(bimap.getValue(key), undefined);
});

test('bimap: deleteAll', t => {
  const bimap = makeBidirectionalMultimap();
  const key = 'foo';
  const value1 = {};
  const value2 = {};

  bimap.add(key, value1);
  bimap.add(key, value2);

  t.deepEqual(bimap.getAllValues(key), [value1, value2]);
  t.is(bimap.deleteAll(key), true);
  t.is(bimap.getValue(key), undefined);

  // Deleting should be idempotent.
  t.is(bimap.deleteAll(key), false);
  t.is(bimap.getValue(key), undefined);
});
