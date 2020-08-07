import test from 'tape';
import { makeLockdown } from '../src/lockdown-shim.js';

const lockdown = makeLockdown();

test('lockdown throws with non-recognized options', t => {
  t.plan(2);

  t.throws(
    () => lockdown({ mathTaming: 'unsafe', abc: true }),
    'throws with value true',
  );
  t.throws(
    () => lockdown({ mathTaming: 'unsafe', abc: false }),
    'throws with value false',
  );
});
