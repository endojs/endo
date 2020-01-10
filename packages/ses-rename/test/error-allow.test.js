/* global Evaluator */
import test from 'tape';
import { lockdown } from '../src/main.js';

lockdown({ errorMode: 'allow' });

test('lockdown allow Error - Error is not tamed', t => {
  const s = new Evaluator();
  t.equal(s.evaluate('typeof Error.captureStackTrace'), 'function');
  t.equal(s.evaluate('typeof Error.stackTraceLimit'), 'number');
  t.equal(s.evaluate('typeof new Error().stack'), 'string');
  t.end();
});

test('lockdown allow Error - Error in nested Evaluator is not tamed', t => {
  const s = new Evaluator().evaluate('new Evaluator()');
  t.equal(s.evaluate('typeof Error.captureStackTrace'), 'function');
  t.equal(s.evaluate('typeof Error.stackTraceLimit'), 'number');
  t.equal(s.evaluate('typeof new Error().stack'), 'string');
  t.end();
});
