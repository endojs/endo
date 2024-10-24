import test from 'ava';
import { repairIntrinsics } from '../src/lockdown.js';

test('repairIntrinsics throws with non-recognized options', t => {
  t.throws(
    () => repairIntrinsics({ abc: true }),
    undefined,
    'throws with value true',
  );
  t.throws(
    () => repairIntrinsics({ abc: false }),
    undefined,
    'throws with value false',
  );
  t.throws(
    () => repairIntrinsics({ mathTaming: 'unsafe' }),
    undefined,
    'throws with deprecated option mathTaming',
  );
  t.throws(
    () => repairIntrinsics({ dateTaming: 'unsafe' }),
    undefined,
    'throws with deprecated option dateTaming',
  );
});
