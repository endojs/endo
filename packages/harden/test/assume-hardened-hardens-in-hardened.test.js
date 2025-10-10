import 'ses';
import test from 'ava';
import './_lockdown.js';
import harden from '../hardened.js';

test('presume-hardened harden hardens after lockdown', t => {
  t.true(Object.isFrozen(Object.prototype));
  const parent = { __proto__: {}, child: {} };
  t.false(Object.isFrozen(parent));
  t.false(Object.isFrozen(parent.child));
  t.false(Object.isFrozen(Object.getPrototypeOf(parent)));
  harden(parent);
  t.true(Object.isFrozen(parent));
  t.true(Object.isFrozen(parent.child));
  t.true(Object.isFrozen(Object.getPrototypeOf(parent)));
});
