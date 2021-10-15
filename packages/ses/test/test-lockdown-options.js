import test from 'ava';
import { lockdown } from '../src/lockdown-shim.js';

test('lockdown throws with non-recognized options', t => {
  t.throws(
    () => lockdown({ mathTaming: 'unsafe', abc: true }),
    undefined,
    'throws with value true',
  );
  t.throws(
    () => lockdown({ mathTaming: 'unsafe', abc: false }),
    undefined,
    'throws with value false',
  );
});
