import tap from 'tap';
import makeHardener from '../src/main.js';

const { test } = tap;

// `harden` is only intended to work after `lockdown`. However,
// to test it standalone, we need to freeze at least these ahead
// of time.
const hardenFirst = [Array.prototype, Object.prototype, Function.prototype];

test('makeHardener', t => {
  const h = makeHardener();
  h(hardenFirst);
  const o = { a: {} };
  t.equal(h(o), o);
  t.ok(Object.isFrozen(o));
  t.ok(Object.isFrozen(o.a));
  t.end();
});

test('harden the same thing twice', t => {
  const h = makeHardener();
  h(hardenFirst);
  const o = { a: {} };
  t.equal(h(o), o);
  t.equal(h(o), o);
  t.ok(Object.isFrozen(o));
  t.ok(Object.isFrozen(o.a));
  t.end();
});

test('harden objects with cycles', t => {
  const h = makeHardener();
  h(hardenFirst);
  const o = { a: {} };
  o.a.foo = o;
  t.equal(h(o), o);
  t.ok(Object.isFrozen(o));
  t.ok(Object.isFrozen(o.a));
  t.end();
});

test('harden overlapping objects', t => {
  const h = makeHardener();
  h(hardenFirst);
  const o1 = { a: {} };
  const o2 = { a: o1.a };
  t.equal(h(o1), o1);
  t.ok(Object.isFrozen(o1));
  t.ok(Object.isFrozen(o1.a));
  t.notOk(Object.isFrozen(o2));
  t.equal(h(o2), o2);
  t.ok(Object.isFrozen(o2));
  t.end();
});

test('do not commit early', t => {
  // refs #4
  const h = makeHardener();
  h(hardenFirst);
  const a = { a: 1 };
  const b = { b: 1, __proto__: a };
  const c = { c: 1, __proto__: b };

  t.throws(() => h(b), TypeError);
  // the bug is that 'b' is marked as hardened. If that happens, harden(c)
  // will pass when it was supposed to throw.
  t.throws(() => h(c), TypeError);

  t.end();
});

test('harden() tolerates objects with null prototypes', t => {
  const h = makeHardener();
  h(hardenFirst);
  const o = { a: 1 };
  Object.setPrototypeOf(o, null);
  t.equal(h(o), o);
  t.ok(Object.isFrozen(o));
  t.ok(Object.isFrozen(o.a));
  t.end();
});
