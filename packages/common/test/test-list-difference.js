import test from '@endo/ses-ava/prepare-endo.js';
import { listDifference } from '../list-difference.js';

test('test listDifference', async t => {
  t.deepEqual(listDifference(['a', 'b', 'c'], ['b', 'c', 'd']), ['a']);
});
