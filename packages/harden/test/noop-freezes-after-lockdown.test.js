import 'ses';
import test from 'ava';
import harden from '../noop.js';

// This test is framed as a stand-alone module because calling `lockdown` has
// side-effects on the realm.

test('harden freezes object if locked down', t => {
  const { isFrozen: preLockdownIsFrozen } = Object;
  lockdown();
  const { isFrozen: postLockdownIsFrozen } = Object;

  const object = {};
  harden(object);

  t.true(preLockdownIsFrozen(object));
  t.true(postLockdownIsFrozen(object));
});
