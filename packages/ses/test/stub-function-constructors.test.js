import test from 'ava';
import sinon from 'sinon';
import stubFunctionConstructors from './stub-function-constructors.js';

/* eslint-disable no-proto, no-empty-function */

test('stubFunctionConstructors', t => {
  t.plan(8);

  function F() {}
  async function AF() {}
  function* G() {}
  async function* AG() {}

  const descs = {
    F: Object.getOwnPropertyDescriptor(F.__proto__, 'constructor'),
    AF: Object.getOwnPropertyDescriptor(AF.__proto__, 'constructor'),
    G: Object.getOwnPropertyDescriptor(G.__proto__, 'constructor'),
    AG: Object.getOwnPropertyDescriptor(AG.__proto__, 'constructor'),
  };

  stubFunctionConstructors(sinon);

  t.not(descs.F.value, F.__proto__.constructor);
  t.not(descs.AF.value, AF.__proto__.constructor);
  t.not(descs.G.value, G.__proto__.constructor);
  t.not(descs.AG.value, AG.__proto__.constructor);

  sinon.restore();

  t.is(descs.F.value, F.__proto__.constructor);
  t.is(descs.AF.value, AF.__proto__.constructor);
  t.is(descs.G.value, G.__proto__.constructor);
  t.is(descs.AG.value, AG.__proto__.constructor);
});

/* eslint-enable no-proto, no-empty-function */
