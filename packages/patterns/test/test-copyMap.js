import { test } from './prepare-test-env-ava.js';
// eslint-disable-next-line import/order
import { getTag, passStyleOf } from '@endo/marshal';
import { getCopyMapEntries, makeCopyMap } from '../src/keys/checkKey.js';

test('copyMap - iters are passable', t => {
  // See test 'passability of store iters'
  const m = makeCopyMap([
    ['x', 8],
    ['y', 7],
  ]);
  t.is(passStyleOf(m), 'tagged');
  t.is(getTag(m), 'copyMap');
  const i = getCopyMapEntries(m);
  t.is(passStyleOf(i), 'remotable');
  const iter = i[Symbol.iterator]();
  t.is(passStyleOf(iter), 'remotable');
  const iterResult = iter.next();
  t.is(passStyleOf(iterResult), 'copyRecord');
});
