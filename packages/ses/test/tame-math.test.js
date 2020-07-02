/* global Compartment, lockdown */
import test from 'tape';
import '../src/main.js';

lockdown();

test('lockdown start Math is powerful', t => {
  t.equal(typeof Math.random, 'function');
  const random = Math.random();
  t.equal(typeof random, 'number');
  t.notOk(Number.isNaN(random));
  t.end();
});

test('lockdown Math from Compartment is powerless', t => {
  const c = new Compartment();
  t.equal(c.evaluate('typeof Math.random'), 'undefined');
  t.end();
});

test('lockdown Math from nested Compartment is powerless', t => {
  const c = new Compartment().evaluate('new Compartment()');
  t.equal(c.evaluate('typeof Math.random'), 'undefined');
  t.end();
});
