import test from 'ava';
import sinon from 'sinon';
import '../lockdown.js';
import stubFunctionConstructors from './stub-function-constructors.js';

test('globalObject properties', t => {
  t.plan(10);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

  globalThis.Compartment = Compartment;

  const c = new Compartment();

  t.not(c.globalThis, this);
  t.not(c.globalThis, globalThis);
  t.is(c.globalThis.globalThis, c.globalThis);

  t.is(c.globalThis.Array, Array);
  t.is(c.globalThis.Array, globalThis.Array);

  // eslint-disable-next-line no-eval
  t.not(c.globalThis.eval, eval);
  t.not(c.globalThis.eval, globalThis.eval);

  t.not(c.globalThis.Function, Function);
  t.not(c.globalThis.Function, globalThis.Function);

  t.not(c.globalThis.Compartment, Compartment);

  delete globalThis.Compartment;
  sinon.restore();
});
