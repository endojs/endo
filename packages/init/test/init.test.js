import '../index.js';
import test from 'ava';

test('globals are present', t => {
  t.is(typeof Compartment, 'function');
  t.is(typeof harden, 'function');
});

test('default init hardens', async t => {
  const a = {};
  t.false(Object.isFrozen(a));
  a.prop = 'init';
  t.is(a.prop, 'init');
  harden(a);
  t.true(Object.isFrozen(a));
  // @ts-expect-error XXX Node interface munging
  t.throws(() => (a.prop = 123), { instanceOf: TypeError });
  t.is(a.prop, 'init');
  Object.freeze(a);
  // @ts-expect-error XXX Node interface munging
  t.throws(() => (a.prop = 456), { instanceOf: TypeError });
  t.is(a.prop, 'init');
});
