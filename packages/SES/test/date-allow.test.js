/* global Evaluator */
import test from 'tape';
import { lockdown } from '../src/main.js';

lockdown({ dateMode: 'allow' });

function isDate(date) {
  return (
    Object.prototype.toString.call(date) === '[object Date]' &&
    Number.isInteger(date.getTime())
  );
}

test('lockdown() date allowed - Date in Evaluator is not tamed', t => {
  const start = Date.now();

  const s = new Evaluator();
  t.equal(s.evaluate('Date.parse("1982-04-09")'), Date.parse('1982-04-09'));

  const now = s.evaluate('Date.now()');
  t.assert(Number.isInteger(now));

  const finished = Date.now();
  t.ok(start <= now);
  t.ok(now <= finished);

  const newDate = s.evaluate('new Date()');
  t.ok(isDate(newDate));

  t.doesNotThrow(() => s.evaluate('({}).toLocaleString()'), Error);
  t.end();
});

test('lockdown() date allowed - Date in nested Evaluator is not tamed', t => {
  const s = new Evaluator().evaluate('new Evaluator()');

  const now = s.evaluate('Date.now()');
  t.equal(Number.isNaN(now), false);

  const newDate = s.evaluate('new Date()');
  t.ok(isDate(newDate));

  t.doesNotThrow(() => s.evaluate('({}).toLocaleString()'), Error);
  t.end();
});
