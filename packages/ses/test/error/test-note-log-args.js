// @ts-check
import test from 'ava';

import { makeNoteLogArgsArrayKit } from '../../src/error/note-log-args.js';
import { makeLRUCacheMap } from '../../src/make-lru-cachemap.js';

test('note log args array kit basic', t => {
  const { addLogArgs, takeLogArgsArray } = makeNoteLogArgsArrayKit(3, 2);
  const e1 = Error('e1');
  const e2 = Error('e2');
  const e3 = Error('e3');
  const e4 = Error('e4');

  addLogArgs(e1, ['a']);
  addLogArgs(e3, ['b']);
  addLogArgs(e2, ['c']);
  addLogArgs(e4, ['d']); // drops e1
  addLogArgs(e1, ['e']); // new e1 entry, drops e3
  addLogArgs(e2, ['f']);
  addLogArgs(e2, ['g']); // drops e2,c
  addLogArgs(e2, ['h']); // drops e2,f
  t.deepEqual(takeLogArgsArray(e1), [['e']]);
  t.deepEqual(takeLogArgsArray(e2), [['g'], ['h']]);
  t.deepEqual(takeLogArgsArray(e3), undefined);
  t.deepEqual(takeLogArgsArray(e4), [['d']]);
});

test('weak LRUCacheMap', t => {
  /** @type {WeakMap<{}, number>} */
  const lru = makeLRUCacheMap(3);
  const o1 = {};
  const o2 = {};
  const o3 = {};
  const o4 = {};

  // Overflow drops the oldest.
  lru.set(o1, 1);
  t.is(lru.get(o1), 1);
  lru.set(o3, 2);
  lru.set(o2, 3);
  lru.set(o4, 4); // drops o1
  t.falsy(lru.has(o1));
  t.is(lru.get(o4), 4);
  lru.set(o4, 5);
  t.is(lru.get(o4), 5);
  t.true(lru.has(o4));
  lru.set(o1, 6); // drops o3
  t.is(lru.get(o1), 6);
  t.false(lru.has(o3));

  // Explicit delete keeps all other elements.
  lru.delete(o1); // explicit delete o1
  t.is(lru.get(o1), undefined);
  t.false(lru.has(o1));
  t.true(lru.has(o2));
  t.true(lru.has(o4));
  t.false(lru.has(o3));
  lru.set(o3, 7);
  lru.set(o1, 8); // drops o2
  t.false(lru.has(o2));
  t.is(lru.get(o1), 8);
  t.is(lru.get(o3), 7);
});
