import test from 'tape';
import '../lockdown.js';
import { getOwnPropertyDescriptor } from '../src/commons.js';

test('check if override-protected primordials are frozen', t => {
  lockdown();

  // After removing the detachedProperties mechanism and without
  // the originalDataPropertyValue mechanism, this test failed.
  t.ok(Object.isFrozen(Object.prototype.toString));

  const desc = getOwnPropertyDescriptor(Object.prototype, 'toString');
  t.equals(desc.get.originalDataPropertyValue, Object.prototype.toString);

  t.end();
});
