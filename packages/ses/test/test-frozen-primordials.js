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

test('check if arguments prototype is frozen', t => {
  (function gimmeArguments() {
    // eslint-disable-next-line no-proto
    t.truthy(Object.isFrozen(arguments.__proto__));
  })();
});
