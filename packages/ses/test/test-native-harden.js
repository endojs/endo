import { mockHarden, mockHardened } from './harden-mockery.js';
import { assertFakeFrozen } from './lockdown-harden-unsafe.js';

// eslint-disable-next-line import/order
import test from 'ava';

test('mocked globalThis.harden', t => {
  t.is(harden, mockHarden);
  t.is(harden.isFake, true);

  const obj = {};
  t.false(mockHardened.has(obj));
  assertFakeFrozen(t, obj);

  harden(obj);
  t.true(mockHardened.has(obj));
  assertFakeFrozen(t, obj);
});
