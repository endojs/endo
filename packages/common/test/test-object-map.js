import { test } from './prepare-test-env-ava.js';
import { objectMap } from '../object-map.js';

test('test objectMap', async t => {
  t.deepEqual(
    objectMap({ a: 1, b: 2 }, n => n * 2),
    { a: 2, b: 4 },
  );
});
