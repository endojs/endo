import tap from 'tap';
// eslint-disable-next-line import/no-extraneous-dependencies
import { captureGlobals } from '@agoric/test262-runner';
import tameGlobalErrorObject from '../src/main.js';

const { test } = tap;

test('tameGlobalErrorObject - stack', { skip: true }, t => {
  t.plan(2);

  const restore = captureGlobals('Error');

  Error.prototype.stack === true;
  t.notOk(Error.prototype.stack === undefined);

  tameGlobalErrorObject();
  const error = new Error();
  t.equal(error.stack, 'stack suppressed');

  restore();
});

test('tameGlobalErrorObject - captureStackTrace', t => {
  t.plan(2);

  const restore = captureGlobals('Error');

  Error.captureStackTrace === true;
  t.notOk(Error.captureStackTrace === undefined);

  tameGlobalErrorObject();
  t.ok(Error.captureStackTrace === undefined);

  restore();
});
