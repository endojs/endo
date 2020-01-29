/* global Compartment */
import test from 'tape';
import { lockdown } from '../src/main.js';

lockdown();

test('lockdown() - Date in Compartment is tamed', t => {
  const c = new Compartment();
  t.equal(c.evaluate('Date.parse("1982-04-09")'), Date.parse('1982-04-09'));

  const now = c.evaluate('Date.now()');
  t.equal(Number.isNaN(now), true);

  const newDate = c.evaluate('new Date()');
  t.equal(`${newDate}`, 'Invalid Date');

  t.throws(() => c.evaluate('({}).toLocaleString()'), Error);
  t.end();
});

test('lockdown() - Date in nested Compartment is tamed', t => {
  const c = new Compartment().evaluate('new Compartment()');

  const now = c.evaluate('Date.now()');
  t.equal(Number.isNaN(now), true);

  const newDate = c.evaluate('new Date()');
  t.equal(`${newDate}`, 'Invalid Date');

  t.throws(() => c.evaluate('({}).toLocaleString()'), Error);
  t.end();
});
