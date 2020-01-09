/* global Evaluator */
import test from 'tape';
import { lockdown } from '../src/main.js';

lockdown();

test('lockdown allow Error - Error is tamed', t => {
  const s = new Evaluator();
  t.equal(s.evaluate('typeof Error.captureStackTrace'), 'undefined');
  t.equal(s.evaluate('typeof Error.stackTraceLimit'), 'undefined');
  t.equal(s.evaluate('typeof new Error().stack'), 'undefined');
  t.end();
});

test('lockdown allow Error - Error in nested Evaluator is tamed', t => {
  const s = new Evaluator().evaluate('new Evaluator()');
  t.equal(s.evaluate('typeof Error.captureStackTrace'), 'undefined');
  t.equal(s.evaluate('typeof Error.stackTraceLimit'), 'undefined');
  t.equal(s.evaluate('typeof new Error().stack'), 'undefined');
  t.end();
});
