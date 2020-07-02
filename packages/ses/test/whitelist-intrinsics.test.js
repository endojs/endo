import tap from 'tap';
import '../src/main.js';
import { repairIntrinsics } from '../src/lockdown-shim.js';

const { test } = tap;

// eslint-disable-next-line no-eval
if (!eval.toString().includes('native code')) {
  throw new TypeError('Module "esm" enabled: aborting');
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
  const hardenIntrinsics = repairIntrinsics();
  console.timeEnd('Benchmark repairIntrinsics()');

  console.time('Benchmark hardenIntrinsics()');
  hardenIntrinsics();
  console.timeEnd('Benchmark hardenIntrinsics()');

  t.equal(globalThis.foo, 1);
  t.equal(Object.foo, undefined);
  t.equal(Object.freeze.foo, undefined);
  t.equal(Object.prototype.foo, undefined);
  t.equal(Object.prototype.hasOwnProperty.foo, undefined);

  delete globalThis.foo;
  t.end();
});
