import tap from 'tap';
import sinon from 'sinon';
import { Compartment } from '../src/compartment-shim.js';
import stubFunctionConstructors from './stub-function-constructors.js';

const { test } = tap;

test('globalObject properties', t => {
  t.plan(10);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

  globalThis.Compartment = Compartment;

  const c = new Compartment();

  t.notEqual(c.global, this);
  t.notEqual(c.global, globalThis);
  t.equal(c.global.globalThis, c.global);

  t.equal(c.global.Array, Array);
  t.equal(c.global.Array, globalThis.Array);

  // eslint-disable-next-line no-eval
  t.notEqual(c.global.eval, eval);
  t.notEqual(c.global.eval, globalThis.eval);

  t.notEqual(c.global.Function, Function);
  t.notEqual(c.global.Function, globalThis.Function);

  t.equal(c.global.Compartment, Compartment);

  delete globalThis.Compartment;
  sinon.restore();
});
