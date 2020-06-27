/* global Compartment, lockdown */
import test from 'tape';
import '../src/main.js';

lockdown({ errorTaming: 'unsafe' });

test('lockdown allow Error - Error is tamed unsafe', t => {
  t.equal(typeof Error.captureStackTrace, 'function');
  t.equal(typeof Error.stackTraceLimit, 'number');
  t.equal(typeof new Error().stack, 'string');
  t.end();
});

test('lockdown allow Error - Error in Compartment is tamed unsafe', t => {
  const c = new Compartment();
  t.equal(c.evaluate('typeof Error.captureStackTrace'), 'function');
  t.equal(c.evaluate('typeof Error.stackTraceLimit'), 'number');
  t.equal(c.evaluate('typeof new Error().stack'), 'string');
  t.end();
});

test('lockdown allow Error - Error in nested Compartment is tamed unsafe', t => {
  const c = new Compartment().evaluate('new Compartment()');
  t.equal(c.evaluate('typeof Error.captureStackTrace'), 'function');
  t.equal(c.evaluate('typeof Error.stackTraceLimit'), 'number');
  t.equal(c.evaluate('typeof new Error().stack'), 'string');
  t.end();
});
