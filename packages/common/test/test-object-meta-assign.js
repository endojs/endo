import test from '@endo/ses-ava';
import { objectMetaAssign } from '../object-meta-assign.js';

test('test objectMetaAssign', async t => {
  t.deepEqual(objectMetaAssign({}, { a: 1 }, { a: 2, b: 3 }), { a: 2, b: 3 });

  // TODO more testing
});
