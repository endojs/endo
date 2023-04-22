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

test('whitelistPrototypes - on', t => {
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

  t.is(globalThis.foo, 1);
  t.is(Object.foo, undefined);
  t.is(Object.freeze.foo, undefined);
  t.is(Object.prototype.foo, undefined);
  t.is(Object.prototype.hasOwnProperty.foo, undefined);

  delete globalThis.foo;
});
