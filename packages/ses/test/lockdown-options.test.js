import test from 'ava';
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
