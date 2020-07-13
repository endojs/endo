import tap from 'tap';
import harden from '../src/main.js';

const { test } = tap;

// `harden` is only intended to work after `lockdown`. However,
// to test it standalone, we need to freeze at least these ahead
// of time.
harden([Array.prototype, Object.prototype, Function.prototype]);

test('harden', t => {
  const o = { a: {} };
  t.equal(harden(o), o);
  t.ok(Object.isFrozen(o));
  t.ok(Object.isFrozen(o.a));
  t.end();
});

test('complain about prototype not in roots', t => {
  const parent = { I_AM_YOUR: 'parent' };
  const o = { a: {} };
  Object.setPrototypeOf(o, parent);
  t.throws(() => harden(o), TypeError);
  // if harden() throws TypeError, we make no claims about what properties
  // got frozen. However, we know for sure that the prototype shouldn't be
  // frozen: this is what saves us from the "ice-9" freeze-the-world scenario
  t.notOk(Object.isFrozen(parent));
  t.end();
});

test('harden the same thing twice', t => {
  const o = { a: {} };
  t.equal(harden(o), o);
  t.equal(harden(o), o);
  t.ok(Object.isFrozen(o));
  t.ok(Object.isFrozen(o.a));
  t.end();
});

test('harden objects with cycles', t => {
  const o = { a: {} };
  o.a.foo = o;
  t.equal(harden(o), o);
  t.ok(Object.isFrozen(o));
  t.ok(Object.isFrozen(o.a));
  t.end();
});

test('harden overlapping objects', t => {
  const o1 = { a: {} };
  const o2 = { a: o1.a };
  t.equal(harden(o1), o1);
  t.ok(Object.isFrozen(o1));
  t.ok(Object.isFrozen(o1.a));
  t.notOk(Object.isFrozen(o2));
  t.equal(harden(o2), o2);
  t.ok(Object.isFrozen(o2));
  t.end();
});

test('harden function', t => {
  const o = _a => 1;
  t.equal(harden(o), o);
  t.ok(Object.isFrozen(o));
  t.end();
});
