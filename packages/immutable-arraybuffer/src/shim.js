/* global globalThis */

import {
  immutableArrayBufferLibProperties,
  freezableTypedArrayLibProperties,
  makePseudoTypedArrayConstructor,
  concreteTypedArrayCtors,
} from './lib.js';

const {
  ArrayBuffer,
  Object,
  // eslint-disable-next-line no-restricted-globals
} = globalThis;

const {
  getOwnPropertyDescriptors,
  defineProperties,
  defineProperty,
  getPrototypeOf,
} = Object;
const { prototype: arrayBufferPrototype } = ArrayBuffer;

// Stage-3 install policy: detect-then-skip.
//
// Both the Immutable ArrayBuffer proposal and the parallel Freezable
// TypedArray proposal are part of the same TC39 proposal, which has
// reached stage 3. At stage 3 or above our policy is detect-then-skip:
// if a prior installation (a native implementation, or a previously
// loaded shim) has already provided `sliceToImmutable` on
// `ArrayBuffer.prototype`, we defer to that installation rather than
// overwriting it. The native implementation always wins.
//
// `sliceToImmutable` is the load-bearing presence check: the proposal
// adds `sliceToImmutable`, `transferToImmutable`, and the `immutable`
// accessor as a unit, and any installer (native or shim) that provides
// one provides all three. Checking only one keeps the detect-then-skip
// branch deterministic.
//
// For proposals prior to stage 3 a warn-and-overwrite policy would be
// appropriate so the shim stays authoritative across partial or
// divergent platform implementations. The Immutable ArrayBuffer proposal
// is past that threshold.
if (!('sliceToImmutable' in arrayBufferPrototype)) {
  // ArrayBuffer-side install (immutable ArrayBuffer shim).
  defineProperties(
    arrayBufferPrototype,
    getOwnPropertyDescriptors(immutableArrayBufferLibProperties),
  );

  // Freezable TypedArray install.
  //
  // The %TypedArrayPrototype% is the shared abstract superclass prototype
  // that all eleven concrete TypedArray constructors (Int8Array, Uint8Array,
  // etc.) inherit through their own `.prototype`. Installing the property
  // record once on %TypedArrayPrototype% covers all eleven flavors.
  //
  // `getPrototypeOf(Uint8Array.prototype)` is the standard way to reach
  // %TypedArrayPrototype% without a dedicated
  // intrinsic name.
  const typedArrayPrototype = getPrototypeOf(
    // eslint-disable-next-line no-restricted-globals
    globalThis.Uint8Array.prototype,
  );

  // Install the lib property record onto %TypedArrayPrototype%.
  //
  // `freezableTypedArrayLibProperties` is an unfrozen record whose
  // descriptors are configurable and writable (matching the shape of the
  // native %TypedArrayPrototype% methods), so we can pass them directly
  // to `defineProperties` without reopening.
  defineProperties(
    typedArrayPrototype,
    getOwnPropertyDescriptors(freezableTypedArrayLibProperties),
  );

  // Replace each of the eleven concrete global TypedArray constructors with
  // the pseudo-constructor produced by the lib. The pseudo-constructor
  // discriminates on `buffers` brand membership and falls through to
  // the genuine constructor for all other call shapes.
  for (const { name, Ctor } of concreteTypedArrayCtors) {
    const PseudoCtor = makePseudoTypedArrayConstructor(Ctor);
    defineProperty(
      // eslint-disable-next-line no-restricted-globals
      globalThis,
      name,
      {
        value: PseudoCtor,
      },
    );
  }
}
