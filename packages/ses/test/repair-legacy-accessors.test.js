import test from 'ava';
import sinon from 'sinon';
import repairLegacyAccessors from '../src/repair-legacy-accessors.js';
import stubLegacyAccessors from './stub-legacy-accessors.js';

/* eslint-disable no-restricted-properties, no-underscore-dangle, func-names */

test('repairAccessors - no multiple fix', t => {
  t.plan(1);

  stubLegacyAccessors(sinon);
  repairLegacyAccessors();

  const original = Object.prototype.__lookupGetter__;

  repairLegacyAccessors();

  t.is(Object.prototype.__lookupGetter__, original);

  sinon.restore();
});

stubLegacyAccessors(sinon);
repairLegacyAccessors();

const {
  create,
  prototype: {
    __defineGetter__,
    __defineSetter__,
    __lookupGetter__,
    __lookupSetter__,
  },
} = Object;

test('Object#__defineGetter__', t => {
  t.plan(9);

  t.is(typeof __defineGetter__, 'function');
  t.is(__defineGetter__.length, 2);
  t.is(__defineGetter__.name, '__defineGetter__');

  const object = {};
  t.is(
    object.__defineGetter__('key', () => 42),
    undefined,
    'void',
  );
  t.is(object.key, 42, 'works');

  object.__defineSetter__('key', function() {
    this.foo = 43;
  });
  object.key = 44;
  t.truthy(object.key === 42 && object.foo === 43, 'works with setter');

  t.throws(
    () => object.__defineSetter__('foo', undefined),
    { instanceOf: TypeError },
    'Throws on not function`',
  );

  t.throws(
    () => __defineGetter__.call(null, 1, () => {}),
    { instanceOf: TypeError },
    'Throws on null as `this`',
  );
  t.throws(
    () => __defineGetter__.call(undefined, 1, () => {}),
    { instanceOf: TypeError },
    'Throws on undefined as `this`',
  );
});

test('Object#__defineSetter__', t => {
  t.plan(9);

  t.is(typeof __defineSetter__, 'function');
  t.is(__defineSetter__.length, 2);
  t.is(__defineSetter__.name, '__defineSetter__');

  const object = {};
  t.is(
    object.__defineSetter__('key', function() {
      this.foo = 43;
    }),
    undefined,
    'void',
  );
  object.key = 44;
  t.is(object.foo, 43, 'works');

  object.__defineSetter__('key', function() {
    this.foo = 43;
  });
  object.__defineGetter__('key', () => 42);
  object.key = 44;
  t.truthy(object.key === 42 && object.foo === 43, 'works with getter');

  t.throws(
    () => object.__defineSetter__('foo', undefined),
    { instanceOf: TypeError },
    'Throws on not function`',
  );

  t.throws(
    () => __defineSetter__.call(null, 1, () => {}),
    { instanceOf: TypeError },
    'Throws on null as `this`',
  );
  t.throws(
    () => __defineSetter__.call(undefined, 1, () => {}),
    { instanceOf: TypeError },
    'Throws on undefined as `this`',
  );
});

test('Object#__lookupGetter__', t => {
  t.plan(14);

  t.is(typeof __lookupGetter__, 'function');
  t.is(__lookupGetter__.length, 1);
  t.is(__lookupGetter__.name, '__lookupGetter__');
  // assert.looksNative(__lookupGetter__);
  t.is(
    Object.getOwnPropertyDescriptor(Object.prototype, '__lookupGetter__')
      .enumerable,
    false,
  );
  t.is({}.__lookupGetter__('key'), undefined, 'empty object');
  t.is({ key: 42 }.__lookupGetter__('key'), undefined, 'data descriptor');

  const obj1 = {};
  function setter1() {}
  obj1.__defineGetter__('key', setter1);

  t.is(obj1.__lookupGetter__('key'), setter1, 'own getter');
  t.is(create(obj1).__lookupGetter__('key'), setter1, 'proto getter');
  t.is(create(obj1).__lookupGetter__('foo'), undefined, 'empty proto');

  const obj2 = {};
  function setter2() {}
  const symbol2 = Symbol('key');
  obj2.__defineGetter__(symbol2, setter2);

  t.is(obj2.__lookupGetter__(symbol2), setter2, 'own getter');
  t.is(create(obj2).__lookupGetter__(symbol2), setter2, 'proto getter');
  t.is(
    create(obj2).__lookupGetter__(Symbol('foo')),
    undefined,
    'empty proto',
  );

  t.throws(
    () => __lookupGetter__.call(null, 1, () => {}),
    { instanceOf: TypeError },
    'Throws on null as `this`',
  );
  t.throws(
    () => __lookupGetter__.call(undefined, 1, () => {}),
    { instanceOf: TypeError },
    'Throws on undefined as `this`',
  );
});

test('Object#__lookupSetter__', t => {
  t.plan(14);

  t.is(typeof __lookupSetter__, 'function');
  t.is(__lookupSetter__.length, 1);
  t.is(__lookupSetter__.name, '__lookupSetter__');
  // assert.looksNative(__lookupSetter__);
  t.is(
    Object.getOwnPropertyDescriptor(Object.prototype, '__lookupSetter__')
      .enumerable,
    false,
  );
  t.is({}.__lookupSetter__('key'), undefined, 'empty object');
  t.is({ key: 42 }.__lookupSetter__('key'), undefined, 'data descriptor');

  const obj1 = {};
  function setter1() {}
  obj1.__defineSetter__('key', setter1);

  t.is(obj1.__lookupSetter__('key'), setter1, 'own getter');
  t.is(create(obj1).__lookupSetter__('key'), setter1, 'proto getter');
  t.is(create(obj1).__lookupSetter__('foo'), undefined, 'empty proto');

  const obj2 = {};
  function setter2() {}
  const symbol2 = Symbol('key');
  obj2.__defineSetter__(symbol2, setter2);

  t.is(obj2.__lookupSetter__(symbol2), setter2, 'own getter');
  t.is(create(obj2).__lookupSetter__(symbol2), setter2, 'proto getter');
  t.is(
    create(obj2).__lookupSetter__(Symbol('foo')),
    undefined,
    'empty proto',
  );

  t.throws(
    () => __lookupSetter__.call(null, 1, () => {}),
    { instanceOf: TypeError },
    'Throws on null as `this`',
  );
  t.throws(
    () => __lookupSetter__.call(undefined, 1, () => {}),
    { instanceOf: TypeError },
    'Throws on undefined as `this`',
  );
});

sinon.restore();

/* eslint-enable no-restricted-properties, no-underscore-dangle, func-names */
