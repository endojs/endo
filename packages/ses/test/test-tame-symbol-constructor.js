import test from 'ava';
import '../index.js';

import {
  defineProperty,
  getOwnPropertyDescriptor as gopd,
  isExtensible,
  isFrozen,
} from '../src/commons.js';

defineProperty(Symbol, 'dummy', {
  value: Symbol.for('faux well known symbol'),
  writable: false,
  enumerable: false,
  configurable: false,
});

// Since %SharedSymbol%.dummy is not even mentioned on the whitelist,
// this test should also print on the console:
// > Removing intrinsics.%SharedSymbol%.dummy
lockdown();

test('Symbol cleaned by permits', t => {
  t.true('dummy' in Symbol);
  t.false(gopd(Symbol, 'iterator').configurable);
  t.true(isExtensible(Symbol));
  t.false(isFrozen(Symbol));
  t.not(Symbol.constructor, Symbol);

  const c = new Compartment();
  const SharedSymbol = c.globalThis.Symbol;
  t.is(Symbol.prototype, SharedSymbol.prototype);

  t.throws(() => SharedSymbol.dummy, {
    message:
      'property intrinsics.%SharedSymbol%.dummy removed from Hardened JS',
  });
  t.false(gopd(SharedSymbol, 'iterator').configurable);
  t.false(isExtensible(SharedSymbol));
  t.true(isFrozen(SharedSymbol));
  t.is(SharedSymbol.prototype.constructor, SharedSymbol);
});
