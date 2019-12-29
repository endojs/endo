// Adapted from CoreJS Copyright (c) 2014-2018 Denis Pushkarev.
// This code is governed by the MIT license found in the LICENSE file.

import test from 'tape';
import tameGlobalErrorObject from '../src/main';

function stub(obj, prop, fn) {
  const desc = Object.getOwnPropertyDescriptor(obj, prop);
  obj[prop] = fn;

  function restore() {
    if (desc) {
      Object.defineProperty(obj, prop, desc);
    } else {
      delete obj[prop];
    }
  }

  return restore;
}

test('tameGlobalErrorObject - no multiple fix', t => {
  t.plan(1);

  const restore1 = stub(Error, 'captureStackTrace', () => {});
  const restore2 = stub(Error.prototype, 'stack', '');

  tameGlobalErrorObject();
  const patched1 = Object.getOwnPropertyDescriptor(Error.prototype, 'stack');

  tameGlobalErrorObject();
  const patched2 = Object.getOwnPropertyDescriptor(Error.prototype, 'stack');

  t.equal(patched1.get, patched2.get);

  restore1();
  restore2();
});

test.skip('tameGlobalErrorObject - stack', t => {
  t.plan(2);

  const restore1 = stub(Error, 'captureStackTrace', () => {});
  const restore2 = stub(Error.prototype, 'stack', '');

  Error.prototype.stack === true;
  t.notOk(Error.prototype.stack === undefined);

  tameGlobalErrorObject();
  const error = new Error();
  t.equal(error.stack, 'stack suppressed');

  restore1();
  restore2();
});

test('tameGlobalErrorObject - captureStackTrace', t => {
  t.plan(2);

  const restore1 = stub(Error, 'captureStackTrace', () => {});
  const restore2 = stub(Error.prototype, 'stack', '');

  Error.captureStackTrace === true;
  t.notOk(Error.captureStackTrace === undefined);

  tameGlobalErrorObject();
  t.ok(Error.captureStackTrace === undefined);

  restore1();
  restore2();
});
