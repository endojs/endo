/* global Evaluator */
import test from 'tape';
import { lockdown } from '../src/main.js';

lockdown();

test('lockdown() - Date in Evaluator is tamed', t => {
  const s = new Evaluator();
  t.equal(s.evaluate('Date.parse("1982-04-09")'), Date.parse('1982-04-09'));

  const now = s.evaluate('Date.now()');
  t.equal(Number.isNaN(now), true);

  const newDate = s.evaluate('new Date()');
  t.equal(`${newDate}`, 'Invalid Date');

  t.throws(() => s.evaluate('({}).toLocaleString()'), Error);
  t.end();
});

test('lockdown() - Date in nested Evaluator is tamed', t => {
  const s = new Evaluator().evaluate('new Evaluator()');

  const now = s.evaluate('Date.now()');
  t.equal(Number.isNaN(now), true);

  const newDate = s.evaluate('new Date()');
  t.equal(`${newDate}`, 'Invalid Date');

  t.throws(() => s.evaluate('({}).toLocaleString()'), Error);
  t.end();
});
