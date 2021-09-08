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

  t.deepEqual(
    Reflect.ownKeys(Compartment.prototype).sort(),
    [
      '__isKnownScopeProxy__',
      '__makeScopeProxy__',
      'constructor',
      'evaluate',
      'globalThis',
      'import',
      'importNow',
      'load',
      'module',
      'name',
      'toString',
    ].sort(),
    'prototype properties',
  );
});
