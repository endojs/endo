import tap from 'tap';
import { captureGlobals } from '@agoric/test262-runner';
import tameGlobalRegExpObject from '../src/tame-global-reg-exp-object.js';

const { test } = tap;

test('tameGlobalRegExpObject - unsafeRegExp denied', t => {
  const restore = captureGlobals('RegExp');
  tameGlobalRegExpObject('unsafe');

  const regexp = /./;
  t.ok(regexp.constructor === RegExp, 'tamed constructor not reached');

  restore();
  t.end();
});

test('tameGlobalRegExpObject - undeniable prototype', t => {
  const restore = captureGlobals('RegExp');
  tameGlobalRegExpObject('unsafe');

  // Don't try to deny the undeniable
  // https://github.com/Agoric/SES-shim/issues/237
  const regexp1 = new RegExp('.');
  const regexp2 = RegExp('.');
  const regexp3 = /./;
  t.ok(
    // eslint-disable-next-line no-proto
    regexp1.__proto__ === regexp2.__proto__,
    'new vs non-new instances differ',
  );
  t.ok(
    // eslint-disable-next-line no-proto
    regexp1.__proto__ === regexp3.__proto__,
    'new vs literal instances differ',
  );

  t.ok(
    regexp1 instanceof RegExp,
    'new instance not instanceof tamed constructor',
  );
  t.ok(
    regexp2 instanceof RegExp,
    'non-new instance not instanceof tamed constructor',
  );
  t.ok(
    regexp3 instanceof RegExp,
    'literal instance not instanceof tamed constructor',
  );

  restore();
  t.end();
});

test('tameGlobalRegExpObject - constructor', t => {
  const restore = captureGlobals('RegExp');
  tameGlobalRegExpObject('unsafe');

  t.equal(RegExp.name, 'RegExp');
  t.equal(RegExp.prototype.constructor, RegExp);

  const regexp = new RegExp();
  t.ok(regexp instanceof RegExp);
  // eslint-disable-next-line no-proto
  t.equal(regexp.__proto__.constructor, RegExp);

  // bare RegExp() (without 'new') was failing
  // https://github.com/Agoric/SES-shim/issues/230
  t.equal(RegExp('foo').test('bar'), false);
  t.equal(RegExp('foo').test('foobar'), true);

  restore();
  t.end();
});
