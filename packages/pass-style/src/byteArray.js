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

/**
 * @type {PassStyleHelper}
 */
export const ByteArrayHelper = harden({
  styleName: 'byteArray',

  confirmCanBeValid: (candidate, reject) =>
    (candidate instanceof ArrayBuffer && candidate.immutable) ||
    (reject && reject`Immutable ArrayBuffer expected: ${candidate}`),

  assertRestValid: (candidate, _passStyleOfRecur) => {
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
        descriptor && 'value' in descriptor
          ? typeof descriptor.value
          : undefined;
      (descriptor !== undefined &&
        descriptor.enumerable === false &&
        valueType === expectedValueType) ||
        assert.fail(
          X`ByteArray own-property ${key} must be a non-enumerable data property of typeof ${expectedValueType}: ${candidate}`,
          TypeError,
        );
    }
  },
});
