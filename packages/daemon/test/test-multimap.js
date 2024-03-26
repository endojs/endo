import test from 'ava';
import { makeMultimap, makeWeakMultimap } from '../src/multimap.js';

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
