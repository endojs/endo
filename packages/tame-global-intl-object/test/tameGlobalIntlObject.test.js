// Adapted from CoreJS Copyright (c) 2014-2018 Denis Pushkarev.
// This code is governed by the MIT license found in the LICENSE file.

/* globals globalThis */

import test from 'tape';
import tameGlobalIntlObject from '../src/main';

test('tameGlobalIntlObject - constructor without argument', t => {
  t.plan(1);

  const desc = Object.getOwnPropertyDescriptor(globalThis, 'Date');
  tameGlobalIntlObject();

  const date = new Date();

  t.equal(date.toString(), 'Invalid Date');

  Object.defineProperty(globalThis, 'Date', desc);
});

test('tameGlobalIntlObject - now', t => {
  t.plan(1);

  const desc = Object.getOwnPropertyDescriptor(globalThis, 'Date');
  tameGlobalIntlObject();

  const date = Date.now();

  t.ok(Number.isNaN(date));

  Object.defineProperty(globalThis, 'Date', desc);
});
