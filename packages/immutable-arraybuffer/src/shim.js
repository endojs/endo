/* global globalThis */

import { immutableArrayBufferLibProperties } from './lib.js';

const {
  ArrayBuffer,
  Object,
  // eslint-disable-next-line no-restricted-globals
} = globalThis;

const { getOwnPropertyDescriptors, defineProperties } = Object;
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
  defineProperties(
    arrayBufferPrototype,
    getOwnPropertyDescriptors(immutableArrayBufferLibProperties),
  );
}
