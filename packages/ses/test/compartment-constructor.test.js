import tap from 'tap';
import '../ses.js';

const { test } = tap;

lockdown();

test('Compartment class', t => {
  t.plan(8);

  t.equals(typeof Compartment, 'function', 'typeof');
  t.ok(Compartment instanceof Function, 'instanceof');
  t.equals(Compartment.name, 'Compartment', 'Constructor "name" property');

  t.equals(Compartment.toString(), 'function Compartment() { [native code] }');
  t.equals(
    Compartment[Symbol.toStringTag],
    undefined,
    '"Symbol.toStringTag" property',
  );

  t.deepEqual(
    Reflect.ownKeys(Compartment).sort(),
    ['length', 'name', 'prototype'].sort(),
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
});
