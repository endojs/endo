/* global globalThis */

import test from 'ava';
import '../index.js';
import { repairIntrinsics } from '../src/lockdown-shim.js';
import { getAnonymousIntrinsics } from '../src/get-anonymous-intrinsics.js';
import {
  makeCompartmentConstructor,
  CompartmentPrototype,
} from '../src/compartment-shim.js';

// eslint-disable-next-line no-eval
if (!eval.toString().includes('native code')) {
  throw TypeError('Module "esm" enabled: aborting');
}

test('permitted prototypes - on', t => {
  // This test will modify intrinsics and should be executed
  // in a brand new realm.

  globalThis.foo = 1;
  Object.foo = 1;
  Object.freeze.foo = 1;
  // eslint-disable-next-line no-extend-native
  Object.prototype.foo = 1;
  Object.prototype.hasOwnProperty.foo = 1;

  console.time('Benchmark repairIntrinsics()');
  const hardenIntrinsics = repairIntrinsics(
    makeCompartmentConstructor,
    CompartmentPrototype,
    getAnonymousIntrinsics,
  );
  console.timeEnd('Benchmark repairIntrinsics()');

  console.time('Benchmark hardenIntrinsics()');
  hardenIntrinsics();
  console.timeEnd('Benchmark hardenIntrinsics()');

  const fooPoisoned = obj => {
    t.throws(() => obj.foo, {
      message: /^property .*\.foo removed from Hardened JS$/,
    });
  };

  fooPoisoned(Object);
  fooPoisoned(Object.freeze);
  fooPoisoned(Object.prototype);
  fooPoisoned(Object.prototype.hasOwnProperty);

  t.is(globalThis.foo, 1);
  delete globalThis.foo;
  fooPoisoned(globalThis);

  // Would have broken if the poisoned property were enumerable
  // eslint-disable-next-line prefer-object-spread
  Object.assign({}, Object);
  ({ ...Object });

  // Doesn't break even though it sees the poisoned property, because
  // it gets the getter rather than calling it.
  Object.getOwnPropertyDescriptors(Object);
});
