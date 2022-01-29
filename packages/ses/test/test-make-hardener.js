/* global BigInt64Array, BigUint64Array */
// @ts-check

import test from 'ava';
import { makeHardener } from '../src/make-hardener.js';

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
    t.deepEqual(
      {
        value: a[0],
        writable: true, // Note that indexes of typed arrays are exceptionally writable for hardened objects.
        configurable: false,
        enumerable: true,
      },
      Object.getOwnPropertyDescriptor(a, '0'),
    );
  }
});

test('harden typed arrays and their expandos', t => {
  const h = makeHardener();
  const a = new Uint8Array(1);
  // @ts-ignore
  a.x = { y: { z: 10 } };

  t.is(h(a), a);
  t.truthy(Object.isSealed(a));

  t.deepEqual(
    {
      value: 0,
      writable: true, // Note that indexes of typed arrays are exceptionally writable for hardened objects.
      configurable: false,
      enumerable: true,
    },
    Object.getOwnPropertyDescriptor(a, '0'),
  );

  t.deepEqual(
    {
      // @ts-ignore
      value: a.x,
      writable: false,
      configurable: false,
      enumerable: true,
    },
    Object.getOwnPropertyDescriptor(a, 'x'),
  );

  // @ts-ignore
  t.truthy(Object.isFrozen(a.x));
  // @ts-ignore
  t.truthy(Object.isFrozen(a.x.y));
  // @ts-ignore
  t.truthy(Object.isFrozen(a.x.y.z));
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
  t.deepEqual(
    {
      value: 10,
      writable: false,
      configurable: false,
      enumerable: false,
    },
    Object.getOwnPropertyDescriptor(o, 'x'),
  );
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
