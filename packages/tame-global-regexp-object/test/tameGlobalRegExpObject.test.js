import tap from 'tap';
// eslint-disable-next-line import/no-extraneous-dependencies
import { captureGlobals } from '@agoric/test262-runner';
import tameGlobalRegExpObject from '../src/main.js';

const { test } = tap;

test('tameGlobalRegExpObject - constructor', t => {
  t.plan(4);

  const restore = captureGlobals('RegExp');
  tameGlobalRegExpObject();

  const properties = Reflect.ownKeys(RegExp);
  const properties2 = Reflect.ownKeys(RegExp.prototype.constructor);

  t.deepEqual(
    properties.sort(),
    ['length', 'name', 'prototype'].sort(),
    'RegExp should not have static properties',
  );
  t.deepEqual(
    properties2.sort(),
    ['length', 'name', 'prototype'].sort(),
    'RegExp should not have static properties',
  );

  const regexp = new RegExp();
  const regexp2 = new RegExp.prototype.constructor();

  t.ok(regexp instanceof RegExp);
  t.ok(regexp2 instanceof RegExp);

  restore();
});
