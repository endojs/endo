import { test } from './prepare-test-env-ava.js';
import { fromUniqueEntries } from '../from-unique-entries.js';

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

  /** @type {[string | symbol, number][]} */
  const goodEntries = [
    ['a', 7],
    ['b', 8],
    [Symbol.hasInstance, 9],
  ];
  const goodObj1 = Object.fromEntries(goodEntries);
  t.deepEqual(goodObj1, {
    a: 7,
    b: 8,
    [Symbol.hasInstance]: 9,
  });
  const goodObj2 = fromUniqueEntries(goodEntries);
  t.deepEqual(goodObj2, goodObj1);

  /** @type {[string | symbol, number][]} */
  const badEntries = [
    ['a', 7],
    ['a', 8],
    [Symbol.hasInstance, 9],
  ];
  const badObj = Object.fromEntries(badEntries);
  t.deepEqual(badObj, {
    a: 8,
    [Symbol.hasInstance]: 9,
  });
  t.throws(() => fromUniqueEntries(badEntries), {
    message: /^collision on property name "a": .*$/,
  });
});
