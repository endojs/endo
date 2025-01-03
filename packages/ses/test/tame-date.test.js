import test from 'ava';
import '../index.js';

lockdown();

function isDate(date) {
  return (
    Object.prototype.toString.call(date) === '[object Date]' &&
    Number.isInteger(date.getTime())
  );
}

test('lockdown start Date is powerful', t => {
  t.truthy(Number.isInteger(Date.now()));
  t.truthy(isDate(new Date()));
});

test('lockdown Date.prototype.constructor is powerless', t => {
  const SharedDate = /** @type {DateConstructor} */ (
    Date.prototype.constructor
  );
  t.not(Date, SharedDate);

  t.throws(() => SharedDate.now(), {
    message: /^secure mode/,
  });

  t.throws(() => new SharedDate(), {
    message: /^secure mode/,
  });
});

test('lockdown Date in Compartment is powerless', t => {
  const c = new Compartment();
  t.is(c.evaluate('Date.parse("1982-04-09")'), Date.parse('1982-04-09'));

  t.throws(() => c.evaluate('Date.now()'), {
    message: /^secure mode/,
  });

  t.throws(() => c.evaluate('new Date()'), {
    message: /^secure mode/,
  });
});

test('lockdown Date in nested Compartment is powerless', t => {
  const c = new Compartment().evaluate('new Compartment()');

  t.throws(() => c.evaluate('Date.now()'), {
    message: /^secure mode/,
  });

  t.throws(() => c.evaluate('new Date()'), {
    message: /^secure mode/,
  });
});
