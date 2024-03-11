import { test } from '@endo/ses-ava/prepare-test-env-ava.js';
import { listDifference } from '../list-difference.js';

test('test listDifference', async t => {
  t.deepEqual(listDifference(['a', 'b', 'c'], ['b', 'c', 'd']), ['a']);
});
