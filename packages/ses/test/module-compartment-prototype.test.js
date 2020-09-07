import tap from 'tap';
import { Compartment } from '../src/module-shim.js';

const { test } = tap;

test('Compartment prototype', t => {
  t.plan(2);

  t.notEquals(
    Compartment.prototype.constructor,
    Compartment,
    'The initial value of Compartment.prototype.constructor',
  );

  t.deepEqual(
    Reflect.ownKeys(Compartment.prototype).sort(),
    [
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
