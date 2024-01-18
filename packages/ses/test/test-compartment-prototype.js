import test from 'ava';
import '../index.js';

lockdown({ errorTaming: 'unsafe' });

test('Compartment prototype', t => {
  t.plan(2);

  t.not(
    Compartment.prototype.constructor,
    Compartment,
    'The initial value of Compartment.prototype.constructor',
  );

  const expectedProps = new Set([
    'constructor',
    'evaluate',
    'globalThis',
    'import',
    'importNow',
    'load',
    'module',
    'name',
    Symbol.toStringTag,
  ]);
  const actualProps = Reflect.ownKeys(Compartment.prototype);

  t.assert(
    actualProps.length === expectedProps.size &&
      actualProps.every(key => expectedProps.has(key)),
    'prototype properties',
  );
});
