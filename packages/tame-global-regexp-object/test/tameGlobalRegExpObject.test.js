import tap from 'tap';
// eslint-disable-next-line import/no-extraneous-dependencies
import { captureGlobals } from '@agoric/test262-runner';
import tameGlobalRegExpObject from '../src/main.js';

const { test } = tap;

test('tameGlobalRegExpObject - tamed properties', t => {
  t.plan(2);

  const restore = captureGlobals('RegExp');
  tameGlobalRegExpObject();

  t.notOk('compile' in RegExp.prototype);
  t.notOk('$1' in RegExp);

  restore();
});
