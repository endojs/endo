import test from 'ava';
import tameRegExpConstructor from '../src/tame-regexp-constructor.js';

const unsafeRegExp = RegExp;
const { '%InitialRegExp%': InitialRegExp, '%SharedRegExp%': SharedRegExp } =
  tameRegExpConstructor('safe');

test('tameRegExpConstructor - unsafeRegExp denied', t => {
  t.truthy(unsafeRegExp !== InitialRegExp, 'constructor not replaced');
  const regexp = /./;
  t.truthy(
    regexp.constructor === SharedRegExp,
    'tamed constructor not reached',
  );
  // Don't leak the unsafe constructor
  // https://github.com/Agoric/SES-shim/issues/237
  t.truthy(
    regexp.constructor !== unsafeRegExp,
    'unsafe constructor reachable!',
  );
});

test('tameRegExpConstructor - undeniable prototype', t => {
  // Don't try to deny the undeniable
  // https://github.com/Agoric/SES-shim/issues/237
  const regexp1 = new InitialRegExp('.');
  const regexp2 = InitialRegExp('.');
  const regexp3 = /./;
  t.truthy(
    // eslint-disable-next-line no-proto
    regexp1.__proto__ === regexp2.__proto__,
    'new vs non-new instances differ',
  );
  t.truthy(
    // eslint-disable-next-line no-proto
    regexp1.__proto__ === regexp3.__proto__,
    'new vs literal instances differ',
  );

  t.truthy(
    regexp1 instanceof InitialRegExp,
    'new instance not instanceof tamed constructor',
  );
  t.truthy(
    regexp2 instanceof InitialRegExp,
    'non-new instance not instanceof tamed constructor',
  );
  t.truthy(
    regexp3 instanceof InitialRegExp,
    'literal instance not instanceof tamed constructor',
  );
});

test('tameRegExpConstructor - constructor', t => {
  t.is(InitialRegExp.name, 'RegExp');
  t.is(InitialRegExp.prototype.constructor, SharedRegExp);
  t.is(
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
    t.truthy(
      allowedProperties.has(prop),
      `RegExp may not have static property ${String(prop)}`,
    );
  }

  const regexp = new InitialRegExp();
  t.truthy(regexp instanceof InitialRegExp);
  // eslint-disable-next-line no-proto
  t.is(regexp.__proto__.constructor, SharedRegExp);

  // bare InitialRegExp() (without 'new') was failing
  // https://github.com/Agoric/SES-shim/issues/230
  t.is(InitialRegExp('foo').test('bar'), false);
  t.is(InitialRegExp('foo').test('foobar'), true);
});
