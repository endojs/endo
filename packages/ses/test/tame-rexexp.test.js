/* global Compartment */
import test from 'tape';
import { lockdown } from '../src/lockdown-shim.js';

lockdown();

test('lockdown() RegExp allowed - RegExp from Compartment is not tamed', t => {
  const c = new Compartment();
  const properties = c.evaluate('Reflect.ownKeys(RegExp)');

  t.deepEqual(
    properties.sort(),
    ['length', 'name', 'prototype'].sort(),
    'RegExp should not have static properties',
  );

  t.end();
});

test('lockdown() RegExp allowed - RegExp from nested Compartment not is tamed', t => {
  const c = new Compartment().evaluate('new Compartment()');
  const properties = c.evaluate('Reflect.ownKeys(RegExp)');

  t.deepEqual(
    properties.sort(),
    ['length', 'name', 'prototype'].sort(),
    'RegExp should not have static properties',
  );

  t.end();
});
