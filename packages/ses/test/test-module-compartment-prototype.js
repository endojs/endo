import test from 'ava';
import '../ses.js';

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
      'constructor',
      'evaluate',
      'import',
      'importNow',
      'load',
      'module',
      'name',
      'globalThis',
      'toString',
    ].sort(),
    'prototype properties',
  );
});
