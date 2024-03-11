import { test } from '@endo/ses-ava/prepare-test-env-ava.js';
import { objectMap } from '../object-map.js';

test('test objectMap', async t => {
  t.deepEqual(
    objectMap({ a: 1, b: 2 }, n => n * 2),
    { a: 2, b: 4 },
  );

  t.deepEqual(
    objectMap({ a: 1 }, val => val * 2),
    { a: 2 },
  );

  t.deepEqual(
    objectMap({ a: 1 }, (val, key) => `${key}:${val}`),
    { a: 'a:1' },
  );

  // @ts-expect-error
  t.throws(() => objectMap({ a: 1 }), { message: 'mapFn is not a function' });
});
