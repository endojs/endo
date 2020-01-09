import tap from 'tap';
// eslint-disable-next-line import/no-extraneous-dependencies
import { captureGlobals } from '@agoric/test262-runner';
import tameGlobalErrorObject from '../src/main.js';

const { test } = tap;

test('tameGlobalErrorObject', t => {
  t.plan(3);

  const restore = captureGlobals('Error');

  tameGlobalErrorObject();

  t.equal(Error.captureStackTrace, undefined);
  t.equal(Error.stackTraceLimit, undefined);

  const error = new Error();
  t.equal(error.stack, undefined);

  restore();
});
