/* global Compartment */
import test from 'tape';
import { lockdown } from '../src/main.js';

lockdown({ noTameError: true });

test('lockdown allow Error - Error is not tamed', t => {
  t.plan(6);

  const c = new Compartment();
  t.equal(c.evaluate('typeof Error.captureStackTrace'), 'function');
  t.equal(c.evaluate('typeof Error.stackTraceLimit'), 'number');
  t.equal(c.evaluate('typeof new Error().stack'), 'string');

  const error = new Error();
  error.stack = false;
  Error.captureStackTrace(error);
  t.equal(typeof error.stack, 'string');
  t.notEqual(error.stack, '');

  t.throws(() => {
    Error.stackTraceLimit = 10;
  }, Error);
});

test('lockdown allow Error - Error in nested Compartment is not tamed', t => {
  t.plan(6);

  const c = new Compartment().evaluate('new Compartment()');
  t.equal(c.evaluate('typeof Error.captureStackTrace'), 'function');
  t.equal(c.evaluate('typeof Error.stackTraceLimit'), 'number');
  t.equal(c.evaluate('typeof new Error().stack'), 'string');

  const error = new Error();
  error.stack = false;
  Error.captureStackTrace(error);
  t.equal(typeof error.stack, 'string');
  t.notEqual(error.stack, '');

  t.throws(() => {
    Error.stackTraceLimit = 10;
  }, Error);
});
