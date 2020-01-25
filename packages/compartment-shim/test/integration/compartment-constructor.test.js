import tap from 'tap';
import sinon from 'sinon';
import Compartment from '../../src/main.js';
import stubFunctionConstructors from '../stubFunctionConstructors.js';

const { test } = tap;

test('Compartment class', t => {
  t.plan(8);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

  t.equals(typeof Compartment, 'function', 'typeof');
  t.ok(Compartment instanceof Function, 'instanceof');
  t.equals(Compartment.name, 'Compartment', 'Constructor "name" property');

  t.equals(Compartment.toString(), 'function Compartment() { [shim code] }');
  t.equals(
    Compartment[Symbol.toStringTag],
    undefined,
    '"Symbol.toStringTag" property',
  );

  t.deepEqual(
    Reflect.ownKeys(Compartment).sort(),
    ['length', 'name', 'prototype', 'toString'].sort(),
    'static properties',
  );

  t.throws(
    () => Compartment(),
    TypeError,
    'Compartment must not support the [[Call]] method',
  );
  t.doesNotThrow(
    () => new Compartment(),
    TypeError,
    'Compartment must support the [[Construct]] method',
  );

  sinon.restore();
});
