/* global Compartment, lockdown */
import test from 'tape';
import '../src/main.js';

const allowedProperties = new Set([
  'length',
  'name',
  'prototype',
  Symbol.species,
]);

lockdown();

test('lockdown RegExp from Compartment is powerless', t => {
  const c = new Compartment();

  const properties = c.evaluate('Reflect.ownKeys(RegExp)');
  for (const prop of properties) {
    t.ok(
      allowedProperties.has(prop),
      `RegExp may not have static property ${String(prop)}`,
    );
  }
  t.end();
});

test('lockdown RegExp from nested Compartment powerless', t => {
  const c = new Compartment().evaluate('new Compartment()');

  const properties = c.evaluate('Reflect.ownKeys(RegExp)');
  for (const prop of properties) {
    t.ok(
      allowedProperties.has(prop),
      `RegExp may not have static property ${String(prop)}`,
    );
  }
  t.end();
});
