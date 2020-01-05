import tap from 'tap';
import makeHardener from '../src/main.js';

const { test } = tap;

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

function gpo(o) {
  return Object.getPrototypeOf(o);
}

test('harden async function', t => {
  const h = makeHardener([Object.prototype, gpo(async _ => _)]);
  const o = async _a => 1;
  t.equal(h(o), o);
  t.ok(Object.isFrozen(o));
  t.end();
});

test('harden generator', t => {
  function* gen() {
    yield 1;
  }
  // 'o' is the "<<callable>>" white box in the bottom center of
  // https://www.ecma-international.org/ecma-262/img/figure-5.png . We need
  // to include both %Generator% (reachable as gen.__proto__) and
  // %GeneratorPrototype% (reachable as either gen.__proto__.prototype or
  // gen.prototype.__proto__) in the fringe.
  const h = makeHardener([gpo(gen), gpo(gen).prototype]);
  function* o() {
    yield 1;
    yield 2;
  }
  t.equal(h(o), o);
  t.ok(Object.isFrozen(o));
  t.end();
});

test('harden async generator', t => {
  async function* agen() {
    yield 1;
  }
  const h = makeHardener([gpo(agen), gpo(agen).prototype]);
  async function* o() {
    yield 1;
    yield 2;
  }
  t.equal(h(o), o);
  t.ok(Object.isFrozen(o));
  t.end();
});

test('harden generator instances', t => {
  function* gen() {
    yield 1;
  }
  const h = makeHardener([gpo(gen), gpo(gen).prototype]);
  function* o() {
    yield 1;
    yield 2;
  }

  // if the generator function wasn't hardened, then you won't be able to
  // harden the generator instances you get by invoking it
  const oinstance1 = o();
  t.throws(() => h(oinstance1), TypeError);

  // but if it *is* hardened, then you can harden the instances too
  h(o);
  const oinstance2 = o();
  t.equal(h(oinstance2), oinstance2);
  t.ok(Object.isFrozen(oinstance2));
  t.end();
});

test('prepare objects', t => {
  const o = { a: { b: 123 }, b: 123 };
  const naivePrepareObject = obj => {
    if (typeof obj.b === 'number') {
      obj.b += 1;
    }
  };
  const h = makeHardener([Object.prototype], { naivePrepareObject });
  t.equal(h(o), o);
  t.equal(o.b, 124);
  t.equal(o.a.b, 124);
  t.end();
});

test('fringeSet must support add/has', t => {
  t.ok(makeHardener([], { fringeSet: { add() {}, has() {} } }));
  t.throws(
    () => makeHardener([], { fringeSet: { add: true, has() {} } }),
    TypeError,
  );
  t.throws(
    () => makeHardener([], { fringeSet: { add() {}, has: true } }),
    TypeError,
  );
  t.end();
});

test('fringeSet is used', t => {
  const fringeSet = new WeakSet();
  const h = makeHardener([Object.prototype], { fringeSet });
  const o = { a: { b: 123 } };
  t.equal(h(o), o);
  t.equal(o.a.b, 123);
  t.ok(fringeSet.has(o));
  t.ok(fringeSet.has(o.a));
  t.end();
});

test('initialFringe can be undefined with fringeSet', t => {
  const fringeSet = new WeakSet();
  makeHardener(undefined, { fringeSet });
  t.end();
});

test('do not prepare objects already in the fringeSet', t => {
  const fringeSet = new WeakSet();
  const h = makeHardener([Object.prototype], { fringeSet });
  const naivePrepareObject = obj => {
    if (typeof obj.b === 'number') {
      obj.b += 1;
    }
  };
  const inch = makeHardener([Object.prototype], {
    fringeSet,
    naivePrepareObject,
  });
  const o = { a: { b: 123 }, b: 123 };
  t.equal(h(o.a), o.a);
  t.equal(o.a.b, 123);
  t.equal(o.b, 123);
  t.equal(inch(o), o);
  t.equal(o.a.b, 123);
  t.equal(o.b, 124);
  t.end();
});
