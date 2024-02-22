import test from 'ava';
import { makeWeakMultimap } from '../src/weak-multimap.js';

test('add and get', t => {
  const multimap = makeWeakMultimap();
  const ref = {};
  const value = 'foo';

  multimap.add(ref, value);
  t.is(multimap.get(ref), value);

  // Adding a value for a key should be idempotent.
  multimap.add(ref, value);
  t.is(multimap.get(ref), value);
});

test('add and get with multiple refs', t => {
  const multimap = makeWeakMultimap();
  const ref1 = {};
  const ref2 = {};
  const value1 = 'foo';
  const value2 = 'bar';

  multimap.add(ref1, value1);
  multimap.add(ref1, value2);
  multimap.add(ref2, value1);

  t.is(multimap.get(ref1), value1);
  t.deepEqual(multimap.getAll(ref1), [value1, value2]);
  t.is(multimap.get(ref2), value1);
  t.deepEqual(multimap.getAll(ref2), [value1]);
});

test('getAll', t => {
  const multimap = makeWeakMultimap();
  const ref = {};
  const value1 = 'foo';
  const value2 = 'bar';

  multimap.add(ref, value1);
  multimap.add(ref, value2);
  t.deepEqual(multimap.getAll(ref), [value1, value2]);

  // Adding a value for a key should be idempotent.
  multimap.add(ref, value1);
  multimap.add(ref, value2);
  t.deepEqual(multimap.getAll(ref), [value1, value2]);
});

test('delete', t => {
  const multimap = makeWeakMultimap();
  const ref = {};
  const value = 'foo';

  multimap.add(ref, value);

  t.is(multimap.get(ref), value);
  t.is(multimap.delete(ref, value), true);
  t.is(multimap.get(ref), undefined);

  // Deleting should be idempotent.
  t.is(multimap.delete(ref, value), false);
  t.is(multimap.get(ref), undefined);
});

test('deleteAll', t => {
  const multimap = makeWeakMultimap();
  const ref = {};
  const value1 = 'foo';
  const value2 = 'bar';

  multimap.add(ref, value1);
  multimap.add(ref, value2);

  t.deepEqual(multimap.getAll(ref), [value1, value2]);
  t.is(multimap.deleteAll(ref), true);
  t.is(multimap.get(ref), undefined);

  // Deleting should be idempotent.
  t.is(multimap.deleteAll(ref), false);
  t.is(multimap.get(ref), undefined);
});
