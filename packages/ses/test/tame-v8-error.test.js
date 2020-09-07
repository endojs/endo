import test from 'tape';
import '../ses.js';

lockdown();

test('lockdown Error is safe', t => {
  t.equal(typeof Error.captureStackTrace, 'function');
  t.equal(typeof Error.stackTraceLimit, 'number');
  t.equal(typeof new Error().stack, 'string');
  t.end();
});

test('lockdown Error in Compartment is safe', t => {
  const c = new Compartment();
  t.equal(c.evaluate('typeof Error.captureStackTrace'), 'undefined');
  t.equal(c.evaluate('typeof Error.stackTraceLimit'), 'undefined');
  t.equal(c.evaluate('typeof new Error().stack'), 'string');
  t.end();
});

test('lockdown Error in nested Compartment is safe', t => {
  const c = new Compartment().evaluate('new Compartment()');
  t.equal(c.evaluate('typeof Error.captureStackTrace'), 'undefined');
  t.equal(c.evaluate('typeof Error.stackTraceLimit'), 'undefined');
  t.equal(c.evaluate('typeof new Error().stack'), 'string');
  t.end();
});
