/* global Compartment */
import test from 'tape';
import { lockdown } from '../src/main.js';

lockdown();

test('lockdown() Math allowed - Math from Compartment is tamed', t => {
  const c = new Compartment();
  t.throws(() => c.evaluate('Math.random()'));
  t.end();
});

test('lockdown() Math allowed - Math from nested Compartment is tamed', t => {
  const c = new Compartment().evaluate('new Compartment()');
  t.throws(() => c.evaluate('Math.random()'));
  t.end();
});
