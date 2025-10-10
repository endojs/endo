import test from 'ava';
import harden from '../unsafe.js';

test('harden does not freeze if not locked down', t => {
  const object = {};
  harden(object);
  t.assert(!Object.isFrozen(object));
});
