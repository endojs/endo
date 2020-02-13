/* global Compartment */
import test from 'tape';
import { lockdown } from '../src/main.js';

lockdown();

test('lockdown default - Error is tamed', t => {
  t.plan(6);

  const c = new Compartment();
  t.equal(c.evaluate('typeof Error.captureStackTrace'), 'function');
  t.equal(c.evaluate('typeof Error.stackTraceLimit'), 'number');
  t.equal(c.evaluate('typeof new Error().stack'), 'string');

  const error = new Error();
  error.stack = false;
  Error.captureStackTrace(error);
  t.equal(error.stack, '');

  t.equal(Error.stackTraceLimit, 0);
  Error.stackTraceLimit = 10;
  t.equal(Error.stackTraceLimit, 0);
});

test('lockdown default - Error in nested Compartment is tamed', t => {
  t.plan(6);

  const c = new Compartment().evaluate('new Compartment()');
  t.equal(c.evaluate('typeof Error.captureStackTrace'), 'function');
  t.equal(c.evaluate('typeof Error.stackTraceLimit'), 'number');
  t.equal(c.evaluate('typeof new Error().stack'), 'string');

  const error = new Error();
  error.stack = false;
  Error.captureStackTrace(error);
  t.equal(error.stack, '');

  t.equal(Error.stackTraceLimit, 0);
  Error.stackTraceLimit = 10;
  t.equal(Error.stackTraceLimit, 0);
});
