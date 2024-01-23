import { test } from './prepare-test-env-ava.js';
import { makeArrayIterator } from '../make-array-iterator.js';

// Also serves as an adequate test of make-iterator.js

test('test makeArrayIterator', async t => {
  const iter = makeArrayIterator([1, 2, 3]);
  t.is(iter[Symbol.iterator](), iter);
  t.deepEqual(iter.next(), {
    done: false,
    value: 1,
  });
  t.deepEqual([...iter], [2, 3]);
  t.deepEqual(iter.next(), {
    done: true,
    value: undefined,
  });
});
