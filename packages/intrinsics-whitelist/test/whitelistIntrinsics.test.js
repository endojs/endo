import test from 'tape';
import getIntrinsics from '@agoric/intrinsics';
import whitelistPrototypes from '..';

test('whitelistPrototypes - on', t => {
  t.plan(5);
  // This test will modify intrinsics and should be executed
  // in a brand new realm.

  // eslint-disable-next-line no-new-func
  const global = Function('return this')();

  global.foo = 1;
  Object.foo = 1;
  Object.freeze.foo = 1;
  // eslint-disable-next-line no-extend-native
  Object.prototype.foo = 1;
  Object.prototype.hasOwnProperty.foo = 1;

  console.time('Benchmark getIntrinsics()');
  const intrinsics = getIntrinsics();
  console.timeEnd('Benchmark getIntrinsics()');

  console.time('Benchmark whitelistPrototypes()');
  whitelistPrototypes(intrinsics);
  console.timeEnd('Benchmark whitelistPrototypes()');

  t.equal(global.foo, 1);
  t.equal(Object.foo, undefined);
  t.equal(Object.freeze.foo, undefined);
  t.equal(Object.prototype.foo, undefined);
  t.equal(Object.prototype.hasOwnProperty.foo, undefined);

  delete global.foo;
});
