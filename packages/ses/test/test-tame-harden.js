import '../index.js';
import test from 'ava';
import {
  isFrozen,
  isSealed,
  isExtensible,
  reflectIsExtensible,
} from '../src/commons.js';

lockdown({ __hardenTaming__: 'unsafe' });

test('fake harden', t => {
  t.is(harden.isFake, true);

  const assertFakeFrozen = specimen => {
    // Built-in function replacements must report frozenness.
    t.is(Object.isExtensible(specimen), false);
    t.is(Object.isFrozen(specimen), true);
    t.is(Object.isSealed(specimen), true);
    t.is(Reflect.isExtensible(specimen), false);

    // In-the-know functions must report the truth.
    t.is(isExtensible(specimen), true);
    t.is(isFrozen(specimen), false);
    t.is(isSealed(specimen), false);
    t.is(reflectIsExtensible(specimen), true);
  };

  const obj = {};
  assertFakeFrozen(obj);

  harden(obj);
  assertFakeFrozen(obj);
});
