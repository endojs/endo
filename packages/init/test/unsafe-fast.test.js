import '../unsafe-fast.js';

import test from 'ava';

test('unsafe-fast does not harden', async t => {
  const a = {};
  t.true(Object.isFrozen(a));
  a.prop = 'init';
  t.is(a.prop, 'init');
  harden(a);
  t.true(Object.isFrozen(a));
  a.prop = 123;
  t.is(a.prop, 123);
  Object.freeze(a);
  t.throws(() => (a.prop = 456), { instanceOf: TypeError });
  t.is(a.prop, 123);
});
