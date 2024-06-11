import {
  setPrototypeOf,
  defineProperties,
  arrayBufferSlice,
  arrayBufferTransferToFixedLength,
  arrayBufferPrototype,
  getOwnPropertyDescriptors,
  TypeError,
} from './commons.js';

if ('transferToImmutable' in arrayBufferPrototype) {
  // If `transferToImmutable` already exists, it may be because the platform
  // has implemented the proposal this shim emulates.
  // See https://github.com/endojs/endo/pull/2311#discussion_r1632607527
  // Conditional shims for non stage 4 features have been seen as problematic by
  // the community as there is a risk that the program would start relying on a
  // shim behavior that does not match what the final spec says, resulting in
  // breakage when the engine starts implementing the feature.
  // eslint-disable-next-line @endo/no-polymorphic-call
  console.warn('Overriding existing transferToImmutable with shim');
}

/**
 * This class only exists within the shim, as a convience for imperfectly
 * emulating the proposal, which would not have this class. In the proposal,
 * `transferToImmutable` makes a new `ArrayBuffer` that inherits from
 * `ArrayBuffer.prototype` as you'd expect. In the shim, `transferToImmutable`
 * makes a normal object that inherits from
 * `ImmutableArrayBufferInternal.prototype`, which has been surgically
 * altered to inherit from `ArrayBuffer.prototype`. The constructor is
 * captured for use internal to this module, and is made otherwise inaccessible.
 * Therefore, `ImmutableArrayBufferInternal.prototype` and all its methods
 * and accessor functions effectively become hidden intrinsics.
 *
 * TODO handle them as hidden intrinsics, so they get hardened when they should.
 */
class ImmutableArrayBufferInternal {
  /** @type {ArrayBuffer} */
  #buffer;

  constructor(buffer) {
    // This also enforces that `buffer` is a genuine `ArrayBuffer`.
    // This constructor is deleted from the prototype below.
    this.#buffer = arrayBufferSlice(buffer, 0);
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

const ImmutableArrayBufferInternalPrototype =
  ImmutableArrayBufferInternal.prototype;
// @ts-expect-error can only delete optionals
delete ImmutableArrayBufferInternalPrototype.constructor;

setPrototypeOf(ImmutableArrayBufferInternalPrototype, arrayBufferPrototype);

defineProperties(
  arrayBufferPrototype,
  getOwnPropertyDescriptors({
    get immutable() {
      return false;
    },
    transferToImmutable(newLength = undefined) {
      return new ImmutableArrayBufferInternal(
        arrayBufferTransferToFixedLength(this, newLength),
      );
    },
  }),
);
