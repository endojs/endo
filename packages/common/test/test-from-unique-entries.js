import { test } from './prepare-test-env-ava.js';
import { fromUniqueEntries } from '../src/from-unique-entries.js';

test('test fromUniqueEntries', async t => {
  t.deepEqual(
    fromUniqueEntries([
      ['a', 1],
      ['b', 2],
    ]),
    { a: 1, b: 2 },
  );

  t.throws(
    () =>
      fromUniqueEntries([
        ['a', 1],
        ['a', 2],
      ]),
    {
      message: 'collision on property name "a": [["a",1],["a",2]]',
    },
  );
});
