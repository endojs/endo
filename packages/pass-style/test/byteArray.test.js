// @ts-nocheck
// Coverage for the byteArray brand check's `allowedOwnDataProperties`
// contract. The check tolerates the `[Symbol.toStringTag]` own property
// that `@endo/immutable-arraybuffer` installs on each emulated immutable
// buffer, but only when that own property is a non-enumerable data
// property whose value is a string. Anything else still fails.
//
// The non-canonical-shape cases below augment a real emulated immutable
// with extra own properties before hardening so the `passStyleOf` entry
// point reaches the byteArray brand check. The canonical-shape case
// asserts that the emulated immutable installed by the lib passes the
// check unchanged.
import test from '@endo/ses-ava/test.js';

import harden from '@endo/harden';
import { passStyleOf } from '../src/passStyleOf.js';

const { defineProperty, getOwnPropertyDescriptor } = Object;

test('byteArray accepts an emulated immutable ArrayBuffer with the standard toStringTag slot', t => {
  const iab = harden(new ArrayBuffer(0).sliceToImmutable());
  t.is(passStyleOf(iab), 'byteArray');
});

test('byteArray accepts an emulated immutable with the well-formed standard slot shape', t => {
  // Sanity-check the contract: the lib installs `[Symbol.toStringTag]` as a
  // non-enumerable, non-writable, non-configurable data property whose
  // value is the string `'ImmutableArrayBuffer'`. The byteArray check
  // permits exactly this shape; if the lib ever ships a different shape
  // this test catches the drift.
  const iab = new ArrayBuffer(0).sliceToImmutable();
  const descriptor = getOwnPropertyDescriptor(iab, Symbol.toStringTag);
  t.deepEqual(descriptor, {
    value: 'ImmutableArrayBuffer',
    writable: false,
    enumerable: false,
    configurable: false,
  });
  t.is(passStyleOf(harden(iab)), 'byteArray');
});

test('byteArray rejects an emulated immutable carrying an extra own data property', t => {
  const iab = new ArrayBuffer(0).sliceToImmutable();
  defineProperty(iab, 'unexpected', {
    value: 'extra',
    writable: false,
    enumerable: false,
    configurable: false,
  });
  harden(iab);
  t.throws(() => passStyleOf(iab), {
    message: /ByteArrays must not have own properties/,
  });
});

test('byteArray rejects an emulated immutable carrying an extra own accessor property', t => {
  const iab = new ArrayBuffer(0).sliceToImmutable();
  defineProperty(iab, 'sneakyAccessor', {
    get: () => 'gotcha',
    enumerable: false,
    configurable: false,
  });
  harden(iab);
  t.throws(() => passStyleOf(iab), {
    message: /ByteArrays must not have own properties/,
  });
});

test('byteArray rejects an emulated immutable carrying an extra enumerable own property', t => {
  const iab = new ArrayBuffer(0).sliceToImmutable();
  defineProperty(iab, 'enumerableExtra', {
    value: 1,
    writable: false,
    enumerable: true,
    configurable: false,
  });
  harden(iab);
  t.throws(() => passStyleOf(iab), {
    message: /ByteArrays must not have own properties/,
  });
});

test('byteArray rejects an emulated immutable carrying a same-key Symbol with a different name', t => {
  // A second emulated-immutable-shaped Symbol-keyed own property (not the
  // canonical `Symbol.toStringTag`) must trip the own-key allowlist.
  const iab = new ArrayBuffer(0).sliceToImmutable();
  defineProperty(iab, Symbol.iterator, {
    value: () => {},
    writable: false,
    enumerable: false,
    configurable: false,
  });
  harden(iab);
  t.throws(() => passStyleOf(iab), {
    message: /ByteArrays must not have own properties/,
  });
});
