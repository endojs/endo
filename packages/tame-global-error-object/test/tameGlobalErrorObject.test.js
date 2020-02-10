import tap from 'tap';
import { captureGlobals } from '@agoric/test262-runner';
import tameGlobalErrorObject from '../src/main.js';

const { test } = tap;

test('tameGlobalErrorObject - captureStackTrace', t => {
  t.plan(6);

  const restore = captureGlobals('Error');

  tameGlobalErrorObject();

  const desc = Object.getOwnPropertyDescriptor(Error, 'captureStackTrace');
  t.ok('value' in desc);
  t.equal(typeof desc.value, 'function');
  t.equal(desc.enumerable, false);
  t.equal(desc.configurable, true);

  t.equal(Error.stackTraceLimit, 0);
  Error.stackTraceLimit = 10;
  t.equal(Error.stackTraceLimit, 0);

  restore();
});

test('tameGlobalErrorObject - stackTraceLimit', t => {
  t.plan(7);

  const restore = captureGlobals('Error');

  const desc = Object.getOwnPropertyDescriptor(Error, 'stackTraceLimit');
  t.ok('set' in desc);
  t.ok('get' in desc);
  t.equal(desc.enumerable, false);
  t.equal(desc.configurable, true);

  const error = new Error();
  t.equal(error.stack, undefined);
  error.stack = false;
  t.equal(error.stack, false);
  Error.captureStackTrace(error);
  t.equal(error.stack, '');

  restore();
});
