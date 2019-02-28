/* eslint no-undef: "off" */

import test from 'tape';
import harden from '../src/index';

test('harden', t => {
  const o = { a: {} };
  t.equal(harden(o), o);
  t.ok(Object.isFrozen(o));
  t.ok(Object.isFrozen(o.a));
  t.end();
});

test.skip('do not freeze roots', t => {
  const parent = { I_AM_YOUR: 'parent' };
  const h = makeHardener(parent, Object.prototype);
  const o = { a: {} };
  Object.setPrototypeOf(o, parent);
  t.equal(h(o), o);
  t.ok(Object.isFrozen(o));
  t.ok(Object.isFrozen(o.a));
  t.notOk(Object.isFrozen(parent));
  t.end();
});

test.skip('complain about prototype not in roots', t => {
  const parent = { I_AM_YOUR: 'parent' };
  // at least one prototype is missing in each hardener
  const h1 = makeHardener(Object.prototype);
  const h2 = makeHardener(parent);
  const o = { a: {} };
  Object.setPrototypeOf(o, parent);
  t.throws(() => h1(o), TypeError);
  t.throws(() => h2(o), TypeError);
  // if harden() throws TypeError, we make no claims about what properties
  // got frozen. However, we know for sure that the prototype shouldn't be
  // frozen: this is what saves us from the "ice-9" freeze-the-world scenario
  t.notOk(Object.isFrozen(parent));
  t.end();
});

test.skip('harden the same thing twice', t => {
  const h = makeHardener(Object.prototype);
  const o = { a: {} };
  t.equal(h(o), o);
  t.equal(h(o), o);
  t.ok(Object.isFrozen(o));
  t.ok(Object.isFrozen(o.a));
  t.end();
});

test.skip('harden objects with cycles', t => {
  const h = makeHardener(Object.prototype);
  const o = { a: {} };
  o.a.foo = o;
  t.equal(h(o), o);
  t.ok(Object.isFrozen(o));
  t.ok(Object.isFrozen(o.a));
  t.end();
});

test.skip('harden overlapping objects', t => {
  const h = makeHardener(Object.prototype);
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
