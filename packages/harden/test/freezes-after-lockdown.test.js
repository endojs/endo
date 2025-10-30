import 'ses';
import test from 'ava';
import harden from '../index.js';

// This test is framed as a stand-alone module because calling `lockdown` has
// side-effects on the realm.

test('harden freezes object if locked down', t => {
  const { isFrozen: isFrozenPreLockdown } = Object;
  lockdown();
  const { isFrozen: isFrozenPostLockdown } = Object;
  const object = {};
  harden(object);
  t.assert(isFrozenPreLockdown(object));
  t.assert(isFrozenPostLockdown(object));
});
