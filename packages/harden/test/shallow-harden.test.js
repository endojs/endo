import test from 'ava';
import harden from '../index.js';

test('shallow harden hardens properties only', t => {
  t.false(Object.isFrozen(Object.prototype));
  const parent = { __proto__: {}, child: {} };
  t.false(Object.isFrozen(parent));
  t.false(Object.isFrozen(parent.child));
  t.false(Object.isFrozen(Object.getPrototypeOf(parent)));
  harden(parent);
  t.true(Object.isFrozen(parent));
  t.true(Object.isFrozen(parent.child));
  t.false(Object.isFrozen(Object.getPrototypeOf(parent)));
});
