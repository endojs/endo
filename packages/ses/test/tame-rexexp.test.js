/* global Compartment */
import test from 'tape';
import { lockdown } from '../src/lockdown-shim.js';

const allowedProperties = new Set([
  'length',
  'name',
  'prototype',
  Symbol.species,
]);

lockdown();

test('lockdown() RegExp allowed - RegExp from Compartment is not tamed', t => {
  const c = new Compartment();

  const properties = c.evaluate('Reflect.ownKeys(RegExp)');
  for (const prop of properties) {
    t.assert(
      allowedProperties.has(prop),
      `RegExp may not have static property ${String(prop)}`,
    );
  }
  t.end();
});

test('lockdown() RegExp allowed - RegExp from nested Compartment not is tamed', t => {
  const c = new Compartment().evaluate('new Compartment()');

  const properties = c.evaluate('Reflect.ownKeys(RegExp)');
  for (const prop of properties) {
    t.assert(
      allowedProperties.has(prop),
      `RegExp may not have static property ${String(prop)}`,
    );
  }
  t.end();
});
