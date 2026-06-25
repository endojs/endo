// @ts-nocheck
// Lib-level unit tests for the freezable-TypedArray emulation.
// These tests exercise the property-record and pseudo-constructor machinery in
// isolation (with the ArrayBuffer-side shim installed so that
// `sliceBufferToImmutable` and friends are available via the prototype).
import '../src/shim.js';
import test from 'ava';
import {
  sliceBufferToImmutable,
  makePseudoTypedArrayConstructor,
} from '../src/lib.js';

const { getPrototypeOf } = Object;

// makePseudoTypedArrayConstructor - wrapping an immutable ArrayBuffer

test('makePseudoTypedArrayConstructor wraps an immutable ArrayBuffer', t => {
  const ab = new ArrayBuffer(4);
  new Uint8Array(ab).set([1, 2, 3, 4]);
  const iab = sliceBufferToImmutable(ab);

  const PseudoUint8Array = makePseudoTypedArrayConstructor(Uint8Array);
  const view = new PseudoUint8Array(iab);

  // The wrapper's prototype is Uint8Array.prototype (no intermediate prototype).
  t.is(getPrototypeOf(view), Uint8Array.prototype);

  // The amplifier (via .buffer getter) returns the immutable wrapper, not the
  // genuine backing buffer.
  // `virtualTypedArrayBufferGetter` is exercised internally; we observe its
  // effect through the installed `view.buffer` accessor.
  t.is(view.buffer, iab);
  t.true(view.buffer.immutable);
});

// makePseudoTypedArrayConstructor - forwarding a non-immutable first arg

test('makePseudoTypedArrayConstructor forwards a non-immutable first arg', t => {
  const realAb = new ArrayBuffer(4);
  new Uint8Array(realAb).set([10, 20, 30, 40]);

  const PseudoUint8Array = makePseudoTypedArrayConstructor(Uint8Array);
  const view = new PseudoUint8Array(realAb);

  // Fallthrough path: the result is a genuine TypedArray, not a wrapper.
  t.is(getPrototypeOf(view), Uint8Array.prototype);

  // `view.buffer` returns the real buffer (amplifyTypedArray falls through to
  // the receiver itself for a genuine TypedArray).
  t.is(view.buffer, realAb);

  // Mutators work normally on the genuine view.
  view[0] = 99;
  t.is(view[0], 99);
});

// buffer getter - returns genuine buffer for a genuine TypedArray (fallthrough)

test('buffer getter returns the real buffer for a genuine TypedArray', t => {
  const realAb = new ArrayBuffer(4);
  const view = new Uint8Array(realAb);

  // `virtualTypedArrayBufferGetter` is installed on %TypedArrayPrototype%;
  // `view.buffer` exercises the fallthrough path.
  t.is(view.buffer, realAb);
  t.false(view.buffer.immutable);
});

// buffer getter - redirects to the immutable wrapper when the TypedArray is
// an emulated freezable

test('buffer getter redirects to the immutable wrapper when present', t => {
  const ab = new ArrayBuffer(4);
  const iab = sliceBufferToImmutable(ab);

  const PseudoUint8Array = makePseudoTypedArrayConstructor(Uint8Array);
  const view = new PseudoUint8Array(iab);

  // `virtualTypedArrayBufferGetter` is installed on %TypedArrayPrototype%;
  // `view.buffer` exercises the emulated-wrapper path.
  t.is(view.buffer, iab);
  t.true(view.buffer.immutable);
});

// amplifyTypedArray - brand-WeakMap amplifier (observed through read delegates)

test('amplifyTypedArray delegates reads from the hidden genuine TypedArray for a wrapper', t => {
  const ab = new ArrayBuffer(4);
  new Uint8Array(ab).set([5, 6, 7, 8]);
  const iab = sliceBufferToImmutable(ab);

  const PseudoUint8Array = makePseudoTypedArrayConstructor(Uint8Array);
  const view = new PseudoUint8Array(iab);

  // `amplifyTypedArray` is called by the `byteLength`, `length`, and `at`
  // property descriptors installed on %TypedArrayPrototype%. The values
  // match the underlying bytes.
  t.is(view.byteLength, 4);
  t.is(view.length, 4);
  t.is(view.at(0), 5);
  t.is(view.at(3), 8);
});

test('amplifyTypedArray falls through for a genuine TypedArray', t => {
  // A genuine TypedArray is not in `hiddenTypedArrays`; `amplifyTypedArray`
  // returns the receiver itself.
  // We observe this by verifying that `byteLength` reads from the view
  // directly (the genuine buffer's length, not a wrapper's).
  const view = new Uint8Array(new ArrayBuffer(4));
  t.is(view.byteLength, 4);
  t.is(view.length, 4);
});
