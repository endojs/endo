/* global Compartment, lockdown */
import test from 'tape';
import '../src/main.js';

lockdown({ dateTaming: 'unsafe' });

function isDate(date) {
  return (
    Object.prototype.toString.call(date) === '[object Date]' &&
    Number.isInteger(date.getTime())
  );
}

test('lockdown() date allowed - Date in Compartment is not tamed', t => {
  const start = Date.now();

  const c = new Compartment();
  t.equal(c.evaluate('Date.parse("1982-04-09")'), Date.parse('1982-04-09'));

  const now = c.evaluate('Date.now()');
  t.assert(Number.isInteger(now));

  const finished = Date.now();
  t.ok(start <= now);
  t.ok(now <= finished);

  const newDate = c.evaluate('new Date()');
  t.ok(isDate(newDate));

  t.end();
});

test('lockdown() date allowed - Date in nested Compartment is not tamed', t => {
  const c = new Compartment().evaluate('new Compartment()');

  const now = c.evaluate('Date.now()');
  t.equal(Number.isNaN(now), false);

  const newDate = c.evaluate('new Date()');
  t.ok(isDate(newDate));

  t.end();
});
