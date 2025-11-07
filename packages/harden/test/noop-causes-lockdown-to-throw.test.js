import 'ses';
import test from 'ava';
import harden from '../noop.js';

// This test is framed as a stand-alone module because calling `lockdown` has
// side-effects on the realm.

test('lockdown throws if harden is used before', t => {
  const object = {};
  harden(object);
  t.false(Object.isFrozen(object));

  t.throws(() => lockdown(), {
    message:
      'Cannot lockdown (repairIntrinsics) because @endo/harden used before lockdown on this stack',
  });
});
