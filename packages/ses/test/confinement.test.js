import tap from 'tap';
import sinon from 'sinon';
import { Compartment } from '../src/compartment-shim.js';
import stubFunctionConstructors from './stub-function-constructors.js';

const { test } = tap;

test('confinement evaluation strict mode', t => {
  t.plan(2);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

  const c = new Compartment();

  t.equal(c.evaluate('(function() { return this })()'), undefined);
  t.equal(c.evaluate('(new Function("return this"))()'), undefined);

  sinon.restore();
});

test('constructor this binding', t => {
  t.plan(5);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

  const c = new Compartment();
  const F = c.evaluate('(new Function("return this"))');

  t.equal(F(), undefined);
  t.equal(F.call(8), 8);
  t.equal(F.call(undefined), undefined);
  t.equal(Reflect.apply(F, 8, []), 8);

  const x = { F };
  t.equal(x.F(), x);

  sinon.restore();
});

test('confinement evaluation constructor', t => {
  t.plan(2);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

  const c = new Compartment();

  t.throws(() => {
    c.evaluate('({}).constructor.constructor("return this")()');
  }, Error);

  // Error is a function, so Error.__proto__ is Function.prototype . The
  // unpatched Function.prototype.constructor used to point at the unsafe
  // 'Function' object, which would provide access to the primal realm's
  // globals, so it must be kept out of the hands of any child realm. We
  // replace that '.constructor' with a safe replacement (which always
  // throws). Here we test that this constructor has been replaced.
  t.throws(() => {
    c.evaluate('Error.__proto__.constructor("return this")()');
  }, Error);

  sinon.restore();
});

test('confinement evaluation eval', t => {
  t.plan(2);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

  const c = new Compartment();

  // Strict mode
  t.equal(c.evaluate('(0, eval)("this")'), c.globalThis);
  t.equal(c.evaluate('var evil = eval; evil("this")'), c.globalThis);

  sinon.restore();
});
