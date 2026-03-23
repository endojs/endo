/* global globalThis */
/* eslint-disable @endo/no-polymorphic-call */

const {
  ArrayBuffer,
  Object,
  Reflect,
  TypeError,
  Uint8Array,
  // Capture structuredClone before it can be scuttled.
  structuredClone: optStructuredClone,
  // eslint-disable-next-line no-restricted-globals
} = globalThis;

const {
  defineProperty,
  setPrototypeOf,
} = Object;
const { ownKeys } = Reflect;

const { prototype: arrayBufferPrototype } = ArrayBuffer;

/**
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
let optArrayBufferTransfer;

// @ts-ignore
if (arrayBufferPrototype?.transfer) {
  optArrayBufferTransfer = arrayBuffer => arrayBuffer.transfer();
} else if (optStructuredClone) {
  optArrayBufferTransfer = arrayBuffer => {
    arrayBuffer.slice(0, 0);
    return optStructuredClone(arrayBuffer, {
      transfer: [arrayBuffer],
    });
  };
} else {
  // Assignment is redundant, but remains for clarity.
  optArrayBufferTransfer = undefined;
}

// Omits `constructor` so `ArrayBuffer.prototype.constructor` is inherited.
const ImmutableArrayBufferInternalPrototype =
  /** @type {ThisType<ArrayBuffer>} */ ({
    __proto__: arrayBufferPrototype,
    get detached() {
      return false;
    },
    get maxByteLength() {
      // Not underlying maxByteLength, which is irrelevant
      return this.byteLength;
    },
    get resizable() {
      return false;
    },
    get immutable() {
      return true;
    },
    sliceToImmutable(start = undefined, end = undefined) {
      // eslint-disable-next-line no-use-before-define
      return sliceBufferToImmutable(this, start, end);
    },
    resize(_newByteLength = undefined) {
      throw TypeError('Cannot resize an immutable ArrayBuffer');
    },
    transfer(_newLength = undefined) {
      throw TypeError('Cannot detach an immutable ArrayBuffer');
    },
    transferToFixedLength(_newLength = undefined) {
      throw TypeError('Cannot detach an immutable ArrayBuffer');
    },
    transferToImmutable(_newLength = undefined) {
      throw TypeError('Cannot detach an immutable ArrayBuffer');
    },
  });

// Better fidelity emulation of a class prototype
for (const key of ownKeys(ImmutableArrayBufferInternalPrototype)) {
  defineProperty(ImmutableArrayBufferInternalPrototype, key, {
    enumerable: false,
  });
}

/**
 * Emulates what would have been the encapsulated `ImmutableArrayBufferInternal`
 * class constructor. This function takes the `realBuffer` which its
 * result encapsulates. Security demands that this result has exclusive access
 * to the `realBuffer` it is given, which its callers must ensure.
 *
 * @param {ArrayBuffer} buffer
 * @returns {ArrayBuffer}
 */
const turnArrayBufferImmutable = buffer => {
  setPrototypeOf(buffer, ImmutableArrayBufferInternalPrototype);
  return buffer;
};

/**
 * @param {ArrayBuffer} buffer
 * @returns {boolean}
 */
export const isBufferImmutable = buffer => !!buffer.immutable;

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
  return turnArrayBufferImmutable(buffer.slice(start, end));
};

let transferBufferToImmutable;
if (optArrayBufferTransfer) {
  /**
   * Transfer the contents to a new Immutable ArrayBuffer
   *
   * @param {ArrayBuffer} buffer The original buffer.
   * @param {number} [newLength]
   * @returns {ArrayBuffer}
   */
  transferBufferToImmutable = (buffer, newLength = undefined) => {
    if (newLength === undefined) {
      buffer = optArrayBufferTransfer(buffer);
    } else if (buffer.transfer) {
      buffer = buffer.transfer(newLength);
    } else {
      buffer = optArrayBufferTransfer(buffer);
      const oldLength = buffer.byteLength;
      if (newLength <= oldLength) {
        buffer = buffer.slice(0, newLength);
      } else {
        const oldTA = new Uint8Array(buffer);
        const newTA = new Uint8Array(newLength);
        newTA.set(oldTA);
        buffer = newTA.buffer;
      }
    }
    return turnArrayBufferImmutable(buffer);
  };
} else {
  transferBufferToImmutable = undefined;
}

export const optTransferBufferToImmutable = transferBufferToImmutable;
