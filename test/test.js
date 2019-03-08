import test from 'tape';
import makeHardener from '../src/index';

test('makeHardener', t => {
  const h = makeHardener([Object.prototype]);
  const o = { a: {} };
  t.equal(h(o), o);
  t.ok(Object.isFrozen(o));
  t.ok(Object.isFrozen(o.a));
  t.end();
});

test('do not freeze roots', t => {
  const parent = { I_AM_YOUR: 'parent' };
  const h = makeHardener([parent, Object.prototype]);
  const o = { a: {} };
  Object.setPrototypeOf(o, parent);
  t.equal(h(o), o);
  t.ok(Object.isFrozen(o));
  t.ok(Object.isFrozen(o.a));
  t.notOk(Object.isFrozen(parent));
  t.end();
});

test('complain about prototype not in roots', t => {
  const parent = { I_AM_YOUR: 'parent' };
  // at least one prototype is missing in each hardener
  const h1 = makeHardener([Object.prototype]);
  const h2 = makeHardener([parent]);
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

test('harden the same thing twice', t => {
  const h = makeHardener([Object.prototype]);
  const o = { a: {} };
  t.equal(h(o), o);
  t.equal(h(o), o);
  t.ok(Object.isFrozen(o));
  t.ok(Object.isFrozen(o.a));
  t.end();
});

test('harden objects with cycles', t => {
  const h = makeHardener([Object.prototype]);
  const o = { a: {} };
  o.a.foo = o;
  t.equal(h(o), o);
  t.ok(Object.isFrozen(o));
  t.ok(Object.isFrozen(o.a));
  t.end();
});

test('harden overlapping objects', t => {
  const h = makeHardener([Object.prototype]);
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
  const h = makeHardener([Object.prototype]);
  const a = { a: 1 };
  const b = { b: 1, __proto__: a };
  const c = { c: 1, __proto__: b };

  t.throws(() => h(b), TypeError);
  // the bug is that 'b' is marked as hardened. If that happens, harden(c)
  // will pass when it was supposed to throw.
  t.throws(() => h(c), TypeError);

  t.end();
});

test('can harden all objects in a single call', t => {
  // refs #4
  const h = makeHardener([Object.prototype, Object.getPrototypeOf([])]);
  const a = { a: 1 };
  const b = { b: 1, __proto__: a };
  const c = { c: 1, __proto__: b };

  h([a, b, c]);
  t.ok(Object.isFrozen(a));
  t.ok(Object.isFrozen(b));
  t.ok(Object.isFrozen(c));

  t.end();
});

test('harden() tolerates objects with null prototypes', t => {
  const h = makeHardener([Object.prototype]);
  const o = { a: 1 };
  Object.setPrototypeOf(o, null);
  t.equal(h(o), o);
  t.ok(Object.isFrozen(o));
  t.ok(Object.isFrozen(o.a));
  t.end();
});

test('harden function', t => {
  const h = makeHardener([Object.prototype, Function.prototype]);
  const o = _a => 1;
  t.equal(h(o), o);
  t.ok(Object.isFrozen(o));
  t.end();
});

test('harden async function', t => {
  const h = makeHardener([Object.prototype, (async _ => _).__proto__]);
  const o = async _a => 1;
  t.equal(h(o), o);
  t.ok(Object.isFrozen(o));
  t.end();
});
