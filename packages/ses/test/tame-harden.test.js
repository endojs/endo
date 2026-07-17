import { assertFakeFrozen } from './_lockdown-harden-unsafe.js';

import test from 'ava';

test('fake harden', t => {
  t.is(harden.isFake, true);

  const obj = {};
  assertFakeFrozen(t, obj);

  harden(obj);
  assertFakeFrozen(t, obj);
});
