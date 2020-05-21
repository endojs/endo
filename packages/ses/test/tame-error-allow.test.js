/* global Compartment, lockdown */
import test from 'tape';
import '../src/main.js';

lockdown({ errorTaming: 'unsafe' });

test('lockdown allow Error - Error is not tamed', t => {
  const c = new Compartment();
  t.equal(c.evaluate('typeof Error.captureStackTrace'), 'function');
  t.equal(c.evaluate('typeof Error.stackTraceLimit'), 'number');
  t.equal(c.evaluate('typeof new Error().stack'), 'string');
  t.end();
});

test('lockdown allow Error - Error in nested Compartment is not tamed', t => {
  const c = new Compartment().evaluate('new Compartment()');
  t.equal(c.evaluate('typeof Error.captureStackTrace'), 'function');
  t.equal(c.evaluate('typeof Error.stackTraceLimit'), 'number');
  t.equal(c.evaluate('typeof new Error().stack'), 'string');
  t.end();
});
