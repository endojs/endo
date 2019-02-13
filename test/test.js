const test = require('tape');
const { makeHardener } = require('../index.js');

test('makeHardener', t => {
  const h = makeHardener(Object.prototype);
  const o = { a: {} };
  t.equal(h(o), o);
  t.ok(Object.isFrozen(o));
  t.ok(Object.isFrozen(o.a));
  t.end();
});

test('do not freeze roots', t => {
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

test('complain about prototype not in roots', t => {
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
