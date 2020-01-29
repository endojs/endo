/* global Compartment */
import test from 'tape';
import { lockdown } from '../src/main.js';

lockdown();

test('lockdown allow Error - Error is tamed', t => {
  const c = new Compartment();
  t.equal(c.evaluate('typeof Error.captureStackTrace'), 'undefined');
  t.equal(c.evaluate('typeof Error.stackTraceLimit'), 'undefined');
  t.equal(c.evaluate('typeof new Error().stack'), 'undefined');
  t.end();
});

test('lockdown allow Error - Error in nested Compartment is tamed', t => {
  const c = new Compartment().evaluate('new Compartment()');
  t.equal(c.evaluate('typeof Error.captureStackTrace'), 'undefined');
  t.equal(c.evaluate('typeof Error.stackTraceLimit'), 'undefined');
  t.equal(c.evaluate('typeof new Error().stack'), 'undefined');
  t.end();
});
