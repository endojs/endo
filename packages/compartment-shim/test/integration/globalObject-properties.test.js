import tap from 'tap';
import sinon from 'sinon';
import Compartment from '../../src/main.js';
import stubFunctionConstructors from '../stubFunctionConstructors.js';

const { test } = tap;

test('globalObject properties', t => {
  t.plan(9);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);
  // eslint-disable-next-line no-new-func
  const global = Function('return this')();
  global.Compartment = Compartment;

  // eslint-disable-next-line no-new-func
  const c = new Compartment();

  t.notEqual(c.global, this);
  t.notEqual(c.global, global);

  t.equal(c.global.Array, Array);
  t.equal(c.global.Array, global.Array);

  // eslint-disable-next-line no-eval
  t.notEqual(c.global.eval, eval);
  // eslint-disable-next-line no-eval
  t.notEqual(c.global.eval, global.eval);

  t.notEqual(c.global.Function, Function);
  t.notEqual(c.global.Function, global.Function);

  t.equal(c.global.Compartment, Compartment);

  delete global.Compartment;
  sinon.restore();
});
