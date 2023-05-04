import test from 'ava';
import '../index.js';

import { defineProperty, getOwnPropertyDescriptor } from '../src/commons.js';

defineProperty(Symbol, 'dummy', {
  value: Symbol.for('faux well known symbol'),
  writable: false,
  enumerable: false,
  configurable: false,
});

// Since Symbol.dummy is not even mentioned on the whitelist, this test should
// also print
// "Removing intrinsics.Symbol.dummy"
// on the console.
lockdown();

test('Symbol cleaned by whitelist', t => {
  t.false('dummy' in Symbol);
  t.false(getOwnPropertyDescriptor(Symbol, 'iterator').configurable);
});
