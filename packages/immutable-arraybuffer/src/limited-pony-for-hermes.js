const { apply } = Reflect;
const { prototype: arrayBufferPrototype } = ArrayBuffer;

const { slice } = arrayBufferPrototype;

// Based on the real `../index.js` but lives within the restrictions of
// current Hermes:
// - No class syntax, therefore also no private fields
// - No `ArrayBuffer.prototype.transfer`
// - No `structuredClone`
//
// Within these restrictions we cannot emulate `transferToImmutable`, so
// we omit it from the pony. We can emulate `sliceToImmutable` using
// a different technique than used by the original. The omission of
// `transferToImmutable` will be visible, enabling feature detection.
// We perfectly emulate the `class` with a `function` function.
// We perfectly emulate the private `this.#buffer` private field with
// the encapsulated `buffers` WeakMap.

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
 * Emulates the `this.#buffer` private field, including its use as a brand check.
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
};

/**
 * Emulates the encapsulated `ImmutableArrayBufferInternal` class constructor
 * from the original except this function takes the `realBuffer` which its
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
