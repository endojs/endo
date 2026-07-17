import harden from '@endo/harden';
import { X, Fail } from '@endo/errors';

/**
 * @import {PassStyleHelper} from './internal-types.js';
 */

const { getPrototypeOf, getOwnPropertyDescriptor } = Object;
const { ownKeys, apply } = Reflect;

// Detects the presence of immutable ArrayBuffer support on the underlying
// platform and provides either suitable values from that implementation or
// values that consistently deny that immutable ArrayBuffers exist.
//
// The Immutable ArrayBuffer proposal has reached stage 3. At that
// threshold we consider the proposal stabilised: the question is whether
// the current JS implementation does or does not implement it, not
// whether the implementation is partial or divergent. The brand check
// that distinguishes emulated immutable buffers from genuine ArrayBuffers
// is the `immutable` accessor on `ArrayBuffer.prototype`, installed by
// the shim (or natively present on platforms that have shipped the
// proposal). The prototype identity check remains as a structural guard
// against a tampered prototype chain.
const { prototype: arrayBufferPrototype } = ArrayBuffer;
const immutableDescriptor = getOwnPropertyDescriptor(
  arrayBufferPrototype,
  'immutable',
);
const immutableGetter =
  /** @type {((this: ArrayBuffer) => boolean) | undefined} */ (
    immutableDescriptor?.get
  ) || (() => false);

// Capture the `%TypedArrayPrototype%.at` method so we can read a byte
// through the genuine integer-indexed protocol without going through the
// wrapper's own (possibly shadowing) data property. On the emulated
// freezable-TypedArray path installed by `@endo/immutable-arraybuffer`,
// this captured reference points at the shim-installed amplifier, which
// resolves the wrapper to its hidden genuine TypedArray and reads from
// the underlying immutable buffer. On the native path (post-Stage-3), it
// points at the genuine `%TypedArrayPrototype%.at`, which reads via the
// integer-indexed exotic. Either way, the read bypasses any own data
// property on the wrapper.
const { prototype: uint8ArrayPrototype } = Uint8Array;
const typedArrayPrototype = getPrototypeOf(uint8ArrayPrototype);
const { at: typedArrayAt } = typedArrayPrototype;

// The permitted own-property keys on an emulated immutable buffer, paired
// with the `typeof` of the data-property value the key must carry. The
// `@endo/immutable-arraybuffer` package installs `[Symbol.toStringTag] =
// 'ImmutableArrayBuffer'` as an own property on each emulated immutable
// (not on the shared prototype) so `concordance` and similar
// `Object.prototype.toString.call`-sniffing consumers route the value
// through their unrenderable-value path rather than into `Buffer.from`
// (which throws on emulated immutables because they are not exotic
// objects). The byteArray brand check tolerates exactly the keys named
// here; for each, it verifies that the key carries a non-enumerable data
// property whose value's `typeof` matches the entry. Anything else still
// fails.
/** @type {Map<string | symbol, string>} */
const allowedOwnDataProperties = new Map([[Symbol.toStringTag, 'string']]);

// Tests whether an arbitrary key is the canonical string form of a
// non-negative integer that fits into a JavaScript Number's safe-integer
// range, the keys spec-mandated as own properties on a TypedArray's
// integer-indexed exotic surface. Spec callout: a "valid integer index"
// for TypedArrays uses `CanonicalNumericIndexString` and is constrained
// to non-negative integers strictly less than the array's `length`.
// `String(Number(key)) === key` rules out leading zeros, decimal points,
// scientific notation, and the trailing `'-0'` form; the explicit
// `Number.isInteger` and non-negativity checks rule out NaN, Infinity,
// and negative integers. The caller still verifies the index is below
// `length` after this returns true.
/**
 * @param {string | symbol} key
 * @returns {boolean}
 */
const isCanonicalIndexKey = key => {
  if (typeof key !== 'string') {
    return false;
  }
  const n = Number(key);
  return Number.isInteger(n) && n >= 0 && String(n) === key && n <= 2 ** 53 - 1;
};

/**
 * Validates the well-formedness of a candidate already known to be a frozen
 * `ArrayBuffer` that claims `immutable === true` and has the expected
 * prototype. Used directly for the raw-immutable-buffer arm of the
 * `byteArray` brand check, and indirectly as a sub-check on the buffer
 * underlying a `Uint8Array` wrapper.
 *
 * @param {ArrayBuffer} candidate
 */
const assertRestValidImmutableArrayBuffer = candidate => {
  getPrototypeOf(candidate) === arrayBufferPrototype ||
    assert.fail(X`Malformed ByteArray ${candidate}`, TypeError);
  apply(immutableGetter, candidate, []) ||
    Fail`Must be an immutable ArrayBuffer: ${candidate}`;
  for (const key of ownKeys(candidate)) {
    const expectedValueType = allowedOwnDataProperties.get(key);
    expectedValueType !== undefined ||
      assert.fail(
        X`ByteArrays must not have own properties: ${candidate}`,
        TypeError,
      );
    const descriptor = getOwnPropertyDescriptor(candidate, key);
    // The descriptor cannot be undefined: `key` was just enumerated by
    // `ownKeys(candidate)`. The conjunction below asserts the shape
    // the brand contract requires: a non-enumerable data property whose
    // value has the expected `typeof`. The dynamic `typeof` comparison
    // against the allowlist's recorded type-name is intentional here;
    // the standard `valid-typeof` lint rule expects a literal RHS.
    const valueType =
      descriptor && 'value' in descriptor ? typeof descriptor.value : undefined;
    (descriptor !== undefined &&
      descriptor.enumerable === false &&
      valueType === expectedValueType) ||
      assert.fail(
        X`ByteArray own-property ${key} must be a non-enumerable data property of typeof ${expectedValueType}: ${candidate}`,
        TypeError,
      );
  }
};

/**
 * Validates that the candidate is a "plain frozen `Uint8Array` backed by a
 * plain frozen immutable `ArrayBuffer`". The unifying definition accepts
 * exactly two well-formed shapes, distinguished by their own-key count:
 *
 * - **Emulated-wrapper shape** (produced by `@endo/immutable-arraybuffer`):
 *   a plain ordinary object whose `[[Prototype]]` is `Uint8Array.prototype`
 *   with **no own integer-indexed own properties**, regardless of `length`.
 *   The shim exposes data through the prototype-chain amplifier; there are
 *   never any own indexed slots on the wrapper itself.
 *
 * - **Native shape** (produced by a TC39-spec-following engine once the
 *   Immutable ArrayBuffer proposal ships): an integer-indexed exotic with
 *   exactly `length`-many own enumerable indexed data properties, each
 *   matching the underlying buffer byte at that offset.
 *
 * Any other own-key count (between 0 and `length`, exclusive, or above
 * `length`) is post-construction tampering and is rejected. Non-index own
 * properties are rejected in both shapes. Indexed own properties that are
 * present on a native-shape wrapper but whose value disagrees with the
 * underlying buffer byte are also rejected.
 *
 * Assumes the candidate has already passed the `isFrozen` gate that
 * `passStyleOf` applies before reaching any helper.
 *
 * @param {Uint8Array} candidate
 */
const assertRestValidPlainFrozenUint8Array = candidate => {
  getPrototypeOf(candidate) === uint8ArrayPrototype ||
    assert.fail(X`Malformed ByteArray ${candidate}`, TypeError);
  // `candidate.buffer` is typed as `ArrayBufferLike` (a union that
  // includes `SharedArrayBuffer`); narrow to `ArrayBuffer` for the
  // sub-check. The `confirmCanBeByteArray` guard already established
  // that the buffer is an `ArrayBuffer` whose `immutable` accessor
  // returned true, so the narrowing is safe at runtime.
  const buffer = /** @type {ArrayBuffer} */ (candidate.buffer);
  // The buffer must itself satisfy the immutable-ArrayBuffer arm of the
  // brand check: a plain frozen immutable `ArrayBuffer`. Reusing the
  // same sub-check guarantees the two arms agree on what counts as a
  // valid backing buffer.
  apply(immutableGetter, buffer, []) ||
    Fail`Uint8Array byteArray must be backed by an immutable ArrayBuffer: ${candidate}`;
  assertRestValidImmutableArrayBuffer(buffer);
  // `length` is the count of bytes the wrapper exposes. It is read via
  // the prototype's `length` accessor, which on the emulated path
  // delegates to the hidden genuine TypedArray and on the native path
  // reads the integer-indexed exotic's `[[ArrayLength]]` slot.
  const length = candidate.length;
  // Collect and validate own keys in one pass, counting indexed keys as we go.
  // On the emulated path the count must be 0 (no own indexed properties at
  // all, regardless of length). On the native path the count must be exactly
  // `length`. Any other count indicates tampering and is rejected after the
  // loop.
  let ownIndexCount = 0;
  for (const key of ownKeys(candidate)) {
    if (!isCanonicalIndexKey(key)) {
      assert.fail(
        X`Plain frozen Uint8Array byteArray must not have own non-index properties: ${candidate}`,
        TypeError,
      );
    }
    const index = Number(/** @type {string} */ (key));
    index < length ||
      assert.fail(
        X`Plain frozen Uint8Array byteArray own index ${key} must be below length ${length}: ${candidate}`,
        TypeError,
      );
    const descriptor = getOwnPropertyDescriptor(candidate, key);
    // The descriptor cannot be undefined: `key` was just enumerated by
    // `ownKeys(candidate)`. Integer-indexed own properties on a frozen
    // `Uint8Array` are enumerable data properties per spec (after freeze:
    // non-writable, non-configurable). On the native exotic path the
    // shape is forced by the integer-indexed-exotic internal methods.
    const value =
      descriptor && 'value' in descriptor ? descriptor.value : undefined;
    (descriptor !== undefined &&
      'value' in descriptor &&
      descriptor.enumerable === true &&
      typeof value === 'number') ||
      assert.fail(
        X`Plain frozen Uint8Array byteArray own index ${key} must be an enumerable number-valued data property: ${candidate}`,
        TypeError,
      );
    // The own data property's value must match the byte the wrapper
    // reads through the integer-indexed protocol. On the native exotic
    // path the equality is structural (the own property *is* the
    // integer-indexed read). The captured `typedArrayAt` bypasses any
    // own data property on the wrapper and reads through the prototype
    // chain, ensuring the comparison is against the underlying buffer byte.
    const byteFromBuffer = apply(typedArrayAt, candidate, [index]);
    value === byteFromBuffer ||
      assert.fail(
        X`Plain frozen Uint8Array byteArray own index ${key} value ${value} must equal underlying byte ${byteFromBuffer}: ${candidate}`,
        TypeError,
      );
    ownIndexCount += 1;
  }
  // Accept only the two well-formed shapes:
  //   - Emulated path: 0 own indexed properties (plain object, any length).
  //   - Native path: exactly `length`-many own indexed properties.
  // Any other count (e.g., a single shadowing write on an emulated wrapper
  // before freeze) is rejected as post-construction tampering, even if the
  // written value matches the underlying buffer byte.
  ownIndexCount === 0 ||
    ownIndexCount === length ||
    assert.fail(
      X`Plain frozen Uint8Array byteArray must have either no own indexed properties (emulated) or exactly length ${length} own indexed properties (native), not ${ownIndexCount}: ${candidate}`,
      TypeError,
    );
};

/**
 * Discriminates the two accepted shapes for the `byteArray` pass style:
 *
 * 1. An immutable `ArrayBuffer` (the original shape that the brand check
 *    accepted before the freezable-TypedArray emulation landed).
 * 2. A `Uint8Array` whose backing buffer is an immutable `ArrayBuffer`
 *    (the shape produced by `new Uint8Array(iab)` where `iab` is an
 *    immutable buffer; per the freezable-TypedArray proposal the wrapper
 *    is frozen and is therefore eligible to pass).
 *
 * The check is fast and conservative: it confirms the shape's
 * top-level brand without recursing into the buffer. `assertRestValid`
 * performs the deeper validation.
 *
 * @param {unknown} candidate
 * @returns {boolean}
 */
const confirmCanBeByteArray = candidate => {
  if (candidate instanceof ArrayBuffer) {
    return /** @type {boolean} */ (apply(immutableGetter, candidate, []));
  }
  if (candidate instanceof Uint8Array) {
    const { buffer } = candidate;
    return (
      buffer instanceof ArrayBuffer &&
      /** @type {boolean} */ (apply(immutableGetter, buffer, []))
    );
  }
  return false;
};

/**
 * @type {PassStyleHelper}
 */
export const ByteArrayHelper = harden({
  styleName: 'byteArray',

  confirmCanBeValid: (candidate, reject) =>
    confirmCanBeByteArray(candidate) ||
    (reject &&
      reject`Immutable ArrayBuffer or Uint8Array on immutable ArrayBuffer expected: ${candidate}`),

  assertRestValid: (candidate, _passStyleOfRecur) => {
    if (candidate instanceof Uint8Array) {
      assertRestValidPlainFrozenUint8Array(candidate);
    } else {
      assertRestValidImmutableArrayBuffer(candidate);
    }
  },
});
