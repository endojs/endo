/* global globalThis */

import '../index.js';
import './lockdown-safe.js';
import test from 'ava';

test('confinement evaluation strict mode', t => {
  t.plan(2);

  const c = new Compartment();

  t.is(c.evaluate('(function() { return this })()'), undefined);
  t.is(c.evaluate('(new Function("return this"))()'), undefined);
});

test('constructor this binding', t => {
  t.plan(5);

  const c = new Compartment();
  const F = c.evaluate('(new Function("return this"))');

  t.is(F(), undefined);
  t.is(F.call(8), 8);
  t.is(F.call(undefined), undefined);
  t.is(Reflect.apply(F, 8, []), 8);

  const x = { F };
  t.is(x.F(), x);
});

test('confinement evaluation constructor', t => {
  t.plan(2);

  const c = new Compartment();

  t.throws(
    () => {
      c.evaluate('({}).constructor.constructor("return this")()');
    },
    { instanceOf: Error },
  );

  // Error is a function, so Error.__proto__ is Function.prototype . The
  // unpatched Function.prototype.constructor used to point at the unsafe
  // 'Function' object, which would provide access to the primal realm's
  // globals, so it must be kept out of the hands of any child realm. We
  // replace that '.constructor' with a safe replacement (which always
  // throws). Here we test that this constructor has been replaced.
  t.throws(
    () => {
      c.evaluate('Error.__proto__.constructor("return this")()');
    },
    { instanceOf: Error },
  );
});

test('confinement evaluation eval', t => {
  t.plan(2);

  const c = new Compartment();

  // Strict mode
  t.is(c.evaluate('(0, eval)("this")'), c.globalThis);
  t.is(c.evaluate('var evil = eval; evil("this")'), c.globalThis);
});

test('confinement evaluation Symbol.unscopables with-statement escape', t => {
  t.plan(2);

  globalThis.flag = 'unsafe';

  const c = new Compartment({ flag: 'safe' });

  t.is(c.evaluate('Symbol.unscopables'), Symbol.unscopables);
  // this modification causes a loss of shim fidelity, but not a loss of security
  t.is(
    c.evaluate('globalThis[Symbol.unscopables] = { flag: true }; flag'),
    undefined,
  );

  delete globalThis.flag;
});
