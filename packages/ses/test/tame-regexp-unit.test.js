import tap from 'tap';
import tameRegExpConstructor from '../src/tame-regexp-constructor.js';

const { test } = tap;

const unsafeRegExp = RegExp;
const {
  '%InitialRegExp%': InitialRegExp,
  '%SharedRegExp%': SharedRegExp,
} = tameRegExpConstructor('safe');

test('tameRegExpConstructor - unsafeRegExp denied', t => {
  t.ok(unsafeRegExp !== InitialRegExp, 'constructor not replaced');
  const regexp = /./;
  t.ok(regexp.constructor === SharedRegExp, 'tamed constructor not reached');
  // Don't leak the unsafe constructor
  // https://github.com/Agoric/SES-shim/issues/237
  t.ok(regexp.constructor !== unsafeRegExp, 'unsafe constructor reachable!');

  t.end();
});

test('tameRegExpConstructor - undeniable prototype', t => {
  // Don't try to deny the undeniable
  // https://github.com/Agoric/SES-shim/issues/237
  const regexp1 = new InitialRegExp('.');
  const regexp2 = InitialRegExp('.');
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
    regexp1 instanceof InitialRegExp,
    'new instance not instanceof tamed constructor',
  );
  t.ok(
    regexp2 instanceof InitialRegExp,
    'non-new instance not instanceof tamed constructor',
  );
  t.ok(
    regexp3 instanceof InitialRegExp,
    'literal instance not instanceof tamed constructor',
  );

  t.end();
});

test('tameRegExpConstructor - constructor', t => {
  t.equal(InitialRegExp.name, 'RegExp');
  t.equal(InitialRegExp.prototype.constructor, SharedRegExp);
  t.equal(
    Object.getOwnPropertyDescriptor(InitialRegExp.prototype, 'compile'),
    undefined,
  );

  const allowedProperties = new Set([
    'length',
    'name',
    'prototype',
    Symbol.species,
  ]);
  const properties = Reflect.ownKeys(InitialRegExp);
  for (const prop of properties) {
    t.ok(
      allowedProperties.has(prop),
      `RegExp may not have static property ${String(prop)}`,
    );
  }

  const regexp = new InitialRegExp();
  t.ok(regexp instanceof InitialRegExp);
  // eslint-disable-next-line no-proto
  t.equal(regexp.__proto__.constructor, SharedRegExp);

  // bare InitialRegExp() (without 'new') was failing
  // https://github.com/Agoric/SES-shim/issues/230
  t.equal(InitialRegExp('foo').test('bar'), false);
  t.equal(InitialRegExp('foo').test('foobar'), true);

  t.end();
});
