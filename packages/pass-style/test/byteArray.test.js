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
//
// The second section covers the freezable-Uint8Array arm of the brand
// check: a plain frozen `Uint8Array` whose backing buffer is a plain
// frozen immutable `ArrayBuffer` is accepted as a `byteArray`. The
// "plain" definition accepts exactly two well-formed shapes:
//   - Emulated path: no own indexed properties at all, regardless of
//     length. The `@endo/immutable-arraybuffer` shim produces this shape;
//     any own indexed property is post-construction tampering and is
//     rejected even when the value agrees with the underlying buffer byte.
//   - Native path: exactly `length`-many own indexed properties, each an
//     enumerable data property whose value matches the underlying buffer
//     byte. This is the shape a spec-conformant engine will produce once
//     the Immutable ArrayBuffer proposal ships natively.
// Non-index own properties are rejected on both paths.
import test from '@endo/ses-ava/test.js';

import harden from '@endo/harden';
import { passStyleOf } from '../src/passStyleOf.js';

const { defineProperty, freeze, getOwnPropertyDescriptor } = Object;
const { ownKeys } = Reflect;

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

// Plain frozen Uint8Array backed by plain frozen immutable ArrayBuffer.

test('byteArray accepts a plain frozen Uint8Array backed by an immutable ArrayBuffer', t => {
  const ab = new ArrayBuffer(4);
  new Uint8Array(ab).set([1, 2, 3, 4]);
  const iab = ab.sliceToImmutable();
  const view = new Uint8Array(iab);
  harden(view);
  t.is(passStyleOf(view), 'byteArray');
});

test('byteArray accepts a plain frozen Uint8Array on a zero-length immutable ArrayBuffer (emulated, no own indexed properties)', t => {
  const iab = new ArrayBuffer(0).sliceToImmutable();
  const view = new Uint8Array(iab);
  harden(view);
  t.is(passStyleOf(view), 'byteArray');
});

test('byteArray accepts a plain frozen non-empty emulated Uint8Array with no own indexed properties', t => {
  // The emulated freezable-TypedArray wrapper is a plain ordinary object
  // with no own integer-indexed properties regardless of length. Data is
  // accessible through the prototype-chain amplifier that resolves to the
  // hidden genuine TypedArray. This test confirms the acceptance criterion
  // is "no own indexed properties" rather than "zero length".
  const ab = new ArrayBuffer(8);
  new Uint8Array(ab).set([10, 20, 30, 40, 50, 60, 70, 80]);
  const iab = ab.sliceToImmutable();
  const view = new Uint8Array(iab);
  // Verify the emulated wrapper has no own indexed properties.
  t.deepEqual(
    ownKeys(view).filter(k => typeof k === 'string' && /^\d+$/.test(k)),
    [],
  );
  harden(view);
  t.is(passStyleOf(view), 'byteArray');
});

test('byteArray rejects a Uint8Array backed by a mutable ArrayBuffer', t => {
  // A `Uint8Array` on a mutable backing buffer cannot be frozen on either
  // the emulated or the native path: integer-indexed exotic slots are
  // non-configurable accessor-like properties and `Object.freeze` is
  // defined to reject them. `passStyleOf` therefore rejects the wrapper
  // with the "Cannot pass mutable typed arrays" message at the early
  // `isFrozen` gate, before any helper is consulted.
  const ab = new ArrayBuffer(4);
  new Uint8Array(ab).set([1, 2, 3, 4]);
  const view = new Uint8Array(ab);
  t.throws(() => passStyleOf(view), {
    message: /Cannot pass mutable typed arrays/,
  });
});

test('byteArray rejects a Uint8Array on an immutable ArrayBuffer with a shadowing index that disagrees with the buffer', t => {
  // The emulated wrapper is a plain ordinary object whose `[[Prototype]]`
  // is `Uint8Array.prototype`. Before freezing, `view[0] = 99` succeeds
  // by creating an own data property on the wrapper that shadows the
  // prototype-based integer-indexed read. The underlying immutable
  // buffer's byte 0 is unchanged. After freezing, the wrapper carries an
  // own enumerable data property `'0'` whose value (99) disagrees with
  // the byte the underlying buffer would yield (10); the brand check
  // catches the disagreement.
  const ab = new ArrayBuffer(4);
  new Uint8Array(ab).set([10, 20, 30, 40]);
  const iab = ab.sliceToImmutable();
  const view = new Uint8Array(iab);
  view[0] = 99;
  harden(view);
  t.throws(() => passStyleOf(view), {
    message: /must equal underlying byte/,
  });
});

test('byteArray rejects an emulated Uint8Array whose own indexed property matches the buffer byte', t => {
  // On the emulated path the wrapper is a plain ordinary object with no own
  // indexed properties; any own indexed property is post-construction
  // tampering. The brand check rejects the wrapper even when the own
  // property's value happens to agree with the underlying buffer byte,
  // because an emulated wrapper must have zero own indexed properties (not
  // one, not length-many: zero).
  const ab = new ArrayBuffer(4);
  new Uint8Array(ab).set([10, 20, 30, 40]);
  const iab = ab.sliceToImmutable();
  const view = new Uint8Array(iab);
  // Write the same value the buffer already holds at index 0.
  view[0] = 10;
  harden(view);
  t.throws(() => passStyleOf(view), {
    message: /must have either no own indexed properties.*or exactly length/,
  });
});

test('byteArray rejects a Uint8Array on an immutable ArrayBuffer with an out-of-range own index', t => {
  // An own data property whose key is a canonical integer but whose
  // index is at or beyond the wrapper's `length`. This shape can arise
  // on the emulated path through a deliberate `defineProperty` after
  // construction; the brand check rejects it as not in `[0, length)`.
  const ab = new ArrayBuffer(2);
  new Uint8Array(ab).set([1, 2]);
  const iab = ab.sliceToImmutable();
  const view = new Uint8Array(iab);
  defineProperty(view, '2', {
    value: 3,
    writable: false,
    enumerable: true,
    configurable: false,
  });
  freeze(view);
  t.throws(() => passStyleOf(view), {
    message: /must be below length/,
  });
});

test('byteArray rejects a Uint8Array on an immutable ArrayBuffer with a non-index own property', t => {
  // An own data property whose key is not a canonical integer. The
  // brand check rejects all such keys regardless of descriptor shape.
  const iab = new ArrayBuffer(0).sliceToImmutable();
  const view = new Uint8Array(iab);
  defineProperty(view, 'extra', {
    value: 'hello',
    writable: false,
    enumerable: false,
    configurable: false,
  });
  harden(view);
  t.throws(() => passStyleOf(view), {
    message: /must not have own non-index properties/,
  });
});

test('byteArray rejects a Uint8Array on an immutable ArrayBuffer with a non-canonical numeric key', t => {
  // A key like `'01'` or `'1.5'` is not a canonical integer index per
  // `CanonicalNumericIndexString`. The brand check rejects it as a
  // non-index own property even though `Number(key)` is finite.
  const iab = new ArrayBuffer(4).sliceToImmutable();
  const view = new Uint8Array(iab);
  defineProperty(view, '01', {
    value: 0,
    writable: false,
    enumerable: true,
    configurable: false,
  });
  freeze(view);
  t.throws(() => passStyleOf(view), {
    message: /must not have own non-index properties/,
  });
});

test('byteArray rejects a Uint8Array on an immutable ArrayBuffer with an accessor own property at an integer index', t => {
  // An accessor own property at a canonical index key is not a data
  // property of the spec-required shape; reject it. The wrapper's
  // shape after this `defineProperty` plus `freeze` is observable as a
  // canonical index key with an accessor descriptor; the brand check
  // rejects on the missing `value` slot.
  const ab = new ArrayBuffer(2);
  new Uint8Array(ab).set([1, 2]);
  const iab = ab.sliceToImmutable();
  const view = new Uint8Array(iab);
  defineProperty(view, '0', {
    get: () => 1,
    enumerable: true,
    configurable: false,
  });
  freeze(view);
  t.throws(() => passStyleOf(view), {
    message: /must be an enumerable number-valued data property/,
  });
});

test('byteArray rejects a Uint8Array whose backing immutable ArrayBuffer carries an extraneous own property', t => {
  // The backing-buffer sub-check reuses the immutable-ArrayBuffer arm
  // verbatim. A buffer carrying an unallowed own data property fails
  // the sub-check before the wrapper's own keys are walked.
  const iab = new ArrayBuffer(2).sliceToImmutable();
  defineProperty(iab, 'tampered', {
    value: 1,
    writable: false,
    enumerable: false,
    configurable: false,
  });
  const view = new Uint8Array(iab);
  harden(view);
  t.throws(() => passStyleOf(view), {
    message: /ByteArrays must not have own properties/,
  });
});
