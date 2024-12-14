import test from 'ava';
import '../index.js';

const { isFrozen, getPrototypeOf } = Object;

lockdown();

test('ses Immutable ArrayBuffer shim installed and hardened', t => {
  const ab1 = new ArrayBuffer(0);
  const iab = ab1.transferToImmutable();
  const iabProto = getPrototypeOf(iab);
  t.true(isFrozen(iabProto));
  t.true(isFrozen(iabProto.slice));
});
