import { X } from '@endo/errors';

const { getPrototypeOf, getOwnPropertyDescriptor } = Object;
const { ownKeys, apply } = Reflect;

// @ts-expect-error TODO How do I add it to the ArrayBuffer type?
const AnImmutableArrayBuffer = new ArrayBuffer(0).transferToImmutable();
/**
 * As proposed, this will be the same as `ArrayBuffer.prototype`. As shimmed,
 * this will be a hidden intrinsic that inherits from `ArrayBuffer.prototype`.
 * Either way, get this in a way that we can trust it after lockdown, and
 * require that all immutable ArrayBuffers directly inherit from it.
 */
const ImmutableArrayBufferPrototype = getPrototypeOf(AnImmutableArrayBuffer);

// @ts-expect-error ok to implicitly assert the access is found
const immutableGetter = getOwnPropertyDescriptor(
  ImmutableArrayBufferPrototype,
  'immutable',
).get;

/**
 * @type {import('./internal-types.js').PassStyleHelper}
 */
export const ByteArrayHelper = harden({
  styleName: 'byteArray',

  canBeValid: (candidate, check = undefined) =>
    (candidate instanceof ArrayBuffer &&
      // @ts-expect-error TODO How do I add it to the ArrayBuffer type?
      candidate.immutable) ||
    (!!check && check(false, X`Immutable ArrayBuffer expected: ${candidate}`)),

  assertRestValid: (candidate, _passStyleOfRecur) => {
    getPrototypeOf(candidate) === ImmutableArrayBufferPrototype ||
      assert.fail(X`Malformed ByteArray ${candidate}`, TypeError);
    // @ts-expect-error assume immutableGetter was found
    apply(immutableGetter, candidate, []) ||
      assert.fail(X`Must be an immutable ArrayBuffer: ${candidate}`);
    ownKeys(candidate).length === 0 ||
      assert.fail(
        X`ByteArrays must not have own properties: ${candidate}`,
        TypeError,
      );
  },
});
