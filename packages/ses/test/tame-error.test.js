/* global Compartment, lockdown */
import test from 'tape';
import '../src/main.js';

lockdown();

test('lockdown default - Error is safe', t => {
  t.equal(typeof Error.captureStackTrace, 'function');
  t.equal(Error.stackTraceLimit, undefined);
  t.equal(typeof new Error().stack, 'string');
  t.end();
});

test('lockdown default - Error in Compartment is safe', t => {
  const c = new Compartment();
  t.equal(c.evaluate('typeof Error.captureStackTrace'), 'function');
  t.equal(c.evaluate('Error.stackTraceLimit'), undefined);
  t.equal(c.evaluate('typeof new Error().stack'), 'string');
  t.end();
});

test('lockdown default - Error in nested Compartment is safe', t => {
  const c = new Compartment().evaluate('new Compartment()');
  t.equal(c.evaluate('typeof Error.captureStackTrace'), 'function');
  t.equal(c.evaluate('Error.stackTraceLimit'), undefined);
  t.equal(c.evaluate('typeof new Error().stack'), 'string');
  t.end();
});
