import test from 'ava';
import harden from '../noop.js';

test('harden does not freeze if not locked down', t => {
  const object = {};
  harden(object);
  t.assert(!Object.isFrozen(object));
});
