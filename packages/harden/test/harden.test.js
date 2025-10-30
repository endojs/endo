import test from 'ava';
import harden from '../index.js';

test('harden does not freeze if not locked down', async t => {
  const object = {};
  harden(object);
  t.assert(!Object.isFrozen(object));
});
