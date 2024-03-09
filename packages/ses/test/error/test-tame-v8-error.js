/* global getStackString */
import test from 'ava';
import '../../index.js';

lockdown();

test('lockdown Error is safe', t => {
  t.is(typeof Error.captureStackTrace, 'function');
  t.is(typeof Error.stackTraceLimit, 'number');
  t.is(Error().stack, '');
});

test('getStackString', t => {
  t.is(typeof getStackString, 'function');

  const error = Error('my message');
  error.name = 'CustomError';
  error.toString = () => 'OverridenError: not the message';
  const stackString = getStackString(error);
  t.regex(stackString, /^CustomError: my message(\n +[^\n]+)?$/m);
});

test('lockdown Error in Compartment is safe', t => {
  const c = new Compartment();
  t.is(c.evaluate('typeof Error.captureStackTrace'), 'function');
  t.is(c.evaluate('typeof Error.stackTraceLimit'), 'undefined');
  t.is(c.evaluate('Error().stack'), '');
});

test('lockdown Error in nested Compartment is safe', t => {
  const c = new Compartment().evaluate('new Compartment()');
  t.is(c.evaluate('typeof Error.captureStackTrace'), 'function');
  t.is(c.evaluate('typeof Error.stackTraceLimit'), 'undefined');
  t.is(c.evaluate('Error().stack'), '');
});
