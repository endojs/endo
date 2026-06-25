// @ts-check

import harden from '@endo/harden';

const { apply } = Reflect;

// `ArrayBuffer.isView` is a TypeScript type guard (`value is ArrayBufferView`).
// Because a `Uint8Array` *is* an `ArrayBufferView`, that guard would narrow the
// `else` branch below to `never` — yet at runtime an emulated freezable wrapper
// (statically a `Uint8Array`) reaches it precisely because `isView` returns
// `false` for it. Retype to a plain predicate so the wrapper path keeps its
// `Uint8Array` type.
const isView = /** @type {(value: unknown) => boolean} */ (ArrayBuffer.isView);

// Capture `%TypedArrayPrototype%.slice` so we can copy an emulated freezable
// wrapper's bytes into a genuine `Uint8Array` with a single native memcopy.
// `@endo/immutable-arraybuffer` installs `slice` as a freezable-aware delegate:
// applied to a wrapper it amplifies to the wrapper's hidden genuine TypedArray
// and returns a fresh mutable `Uint8Array` of the same bytes. We cannot instead
// `result.set(wrapper)` into a genuine target: the wrapper exposes no
// integer-indexed own properties, so `set` reads `undefined` (coerced to `0`)
// for every byte and silently yields zeros.
const { prototype: uint8ArrayPrototype } = Uint8Array;
const typedArrayPrototype = Object.getPrototypeOf(uint8ArrayPrototype);
const { slice: typedArraySlice } = typedArrayPrototype;

/**
 * Returns a genuine `Uint8Array` with the same bytes as `view`, suitable both
 * for integer indexing and for passing down to platform APIs (`TextDecoder`,
 * `TypedArray.prototype.set`, ...) that require a real `ArrayBufferView`.
 *
 * A genuine `Uint8Array` — whether mutable or backed by a native immutable
 * `ArrayBuffer` — is returned unchanged: `ArrayBuffer.isView` is `true` for it
 * and the platform accepts it directly, so no copy is incurred on the common
 * path.
 *
 * An emulated freezable wrapper produced by `@endo/immutable-arraybuffer`
 * (constructing a `Uint8Array` over an emulated immutable `ArrayBuffer` on a
 * platform that has not yet shipped the proposal natively) is a plain object
 * that `ArrayBuffer.isView` rejects and that platform APIs throw on. Its bytes
 * are copied into a fresh mutable `Uint8Array` by the wrapper's native `slice`,
 * which memcopies from the hidden genuine TypedArray it amplifies to.
 *
 * This is the deliberate "prefer poor performance over not working" copy the
 * immutable-ArrayBuffer design calls for: a hidden cost on the emulated path
 * that lets the `@endo/bytes` ponyfills function identically across every
 * `Uint8Array` variant — native or emulated, frozen or mutable — at layers
 * that will eventually support frozen views natively and without penalty.
 *
 * @param {Uint8Array} view
 * @returns {Uint8Array}
 */
export const toGenuineBytes = view => {
  if (isView(view)) {
    return view;
  }
  return apply(typedArraySlice, view, []);
};
harden(toGenuineBytes);
