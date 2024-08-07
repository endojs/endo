/* global globalThis */

const { setPrototypeOf, getOwnPropertyDescriptor } = Object;
const { apply } = Reflect;
const { prototype: arrayBufferPrototype } = ArrayBuffer;

const {
  slice,
  // @ts-expect-error At the time of this writing, the `ArrayBuffer` type built
  // into TypeScript does not know about the recent standard `transfer` method.
  // Indeed, the `transfer` method is absent from Node <= 20.
  transfer,
} = arrayBufferPrototype;

/**
 * Enforces that `arrayBuffer` is a genuine `ArrayBuffer` exotic object.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @param {number} [start]
 * @param {number} [end]
 * @returns {ArrayBuffer}
 */
const arrayBufferSlice = (arrayBuffer, start = undefined, end = undefined) =>
  apply(slice, arrayBuffer, [start, end]);

/**
 * Enforces that `arrayBuffer` is a genuine `ArrayBuffer` exotic object.
 * Return a new fresh `ArrayBuffer` exotic object, where the contents of the
 * original `arrayBuffer` has been moved into the new one, and the original
 * `arrayBuffer` has been detached.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {ArrayBuffer}
 */
let arrayBufferClone;

if (transfer) {
  arrayBufferClone = arrayBuffer => apply(transfer, arrayBuffer, []);
} else if (globalThis.structuredClone) {
  arrayBufferClone = arrayBuffer => {
    // Hopefully, a zero-length slice is cheap, but still enforces that
    // `arrayBuffer` is a genuine `ArrayBuffer` exotic object.
    arrayBufferSlice(arrayBuffer, 0, 0);
    return globalThis.structuredClone(arrayBuffer, { transfer: [arrayBuffer] });
  };
} else {
  // Indeed, Node <= 16 has neither.
  throw TypeError(
    `Can only emulate immutable ArrayBuffer on a platform with either "structuredClone" or "ArrayBuffer.prototype.transfer"`,
  );
}

/**
 * This class only exists as an artifact or this ponyfill and shim,
 * as a convience for imperfectly emulating the
 * *Immutable ArrayBuffer* proposal, which would not have this class.
 * In the proposal,
 * `transferToImmutable` makes a new `ArrayBuffer` that inherits directly from
 * `ArrayBuffer.prototype` as you'd expect. In the ponyfill and shim,
 * `transferToImmutable` makes a normal object that inherits directly from
 * `immutableArrayBufferPrototype`, which has been surgically
 * altered to inherit directly from `ArrayBuffer.prototype`. The constructor is
 * captured for use internal to this module, and is made otherwise inaccessible.
 * Therefore, `immutableArrayBufferPrototype` and all its methods
 * and accessor functions effectively become hidden intrinsics.
 * They are not encapsulated. Rather, they are trivially discoverable if you
 * know how, but are not discoverable merely by enumerating naming paths.
 */
class ImmutableArrayBufferInternal {
  /** @type {ArrayBuffer} */
  #buffer;

  constructor(buffer) {
    // This constructor is deleted from the prototype below.
    this.#buffer = arrayBufferClone(buffer);
  }

  get byteLength() {
    return this.#buffer.byteLength;
  }

  get detached() {
    this.#buffer; // shim brand check
    return false;
  }

  get maxByteLength() {
    // Not underlying maxByteLength, which is irrelevant
    return this.#buffer.byteLength;
  }

  get resizable() {
    this.#buffer; // shim brand check
    return false;
  }

  get immutable() {
    this.#buffer; // shim brand check
    return true;
  }

  slice(begin = 0, end = undefined) {
    return arrayBufferSlice(this.#buffer, begin, end);
  }

  resize(_newByteLength = undefined) {
    this.#buffer; // shim brand check
    throw TypeError('Cannot resize an immutable ArrayBuffer');
  }

  transfer(_newLength = undefined) {
    this.#buffer; // shim brand check
    throw TypeError('Cannot detach an immutable ArrayBuffer');
  }

  transferToFixedLength(_newLength = undefined) {
    this.#buffer; // shim brand check
    throw TypeError('Cannot detach an immutable ArrayBuffer');
  }

  transferToImmutable(_newLength = undefined) {
    this.#buffer; // shim brand check
    throw TypeError('Cannot detach an immutable ArrayBuffer');
  }
}

const immutableArrayBufferPrototype = ImmutableArrayBufferInternal.prototype;
// @ts-expect-error can only delete optionals
delete immutableArrayBufferPrototype.constructor;

const {
  // @ts-expect-error We know it is there.
  get: isImmutableGetter,
} = getOwnPropertyDescriptor(immutableArrayBufferPrototype, 'immutable');

setPrototypeOf(immutableArrayBufferPrototype, arrayBufferPrototype);

export const transferBufferToImmutable = buffer =>
  new ImmutableArrayBufferInternal(buffer);

export const isBufferImmutable = buffer => {
  try {
    return apply(isImmutableGetter, buffer, []);
  } catch (err) {
    if (err instanceof TypeError) {
      // TODO: Should this test if `buffer` is a genuine `ArrayBuffer` exotic
      // object, and throw if not?
      return false;
    }
    throw err;
  }
};
