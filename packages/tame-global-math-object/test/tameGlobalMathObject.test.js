// Adapted from CoreJS Copyright (c) 2014-2018 Denis Pushkarev.
// This code is governed by the MIT license found in the LICENSE file.

import test from 'tape';
// eslint-disable-next-line import/no-extraneous-dependencies
import { captureGlobals } from '@agoric/test262-runner';
import tameGlobalMathObject from '../src/main';

test('tameGlobalMathObject - tamed properties', t => {
  t.plan(1);

  const restore = captureGlobals('Math');
  tameGlobalMathObject();

  t.throws(() => Math.random(), 'disabled');

  restore();
});
