import { mockHarden } from './harden-mockery.js';
import { assertFakeFrozen } from './lockdown-harden-unsafe.js';

// eslint-disable-next-line import/order
import test from 'ava';

test('mocked globalThis.harden', t => {
  t.not(harden, mockHarden);
  t.is(harden.isFake, true);

  const obj = {};
  harden(obj);
  t.true(isHardened(obj));
  assertFakeFrozen(t, obj);
});
