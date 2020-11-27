import test from 'ava';
import makeHardener from '../src/main.js';

// `harden` is only intended to work after `lockdown`. However,
// to test it standalone, we need to freeze at least these ahead
// of time.
const hardenFirst = [Array.prototype, Object.prototype, Function.prototype];

test('makeHardener', t => {
  const h = makeHardener();
  h(hardenFirst);
  const o = { a: {} };
  t.is(h(o), o);
  t.truthy(Object.isFrozen(o));
  t.truthy(Object.isFrozen(o.a));
});

test('harden the same thing twice', t => {
  const h = makeHardener();
  h(hardenFirst);
  const o = { a: {} };
  t.is(h(o), o);
  t.is(h(o), o);
  t.truthy(Object.isFrozen(o));
  t.truthy(Object.isFrozen(o.a));
});

test('harden objects with cycles', t => {
  const h = makeHardener();
  h(hardenFirst);
  const o = { a: {} };
  o.a.foo = o;
  t.is(h(o), o);
  t.truthy(Object.isFrozen(o));
  t.truthy(Object.isFrozen(o.a));
});

test('harden overlapping objects', t => {
  const h = makeHardener();
  h(hardenFirst);
  const o1 = { a: {} };
  const o2 = { a: o1.a };
  t.is(h(o1), o1);
  t.truthy(Object.isFrozen(o1));
  t.truthy(Object.isFrozen(o1.a));
  t.falsy(Object.isFrozen(o2));
  t.is(h(o2), o2);
  t.truthy(Object.isFrozen(o2));
});

test('do not commit early', t => {
  // refs #4
  const h = makeHardener();
  h(hardenFirst);
  const a = { a: 1 };
  const b = { b: 1, __proto__: a };
  const c = { c: 1, __proto__: b };

  t.throws(() => h(b), { instanceOf: TypeError });
  // the bug is that 'b' is marked as hardened. If that happens, harden(c)
  // will pass when it was supposed to throw.
  t.throws(() => h(c), { instanceOf: TypeError });
});

test('harden() tolerates objects with null prototypes', t => {
  const h = makeHardener();
  h(hardenFirst);
  const o = { a: 1 };
  Object.setPrototypeOf(o, null);
  t.is(h(o), o);
  t.truthy(Object.isFrozen(o));
  t.truthy(Object.isFrozen(o.a));
});
