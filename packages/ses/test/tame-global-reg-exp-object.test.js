import tap from 'tap';
import { captureGlobals } from '@agoric/test262-runner';
import tameGlobalRegExpObject from '../src/tame-global-reg-exp-object.js';

const { test } = tap;

test('tameGlobalRegExpObject - constructor', t => {
  t.plan(8);

  const restore = captureGlobals('RegExp');
  tameGlobalRegExpObject();

  t.equal(RegExp.name, 'RegExp');
  t.equal(RegExp.prototype.constructor, RegExp);
  t.equal(
    Object.getOwnPropertyDescriptor(RegExp.prototype, 'compile'),
    undefined,
  );

  const properties = Reflect.ownKeys(RegExp);
  t.deepEqual(
    properties.sort(),
    ['length', 'name', 'prototype'].sort(),
    'RegExp should not have static properties',
  );

  const regexp = new RegExp();
  t.ok(regexp instanceof RegExp);
  // eslint-disable-next-line no-proto
  t.equal(regexp.__proto__.constructor, RegExp);

  // bare RegExp() (without 'new') was failing
  // https://github.com/Agoric/SES-shim/issues/230
  t.equal(RegExp('foo').test('bar'), false);
  t.equal(RegExp('foo').test('foobar'), true);

  restore();
});
