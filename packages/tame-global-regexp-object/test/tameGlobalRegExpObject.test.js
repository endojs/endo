// Adapted from CoreJS Copyright (c) 2014-2018 Denis Pushkarev.
// This code is governed by the MIT license found in the LICENSE file.

import test from 'tape';
// eslint-disable-next-line import/no-extraneous-dependencies
import { captureGlobals } from '@agoric/test262-runner';
import tameGlobalRegExpObject from '../src/main';

test('tameGlobalRegExpObject - tamed properties', t => {
  t.plan(2);

  const restore = captureGlobals('RegExp');
  tameGlobalRegExpObject();

  t.notOk('compile' in RegExp.prototype);
  t.notOk('$1' in RegExp);

  restore();
});
