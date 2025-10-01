import 'ses';
import test from 'ava';
import harden from '../index.js';

// This test is framed as a stand-alone module because calling `lockdown` has
// side-effects on the realm.

test('harden freezes object if locked down', async t => {
  lockdown();
  const object = {};
  harden(object);
  t.assert(Object.isFrozen(object));
});
