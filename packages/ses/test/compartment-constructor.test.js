import test from 'ava';
import '../index.js';

lockdown();

test('Compartment class', t => {
  t.plan(8);

  t.is(typeof Compartment, 'function', 'typeof');
  t.truthy(Compartment instanceof Function, 'instanceof');
  t.is(Compartment.name, 'Compartment', 'Constructor "name" property');

  t.is(Compartment.toString(), 'function Compartment() { [native code] }');
  t.is(
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
    // @ts-expect-error intentional error
    () => Compartment(),
    { instanceOf: TypeError },
    'Compartment must not support the [[Call]] method',
  );
  t.notThrows(
    () => new Compartment(),
    'Compartment must support the [[Construct]] method',
  );
});

test('Compartment name', t => {
  const c = new Compartment({ name: 'x', __options__: true });
  t.is(c.name, 'x');
});

test('Compartment name object toString', t => {
  const c = new Compartment({
    name: {
      toString() {
        return 'x';
      },
    },
    __options__: true,
  });
  t.is(c.name, 'x');
});
