// @ts-check

import test from 'ava';
import { makeHardener } from '../src/make-hardener.js';
import { assert } from '../src/error/assert.js';

const { quote: q } = assert;

test('makeHardener', t => {
  const h = makeHardener();
  const o = { a: {} };
  t.is(h(o), o);
  t.truthy(Object.isFrozen(o));
  t.truthy(Object.isFrozen(o.a));
});

test('harden the same thing twice', t => {
  const h = makeHardener();
  const o = { a: {} };
  t.is(h(o), o);
  t.is(h(o), o);
  t.truthy(Object.isFrozen(o));
  t.truthy(Object.isFrozen(o.a));
});

test('harden objects with cycles', t => {
  const h = makeHardener();
  const o = { a: {} };
  o.a.foo = o;
  t.is(h(o), o);
  t.truthy(Object.isFrozen(o));
  t.truthy(Object.isFrozen(o.a));
});

test('harden overlapping objects', t => {
  const h = makeHardener();
  const o1 = { a: {} };
  const o2 = { a: o1.a };
  t.is(h(o1), o1);
  t.truthy(Object.isFrozen(o1));
  t.truthy(Object.isFrozen(o1.a));
  t.falsy(Object.isFrozen(o2));
  t.is(h(o2), o2);
  t.truthy(Object.isFrozen(o2));
});

test('harden up prototype chain', t => {
  const h = makeHardener();
  const a = { a: 1 };
  const b = { b: 1, __proto__: a };
  const c = { c: 1, __proto__: b };

  h(c);
  t.truthy(Object.isFrozen(a));
});

test('harden tolerates objects with null prototypes', t => {
  const h = makeHardener();
  const o = { a: 1 };
  Object.setPrototypeOf(o, null);
  t.is(h(o), o);
  t.truthy(Object.isFrozen(o));
  t.truthy(Object.isFrozen(o.a));
});

test('harden typed arrays', t => {
  const typedArrayConstructors = [
    BigInt64Array,
    BigUint64Array,
    Float32Array,
    Float64Array,
    Int16Array,
    Int32Array,
    Int8Array,
    Uint16Array,
    Uint32Array,
    Uint8Array,
    Uint8ClampedArray,
  ];

  for (const TypedArray of typedArrayConstructors) {
    const h = makeHardener();
    const a = new TypedArray(1);

    t.is(h(a), a, `harden ${TypedArray}`);
    t.truthy(Object.isSealed(a));
    const descriptor = Object.getOwnPropertyDescriptor(a, '0');
    t.is(descriptor.value, a[0]);
    // Fails in Node.js 14 and earlier due to an engine bug:
    // t.is(descriptor.configurable, true, 'hardened typed array indexed property remains configurable');
    // Note that indexes of typed arrays are exceptionally writable for hardened objects.
    t.is(
      descriptor.writable,
      true,
      'hardened typed array indexed property is writable',
    );
    t.is(
      descriptor.enumerable,
      true,
      'hardened typed array indexed property is enumerable',
    );
  }
});

test('harden typed arrays and their expandos', t => {
  const h = makeHardener();
  const a = new Uint8Array(1);

  // TODO: Use fast-check to generate arbitrary input.
  const expandoKeys = [
    // number-coercible strings that are not in canonical form
    // https://tc39.es/ecma262/multipage/abstract-operations.html#sec-canonicalnumericindexstring
    // https://tc39.es/ecma262/multipage/abstract-operations.html#prod-StringNumericLiteral
    '',
    ' ',
    ' 0',
    '0 ',
    '0b0',
    '0o0',
    '0x0',
    '+0',
    // disabled because V8 misinterprets as canonical -0 anything matched by
    // /-(0+(\.0*)?|\.0+)/ with optional leading and/or trailing StrWhiteSpace
    // '-0 ',
    '00',
    '.0',
    '0.',
    '9007199254740993', // reserializes to "9007199254740992" (Number.MAX_SAFE_INTEGER + 1)
    '0.0000001', // reserializes to "1e-7"
    '1000000000000000000000', // reserializes to "1e+21"

    // other strings
    'x',

    // symbols
    Symbol('unique symbol'),
    Symbol.for('registered symbol'),
    Symbol.match,
  ];
  for (const key of expandoKeys) {
    a[key] = { a: { b: { c: 10 } } };
  }

  t.is(h(a), a, 'harden() must return typed array input');
  t.deepEqual(
    Reflect.ownKeys(a),
    ['0'].concat(expandoKeys),
    'hardened typed array keys must exactly match pre-hardened keys',
  );

  // Index properties remain writable.
  {
    const descriptor = Object.getOwnPropertyDescriptor(a, '0');
    t.like(
      descriptor,
      { value: 0, writable: true, enumerable: true },
      'hardened typed array index property',
    );
    // Fails in Node.js 14 and earlier due to an engine bug:
    // t.is(descriptor.configurable, true, 'typed array indexed property is configurable');
    // Note that indexes of typed arrays are exceptionally writable for hardened objects:
  }

  // Non-index properties are locked down.
  for (const key of expandoKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(a, key);
    t.like(
      descriptor,
      { configurable: false, writable: false, enumerable: true },
      `hardened typed array expando ${q(key)}`,
    );
    t.is(
      descriptor.value,
      a[key],
      `hardened typed array expando ${q(key)} value identity`,
    );
    t.deepEqual(
      descriptor.value,
      { a: { b: { c: 10 } } },
      `hardened typed array expando ${q(key)} value shape`,
    );
    t.truthy(
      Object.isFrozen(descriptor.value),
      `hardened typed array expando ${q(key)} value is frozen`,
    );
    t.truthy(
      Object.isFrozen(descriptor.value.a),
      `hardened typed array expando ${q(key)} value property is frozen`,
    );
    t.truthy(
      Object.isFrozen(descriptor.value.a.b),
      `hardened typed array expando ${q(key)} value subproperty is frozen`,
    );
    t.truthy(
      Object.isFrozen(descriptor.value.a.b.c),
      `hardened typed array expando ${q(key)} value sub-subproperty is frozen`,
    );
  }

  t.truthy(Object.isSealed(a), 'hardened typed array is sealed');
});

test('hardening makes writable properties readonly even if non-configurable', t => {
  const h = makeHardener();
  const o = {};
  Object.defineProperty(o, 'x', {
    value: 10,
    writable: true,
    configurable: false,
    enumerable: false,
  });
  h(o);

  t.deepEqual(Object.getOwnPropertyDescriptor(o, 'x'), {
    value: 10,
    writable: false,
    configurable: false,
    enumerable: false,
  });
});

test('harden a typed array with a writable non-configurable expando', t => {
  const h = makeHardener();
  const a = new Uint8Array(1);
  Object.defineProperty(a, 'x', {
    value: 'A',
    writable: true,
    configurable: false,
    enumerable: false,
  });

  t.is(h(a), a);
  t.truthy(Object.isSealed(a));

  t.deepEqual(
    {
      value: 'A',
      writable: false,
      configurable: false,
      enumerable: false,
    },
    Object.getOwnPropertyDescriptor(a, 'x'),
  );
});

test('harden a typed array subclass', t => {
  const h = makeHardener();

  class Ooint8Array extends Uint8Array {
    oo = 'ghosts';
  }

  const a = new Ooint8Array(1);
  t.is(h(a), a);

  t.deepEqual(Object.getOwnPropertyDescriptor(a, 'oo'), {
    value: 'ghosts',
    writable: false,
    configurable: false,
    enumerable: true,
  });
  t.truthy(Object.isFrozen(Ooint8Array.prototype));
  t.truthy(Object.isFrozen(Object.getPrototypeOf(Ooint8Array.prototype)));
  t.truthy(Object.isSealed(a));
});

test('harden depends on invariant: typed arrays have no storage for integer indexes beyond length', t => {
  const a = new Uint8Array(1);
  a[1] = 1;
  t.is(a[1], undefined);
});

test('harden depends on invariant: typed arrays cannot have integer expandos', t => {
  const a = new Uint8Array(1);
  t.throws(() => {
    Object.defineProperty(a, '1', {
      value: 'A',
      writable: true,
      configurable: false,
      enumerable: false,
    });
  });
});
