import { test } from './prepare-test-env-ava.js';
import { makeCopyBag } from '../src/keys/checkKey.js';

test('ordering', t => {
  const bag = makeCopyBag([
    ['z', 26n],
    ['a', 1n],
    ['b', 2n],
    ['c', 3n],
  ]);
  t.deepEqual(bag.payload, [
    ['z', 26n],
    ['c', 3n],
    ['b', 2n],
    ['a', 1n],
  ]);
});

test('types', t => {
  const bag = makeCopyBag([['a', 1n]]);

  // TODO: restore at-ts-expect-error should not be 'any'
  bag.payload.foo;
  const [str, count] = bag.payload[0];
  str.concat; // string
  count + 1n; // bigint

  t.pass();
});

test('duplicate keys', t => {
  t.throws(
    () =>
      makeCopyBag([
        ['a', 1n],
        ['a', 1n],
      ]),
    { message: 'value has duplicate keys: "a"' },
  );
});
