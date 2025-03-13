/* global globalThis */
import test from 'ava';
import '../index.js';

// See https://github.com/zloirock/core-js/issues/1092
// See https://github.com/endojs/endo/issues/2598
const originalEscape = globalThis.escape;
globalThis.escape = function escape(...args) {
  return Reflect.apply(originalEscape, this, args);
};

lockdown();

test('tolerate empty escape.prototype', t => {
  t.is(globalThis.escape, escape);
  t.assert('prototype' in escape);
  t.is(escape.prototype, undefined);
  t.deepEqual(Object.getOwnPropertyDescriptor(escape, 'prototype'), {
    value: undefined,
    writable: !!harden.isFake,
    enumerable: false,
    configurable: false,
  });
});
