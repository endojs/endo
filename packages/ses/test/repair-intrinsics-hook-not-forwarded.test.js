// @ts-nocheck
/* global globalThis */

// The internal `onIntrinsics` parameter of src/lockdown.js receives the raw
// intrinsics, so the public `repairIntrinsics` must not forward it.
// AVA runs this file in its own worker.

import '../index.js';
import test from 'ava';

let hookCalled = false;
globalThis.repairIntrinsics({}, () => {
  hookCalled = true;
});
globalThis.hardenIntrinsics();

test('public repairIntrinsics ignores a second argument', t => {
  t.false(hookCalled);
});
