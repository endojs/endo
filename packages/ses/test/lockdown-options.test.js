import test from 'tape';
import { makeLockdown } from '../src/lockdown-shim.js';
import { getAnonymousIntrinsics } from '../src/get-anonymous-intrinsics.js';
import {
  makeCompartmentConstructor,
  CompartmentPrototype,
} from '../src/compartment-shim.js';

const lockdown = makeLockdown(
  makeCompartmentConstructor,
  CompartmentPrototype,
  getAnonymousIntrinsics,
);

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
