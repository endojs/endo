import test from 'ava';
import '../index.js';
import { getOwnPropertyDescriptor } from '../src/commons.js';

test.before(() => {
  lockdown();
});

test('check if override-protected primordials are frozen', t => {
  // After removing the detachedProperties mechanism and without
  // the originalValue mechanism, this test failed.
  t.truthy(Object.isFrozen(Object.prototype.toString));

  const desc = getOwnPropertyDescriptor(Object.prototype, 'toString');
  t.is(desc.get.originalValue, Object.prototype.toString);
});

test('check if Object prototype is frozen', t => {
  t.truthy(Object.isFrozen(Object.prototype));
});
