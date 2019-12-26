// Adapted from CoreJS Copyright (c) 2014-2018 Denis Pushkarev.
// This code is governed by the MIT license found in the LICENSE file.

import test from "tape";
import sinon from "sinon";
import tameGlobalDateObject from "../src/main";

test("tameGlobalDateObject - no multiple fix", t => {
  t.plan(1);

  const desc = Object.getOwnPropertyDescriptor(globalThis, 'Date');
  tameGlobalDateObject();

  const patched = globalThis.Date;

  tameGlobalDateObject();

  t.equal(globalThis.Date, patched);

  Object.defineProperty(globalThis, 'Date', desc);
});

test("tameGlobalDateObject - constructor without argument", t => {
  t.plan(1);

  const desc = Object.getOwnPropertyDescriptor(globalThis, 'Date');
  tameGlobalDateObject();

  const date = new Date();

  t.equal(date.toString(), 'Invalid Date');

  Object.defineProperty(globalThis, 'Date', desc);
});

test("tameGlobalDateObject - now", t => {
  t.plan(1);

  const desc = Object.getOwnPropertyDescriptor(globalThis, 'Date');
  tameGlobalDateObject();

  const date = Date.now();

  t.ok(isNaN(date));

  Object.defineProperty(globalThis, 'Date', desc);
});
