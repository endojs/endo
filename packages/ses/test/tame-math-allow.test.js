/* global Compartment, lockdown */
import test from 'tape';
import '../src/main.js';

lockdown({ mathTaming: 'unsafe' });

test('lockdown() Math allowed - Math from Compartment is not tamed', t => {
  const c = new Compartment();
  const random = c.evaluate('Math.random()');
  t.equal(typeof random, 'number');
  t.notOk(Number.isNaN(random));
  t.end();
});

test('lockdown() Math allowed - Math from nested Compartment is not tamed', t => {
  const c = new Compartment().evaluate('new Compartment()');
  const random = c.evaluate('Math.random()');
  t.equal(typeof random, 'number');
  t.notOk(Number.isNaN(random));
  t.end();
});
