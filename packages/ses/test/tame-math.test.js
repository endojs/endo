/* global Compartment */
import test from 'tape';
import { lockdown } from '../src/lockdown-shim.js';

lockdown();

test('lockdown() default - Math from Compartment is tamed', t => {
  const c = new Compartment();
  t.throws(() => c.evaluate('Math.random()'));
  t.end();
});

test('lockdown() default - Math from nested Compartment is tamed', t => {
  const c = new Compartment().evaluate('new Compartment()');
  t.throws(() => c.evaluate('Math.random()'));
  t.end();
});
