import test from 'ava';
import '../index.js';

// See https://github.com/zloirock/core-js/issues/1092
// Does not detect https://github.com/endojs/endo/issues/2598 because
// `push` is not toplevel.
// See tolerate-empty-prototype-toplevel.test.js
const originalPush = Array.prototype.push;
// eslint-disable-next-line no-extend-native
Array.prototype.push = function push(...args) {
  return Reflect.apply(originalPush, this, args);
};

lockdown();

test('tolerate empty prototype', t => {
  t.assert('prototype' in Array.prototype.push);
  t.is(Array.prototype.push.prototype, undefined);
  t.deepEqual(
    Object.getOwnPropertyDescriptor(Array.prototype.push, 'prototype'),
    {
      value: undefined,
      writable: !!harden.isFake,
      enumerable: false,
      configurable: false,
    },
  );
});
