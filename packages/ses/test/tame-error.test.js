/* global Compartment */
import test from 'tape';
import { lockdown } from '../src/lockdown-shim.js';

lockdown();

test('lockdown default - Error is tamed', t => {
  const c = new Compartment();
  t.equal(c.evaluate('typeof Error.captureStackTrace'), 'function');
  t.equal(c.evaluate('typeof Error.stackTraceLimit'), 'number');
  t.equal(c.evaluate('typeof new Error().stack'), 'string');
  t.end();
});

test('lockdown default - Error in nested Compartment is tamed', t => {
  const c = new Compartment().evaluate('new Compartment()');
  t.equal(c.evaluate('typeof Error.captureStackTrace'), 'function');
  t.equal(c.evaluate('typeof Error.stackTraceLimit'), 'number');
  t.equal(c.evaluate('typeof new Error().stack'), 'string');
  t.end();
});
