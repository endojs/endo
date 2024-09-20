import { assertFakeFrozen } from './_lockdown-harden-unsafe.js';
// eslint-disable-next-line import/order
import test from 'ava';

test('fake harden', t => {
  t.is(harden.isFake, true);

  const obj = {};
  assertFakeFrozen(t, obj);

  harden(obj);
  assertFakeFrozen(t, obj);
});
