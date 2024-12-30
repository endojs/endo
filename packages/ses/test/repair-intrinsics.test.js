// @ts-nocheck
/// <reference types="ses"/>
/* global globalThis */

import test from 'ava';
import { repairIntrinsics } from '../src/lockdown.js';
import { getOwnPropertyNames } from '../src/commons.js';
import { initialGlobalPropertyNames } from '../src/permits.js';

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

  // eslint-disable-next-line no-eval
  t.truthy(globalThis.eval && !Object.isFrozen(globalThis.eval));
  t.truthy(globalThis.Function && !Object.isFrozen(globalThis.Function));
  for (const prop of getOwnPropertyNames(initialGlobalPropertyNames)) {
    globalThis[prop] && t.truthy(!Object.isFrozen(globalThis[prop]));
  }

  console.time('Benchmark repairIntrinsics()');
  const hardenIntrinsics = repairIntrinsics();
  console.timeEnd('Benchmark repairIntrinsics()');

  console.time('Benchmark hardenIntrinsics()');
  hardenIntrinsics();
  console.timeEnd('Benchmark hardenIntrinsics()');

  // eslint-disable-next-line no-eval
  t.truthy(globalThis.eval && Object.isFrozen(globalThis.eval));
  t.truthy(globalThis.Function && Object.isFrozen(globalThis.Function));
  t.truthy(globalThis.Compartment && Object.isFrozen(globalThis.Compartment));
  for (const name of getOwnPropertyNames(initialGlobalPropertyNames)) {
    t.assert(globalThis[name] && Object.isFrozen(globalThis[name]));
  }

  t.is(globalThis.foo, 1);
  t.is(Object.foo, undefined);
  t.is(Object.freeze.foo, undefined);
  t.is(Object.prototype.foo, undefined);
  t.is(Object.prototype.hasOwnProperty.foo, undefined);

  delete globalThis.foo;
});
