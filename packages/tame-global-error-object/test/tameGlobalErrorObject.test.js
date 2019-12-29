// Adapted from CoreJS Copyright (c) 2014-2018 Denis Pushkarev.
// This code is governed by the MIT license found in the LICENSE file.

import test from 'tape';
// eslint-disable-next-line import/no-extraneous-dependencies
import { captureGlobals } from '@agoric/test262-runner';
import tameGlobalErrorObject from '../src/main';

test.skip('tameGlobalErrorObject - stack', t => {
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
