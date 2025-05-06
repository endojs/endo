/* global globalThis */

const { setPrototypeOf, getOwnPropertyDescriptors } = Object;
const { apply } = Reflect;
const { prototype: arrayBufferPrototype } = ArrayBuffer;

const {
  slice,
  // TODO used to be a-ts-expect-error, but my local IDE's TS server
  // seems to use a more recent definition of the `ArrayBuffer` type.
  // @ts-ignore At the time of this writing, the `ArrayBuffer` type built
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
let arrayBufferTransfer;

if (transfer) {
  arrayBufferTransfer = arrayBuffer => apply(transfer, arrayBuffer, []);
} else if (globalThis.structuredClone) {
  arrayBufferTransfer = arrayBuffer => {
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
 * This class only exists as an artifact of this ponyfill and shim,
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
    this.#buffer = arrayBufferTransfer(buffer);
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

  slice(start = undefined, end = undefined) {
    return arrayBufferSlice(this.#buffer, start, end);
  }

  sliceToImmutable(start = undefined, end = undefined) {
    // eslint-disable-next-line no-use-before-define
    return sliceBufferToImmutable(this.#buffer, start, end);
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
  slice: { value: sliceOfImmutable },
  immutable: { get: isImmutableGetter },
} = getOwnPropertyDescriptors(immutableArrayBufferPrototype);

setPrototypeOf(immutableArrayBufferPrototype, arrayBufferPrototype);

export const transferBufferToImmutable = (buffer, newLength = undefined) => {
  if (newLength !== undefined) {
    if (transfer) {
      buffer = apply(transfer, buffer, [newLength]);
    } else {
      buffer = arrayBufferTransfer(buffer);
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
  }
  return new ImmutableArrayBufferInternal(buffer);
};

export const isBufferImmutable = buffer => {
  try {
    // @ts-expect-error Getter should be typed as this-sensitive
    return apply(isImmutableGetter, buffer, []);
  } catch (err) {
    if (err instanceof TypeError) {
      // Enforce that `buffer` is a genuine ArrayBuffer before returning.
      arrayBufferSlice(buffer, 0, 0);
      return false;
    }
    throw err;
  }
};

const sliceBuffer = (buffer, start = undefined, end = undefined) => {
  try {
    // @ts-expect-error We know it is really there
    return apply(sliceOfImmutable, buffer, [start, end]);
  } catch (err) {
    if (err instanceof TypeError) {
      return arrayBufferSlice(buffer, start, end);
    }
    throw err;
  }
};

export const sliceBufferToImmutable = (
  buffer,
  start = undefined,
  end = undefined,
) => transferBufferToImmutable(sliceBuffer(buffer, start, end));
