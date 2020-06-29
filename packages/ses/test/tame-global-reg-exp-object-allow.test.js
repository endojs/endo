import tap from 'tap';
import tameGlobalRegExpObject from '../src/tame-global-reg-exp-object.js';

const { test } = tap;

const {
  start: {
    RegExp: { value: tamedRegExp },
  },
  shared: {
    RegExp: { value: sharedRegExp },
  },
} = tameGlobalRegExpObject('unsafe');

test('tameGlobalRegExpObject - unsafeRegExp denied', t => {
  const regexp = /./;
  t.ok(regexp.constructor === sharedRegExp, 'tamed constructor not reached');

  t.end();
});

test('tameGlobalRegExpObject - undeniable prototype', t => {
  // Don't try to deny the undeniable
  // https://github.com/Agoric/SES-shim/issues/237
  // eslint-disable-next-line new-cap
  const regexp1 = new tamedRegExp('.');
  const regexp2 = tamedRegExp('.');
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
    regexp1 instanceof tamedRegExp,
    'new instance not instanceof tamed constructor',
  );
  t.ok(
    regexp2 instanceof tamedRegExp,
    'non-new instance not instanceof tamed constructor',
  );
  t.ok(
    regexp3 instanceof tamedRegExp,
    'literal instance not instanceof tamed constructor',
  );

  t.end();
});

test('tameGlobalRegExpObject - constructor', t => {
  t.equal(tamedRegExp.name, 'RegExp');
  t.equal(tamedRegExp.prototype.constructor, sharedRegExp);

  // eslint-disable-next-line new-cap
  const regexp = new tamedRegExp();
  t.ok(regexp instanceof tamedRegExp);
  // eslint-disable-next-line no-proto
  t.equal(regexp.__proto__.constructor, sharedRegExp);

  // bare tamedRegExp() (without 'new') was failing
  // https://github.com/Agoric/SES-shim/issues/230
  t.equal(tamedRegExp('foo').test('bar'), false);
  t.equal(tamedRegExp('foo').test('foobar'), true);

  t.end();
});
