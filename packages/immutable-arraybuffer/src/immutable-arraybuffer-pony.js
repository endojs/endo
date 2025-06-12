/* global globalThis */

const { defineProperty } = Object;
const { apply, ownKeys } = Reflect;
const { prototype: arrayBufferPrototype } = ArrayBuffer;

const {
  slice,
  // TODO used to be a-ts-expect-error, but my local IDE's TS server
  // seems to use a more recent definition of the `ArrayBuffer` type.
  // @ts-ignore At the time of this writing, the `ArrayBuffer` type built
  // into TypeScript does not know about the recent standard `transfer` method.
  // Indeed, the `transfer` method is absent from Node <= 20.
  transfer: transferMaybe,
} = arrayBufferPrototype;
// Capture structuredClone before it could be scuttled.
const { structuredClone: structuredCloneMaybe } = globalThis;

/**
 * Enforces that `realBuffer` is a genuine `ArrayBuffer` exotic object.
 *
 * @param {ArrayBuffer} realBuffer
 * @param {number} [start]
 * @param {number} [end]
 * @returns {ArrayBuffer}
 */
const arrayBufferSlice = (realBuffer, start = undefined, end = undefined) =>
  apply(slice, realBuffer, [start, end]);

/**
 * Enforces that `arrayBuffer` is a genuine `ArrayBuffer` exotic object.
 * Return a new fresh `ArrayBuffer` exotic object, where the contents of the
 * original `arrayBuffer` has been moved into the new one, and the original
 * `arrayBuffer` has been detached. We can only do this emulation on platforms
 * that support `structureClose` or `ArrayBuffer.prototype.transfer`.
 * On other platforms, we can still emulate `sliceToImmutable` but not
 * `arrayBufferTransferMaybe`, and therefore not
 * `ArrayBuffer.prototype.transferToImmutable`. Currently, these other platforms
 * are
 * - Hermes
 * - Node <= 16
 * - Apparently some versions of JSC that are still of concern.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {ArrayBuffer}
 */
let arrayBufferTransferMaybe;

if (transferMaybe) {
  arrayBufferTransferMaybe = arrayBuffer =>
    apply(transferMaybe, arrayBuffer, []);
} else if (structuredCloneMaybe) {
  arrayBufferTransferMaybe = arrayBuffer => {
    // Hopefully, a zero-length slice is cheap, but still enforces that
    // `arrayBuffer` is a genuine `ArrayBuffer` exotic object.
    arrayBufferSlice(arrayBuffer, 0, 0);
    return structuredCloneMaybe(arrayBuffer, {
      transfer: [arrayBuffer],
    });
  };
} else {
  // Assignment is redundant, but remains for clarity.
  arrayBufferTransferMaybe = undefined;
}

/**
 * If we could use classes with private fields everywhere, this would have
 * been a `this.#buffer` private field on an `ImmutableArrayBufferInternal`
 * class. But we cannot do so on Hermes. So, instead, we
 * emulate the `this.#buffer` private field, including its use as a brand check.
 * Maps from all and only emulated Immutable ArrayBuffers to real ArrayBuffers.
 */
const buffers = new WeakMap();
const getBuffer = immuAB => {
  const result = buffers.get(immuAB);
  if (result) {
    return result;
  }
  throw TypeError('Not an emulated Immutable ArrayBuffer');
};

// Omits `constructor` so `Array.prototype.constructor` is inherited.
const ImmutableArrayBufferInternalPrototype = {
  __proto__: arrayBufferPrototype,
  get byteLength() {
    return getBuffer(this).byteLength;
  },
  get detached() {
    getBuffer(this); // shim brand check
    return false;
  },
  get maxByteLength() {
    // Not underlying maxByteLength, which is irrelevant
    return getBuffer(this).byteLength;
  },
  get resizable() {
    getBuffer(this); // shim brand check
    return false;
  },
  get immutable() {
    getBuffer(this); // shim brand check
    return true;
  },
  slice(start = undefined, end = undefined) {
    return arrayBufferSlice(getBuffer(this), start, end);
  },
  sliceToImmutable(start = undefined, end = undefined) {
    // eslint-disable-next-line no-use-before-define
    return sliceBufferToImmutable(getBuffer(this), start, end);
  },
  resize(_newByteLength = undefined) {
    getBuffer(this); // shim brand check
    throw TypeError('Cannot resize an immutable ArrayBuffer');
  },
  transfer(_newLength = undefined) {
    getBuffer(this); // shim brand check
    throw TypeError('Cannot detach an immutable ArrayBuffer');
  },
  transferToFixedLength(_newLength = undefined) {
    getBuffer(this); // shim brand check
    throw TypeError('Cannot detach an immutable ArrayBuffer');
  },
  transferToImmutable(_newLength = undefined) {
    getBuffer(this); // shim brand check
    throw TypeError('Cannot detach an immutable ArrayBuffer');
  },
  /**
   * See https://github.com/endojs/endo/tree/master/packages/immutable-arraybuffer#purposeful-violation
   */
  [Symbol.toStringTag]: 'ImmutableArrayBuffer',
};

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
 * @param {ArrayBuffer} realBuffer
 * @returns {ArrayBuffer}
 */
const makeImmutableArrayBufferInternal = realBuffer => {
  const result = { __proto__: ImmutableArrayBufferInternalPrototype };
  buffers.set(result, realBuffer);
  return /** @type {ArrayBuffer} */ (/** @type {unknown} */ (result));
};
// Since `makeImmutableArrayBufferInternal` MUST not escape,
// this `freeze` is just belt-and-suspenders.
Object.freeze(makeImmutableArrayBufferInternal);

export const isBufferImmutable = buffer => buffers.has(buffer);

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
  let realBuffer = buffers.get(buffer);
  if (realBuffer === undefined) {
    realBuffer = buffer;
  }
  return makeImmutableArrayBufferInternal(
    arrayBufferSlice(realBuffer, start, end),
  );
};

let transferBufferToImmutable;
if (arrayBufferTransferMaybe) {
  /**
   * Transfer the contents to a new Immutable ArrayBuffer
   *
   * @param {ArrayBuffer} buffer The original buffer.
   * @param {number} [newLength] The start index.
   * @returns {ArrayBuffer}
   */
  transferBufferToImmutable = (buffer, newLength = undefined) => {
    if (newLength === undefined) {
      buffer = arrayBufferTransferMaybe(buffer);
    } else if (transferMaybe) {
      buffer = apply(transferMaybe, buffer, [newLength]);
    } else {
      buffer = arrayBufferTransferMaybe(buffer);
      const oldLength = buffer.byteLength;
      // eslint-disable-next-line @endo/restrict-comparison-operands
      if (newLength <= oldLength) {
        buffer = arrayBufferSlice(buffer, 0, newLength);
      } else {
        const oldTA = new Uint8Array(buffer);
        const newTA = new Uint8Array(newLength);
        newTA.set(oldTA);
        buffer = newTA.buffer;
      }
    }
    const result = makeImmutableArrayBufferInternal(buffer);
    return /** @type {ArrayBuffer} */ (/** @type {unknown} */ (result));
  };
} else {
  transferBufferToImmutable = undefined;
}

export const transferBufferToImmutableMaybe = transferBufferToImmutable;
