/* global Compartment, lockdown */
import test from 'tape';
import '../src/main.js';

lockdown();

function isDate(date) {
  return (
    Object.prototype.toString.call(date) === '[object Date]' &&
    Number.isInteger(date.getTime())
  );
}

test('lockdown start Date is powerful', t => {
  t.ok(Number.isInteger(Date.now()));
  t.ok(isDate(new Date()));

  t.end();
});

test('lockdown Date.prototype.constructor is powerless', t => {
  const SharedDate = Date.prototype.constructor;
  t.notEqual(Date, SharedDate);
  t.ok(Number.isNaN(SharedDate.now()));
  t.equal(`${new SharedDate()}`, 'Invalid Date');

  t.end();
});

test('lockdown Date in Compartment is powerless', t => {
  const c = new Compartment();
  t.equal(c.evaluate('Date.parse("1982-04-09")'), Date.parse('1982-04-09'));

  const now = c.evaluate('Date.now()');
  t.ok(Number.isNaN(now));

  const newDate = c.evaluate('new Date()');
  t.equal(`${newDate}`, 'Invalid Date');

  t.end();
});

test('lockdown Date in nested Compartment is powerless', t => {
  const c = new Compartment().evaluate('new Compartment()');

  const now = c.evaluate('Date.now()');
  t.ok(Number.isNaN(now));

  const newDate = c.evaluate('new Date()');
  t.equal(`${newDate}`, 'Invalid Date');

  t.end();
});
