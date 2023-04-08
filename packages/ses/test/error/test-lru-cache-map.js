import test from 'ava';

import { makeLRUCacheMap } from '../../src/error/note-log-args.js';

test('lru cache map basic', t => {
  const lruMap = makeLRUCacheMap(2);
  const key1 = {};
  const key2 = {};
  const key3 = {};
  t.is(lruMap.has(key1), false);

  lruMap.set(key1, 'x');
  lruMap.set(key2, 'y');
  t.is(lruMap.has(key2), true);
  t.is(lruMap.has(key1), true);
  t.is(lruMap.has(key3), false);

  lruMap.set(key3, 'z');
  t.is(lruMap.has(key1), true);
  t.is(lruMap.has(key2), false);
  t.is(lruMap.has(key3), true);
});
