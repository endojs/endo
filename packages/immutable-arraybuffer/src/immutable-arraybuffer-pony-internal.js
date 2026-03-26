/* global globalThis */

import { makeInternalHeir, getGetter } from './internal-heir.js';

/**
 * I couldn't find a TypeScript `TypedArray` type. If there actually is one,
 * we should use it here.
 *
 * @typedef {Int8Array
 *  | Uint8Array
 *  | Int16Array
 *  | Uint16Array
 *  | Int32Array
 *  | Uint32Array
 *  | BigInt64Array
 *  | BigUint64Array
 *  | Float16Array
 *  | Float32Array
 *  | Float64Array
 * } TypedArray
 */

const {
  ArrayBuffer,
  Object,
  Reflect,
  Symbol,
  TypeError,
  Uint8Array,
  WeakMap,
  // Capture structuredClone before it can be scuttled.
  structuredClone: optStructuredClone,
  // eslint-disable-next-line no-restricted-globals
} = globalThis;

const { freeze, getPrototypeOf } = Object;
const { apply } = Reflect;
const { toStringTag } = Symbol;
const { get: weakMapGet, set: weakMapSet, has: weakMapHas } = WeakMap.prototype;

const { prototype: arrayBufferPrototype } = ArrayBuffer;
const { slice, transfer: optTransfer } = arrayBufferPrototype;

const typedArrayPrototype = getPrototypeOf(Uint8Array.prototype);
const { set: uint8ArraySet } = typedArrayPrototype;

/**
 * The original `TypeArray.prototype.buffer` getter function.
 *
 * "FERAL" because
 * - this reveals the real underlying ArrayBuffer, which this package
 *   may encapsulate inside a virtual immutable ArrayBuffer in order to
 *   contain side effects.
 * - This one happens to only work on genuine typed arrays, not emulated ones.
 * - The shim may replace `TypeArray.prototype.buffer` with a safe one that also
 *   works on emulated freezable typed arrays.
 *
 * Therefore, this export is for use only within this package.
 * If `TypeArray.prototype.buffer` has been replaced, then
 * `FERAL_GET_ARRAY_BUFFER` must not escape beyond this package.
 *
 * @type {(this: TypedArray) => ArrayBuffer}
 */
export const FERAL_GET_ARRAY_BUFFER = getGetter(typedArrayPrototype, 'buffer');

/**
 * The original `ArrayBuffer.prototype.length` getter function.
 *
 * "original" but not "FERAL" because
 * - This one happens to work only on genuine ArrayBuffers
 * - The shim may replace `ArrayBuffer.prototype.length` with one that also
 *   works on emulated immutable ArrayBuffers.
 * - while this should not leak beyond this package, if it does, the only
 *   hazard is that it will reveal that an emulated ArrayBuffer is not a
 *   genuine one, which is already detectable by other means.
 *
 * @type {(this: ArrayBuffer) => number}
 */
const originalGetArrayBufferByteLength = getGetter(
  arrayBufferPrototype,
  'byteLength',
);

/**
 * Copy a range of values from a genuine ArrayBuffer exotic object into a new
 * ArrayBuffer.
 *
 * @param {ArrayBuffer} realBuffer
 * @param {number} [start]
 * @param {number} [end]
 * @returns {ArrayBuffer}
 */
const arrayBufferSlice = (realBuffer, start = undefined, end = undefined) =>
  apply(slice, realBuffer, [start, end]);

/**
 * @callback ArrayBufferTransfer
 * Move the contents of a genuine ArrayBuffer exotic object into a new fresh
 * ArrayBuffer and detach the original source.
 * We can only do this on platforms that support `structuredClone` or
 * `ArrayBuffer.prototype.transfer`.
 * On other platforms, we can still emulate
 * `ArrayBuffer.prototoype.sliceToImmutable`, but not
 * `ArrayBuffer.prototype.transferToImmutable`.
 * Currently, these known-deficient platforms are
 * - Hermes
 * - Node.js <= 16
 * - Apparently some versions of JavaScriptCore that are still of concern.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {ArrayBuffer}
 */

/** @type {ArrayBufferTransfer | undefined} */
let optArrayBufferTransfer;

if (optTransfer) {
  optArrayBufferTransfer = arrayBuffer => apply(optTransfer, arrayBuffer, []);
} else if (optStructuredClone) {
  optArrayBufferTransfer = arrayBuffer => {
    // Hopefully, a zero-length slice is cheap, but still enforces that
    // `arrayBuffer` is a genuine `ArrayBuffer` exotic object.
    arrayBufferSlice(arrayBuffer, 0, 0);
    return optStructuredClone(arrayBuffer, {
      transfer: [arrayBuffer],
    });
  };
} else {
  // Assignment is redundant, but remains for clarity.
  optArrayBufferTransfer = undefined;
}

/**
 * If we could use classes with private fields everywhere, this would have
 * been a `this.#buffer` private field on an `ImmutableArrayBufferInternal`
 * class. But we currently cannot do so on Hermes. So, instead, we
 * emulate the `this.#buffer` private field, including its use as a brand check.
 * Maps from all and only emulated Immutable ArrayBuffers to real ArrayBuffers.
 *
 * NOTE: this is exported just for use within this package by
 * freezable-typearray-pony, and must not be accessible from outside this
 * package.
 *
 * @type {Pick<WeakMap<ArrayBuffer, ArrayBuffer>, 'get' | 'has' | 'set'>}
 */
export const hiddenBuffers = new WeakMap();
/**
 * NOTE: this is exported just for use within this package by
 * freezable-typearray-pony, and must not be accessible from outside this
 * package.
 *
 * @type { Pick < WeakMap < ArrayBuffer, ArrayBuffer >, 'get' | 'has' | 'set' >}
 */
export const reverseHiddenBuffers = new WeakMap();

/**
 * @param {ArrayBuffer} immuAB
 */
const getBuffer = immuAB => {
  const result = apply(weakMapGet, hiddenBuffers, [immuAB]);
  if (result) {
    return result;
  }
  throw TypeError('Not an emulated Immutable ArrayBuffer');
};

const immutableArrayBufferInternalPrototype = makeInternalHeir(
  arrayBufferPrototype,
  'an immutable ArrayBuffer',
  getBuffer,
  [
    // redirected queries
    'byteLength',
    'slice',
  ],
  [
    // complaining mutators
    'resize',
    'transfer',
    'transferToFixedLength',
  ],
  /** @type {ThisType<ArrayBuffer>} */ ({
    get detached() {
      getBuffer(this); // shim brand check
      return false;
    },
    get maxByteLength() {
      // Not underlying maxByteLength, which is irrelevant
      return apply(originalGetArrayBufferByteLength, getBuffer(this), []);
    },
    get resizable() {
      getBuffer(this); // shim brand check
      return false;
    },
    get immutable() {
      getBuffer(this); // shim brand check
      return true;
    },
    sliceToImmutable(start = undefined, end = undefined) {
      // eslint-disable-next-line no-use-before-define
      return sliceBufferToImmutable(getBuffer(this), start, end);
    },
    /**
     * See https://github.com/endojs/endo/tree/master/packages/immutable-arraybuffer#purposeful-violation
     */
    [toStringTag]: 'ImmutableArrayBuffer',
  }),
);

/**
 * Emulates what would have been the encapsulated `ImmutableArrayBufferInternal`
 * class constructor. This function takes the `realBuffer` which its
 * result encapsulates. Security demands that this result has exclusive access
 * to the `realBuffer` it is given, which its callers must ensure.
 *
 * @param {ArrayBuffer} realBuffer
 * @returns {ArrayBuffer}
 */
const makeImmutableArrayBufferInternal = realBuffer => {
  const result = /** @type {ArrayBuffer} */ (
    /** @type {unknown} */ ({
      __proto__: immutableArrayBufferInternalPrototype,
    })
  );
  apply(weakMapSet, hiddenBuffers, [result, realBuffer]);
  apply(weakMapSet, reverseHiddenBuffers, [realBuffer, result]);
  return result;
};
// Since `makeImmutableArrayBufferInternal` MUST not escape,
// this `freeze` is just belt-and-suspenders.
freeze(makeImmutableArrayBufferInternal);

/**
 * @param {ArrayBuffer} buffer
 * @returns {boolean}
 */
export const isBufferImmutable = buffer =>
  apply(weakMapHas, hiddenBuffers, [buffer]);

/**
 * Creates an immutable slice of the given buffer.
 * @param {ArrayBuffer} buffer The original buffer.
 * @param {number} [start] The start index.
 * @param {number} [end] The end index.
 * @returns {ArrayBuffer} The sliced immutable ArrayBuffer.
 */
export const sliceBufferToImmutable = (
  buffer,
  start = undefined,
  end = undefined,
) => {
  let realBuffer = apply(weakMapGet, hiddenBuffers, [buffer]);
  if (realBuffer === undefined) {
    realBuffer = buffer;
  }
  return makeImmutableArrayBufferInternal(
    arrayBufferSlice(realBuffer, start, end),
  );
};

let transferBufferToImmutable;
if (optArrayBufferTransfer) {
  /**
   * Transfer the contents to a new Immutable ArrayBuffer
   *
   * @param {ArrayBuffer} buffer The original buffer.
   * @param {number} [newLength] The start index.
   * @returns {ArrayBuffer}
   */
  transferBufferToImmutable = (buffer, newLength = undefined) => {
    if (newLength === undefined) {
      buffer = optArrayBufferTransfer(buffer);
    } else if (optTransfer) {
      buffer = apply(optTransfer, buffer, [newLength]);
    } else {
      buffer = optArrayBufferTransfer(buffer);
      const oldLength = buffer.byteLength;
      if (newLength <= oldLength) {
        buffer = arrayBufferSlice(buffer, 0, newLength);
      } else {
        const oldTA = new Uint8Array(buffer);
        const newTA = new Uint8Array(newLength);
        apply(uint8ArraySet, newTA, [oldTA]);
        buffer = apply(FERAL_GET_ARRAY_BUFFER, newTA, []);
      }
    }
    const result = makeImmutableArrayBufferInternal(buffer);
    return /** @type {ArrayBuffer} */ (/** @type {unknown} */ (result));
  };
} else {
  transferBufferToImmutable = undefined;
}

/**
 * By not exporting the `let`, we avoid creating a live binding.
 */
export const optTransferBufferToImmutable = transferBufferToImmutable;
