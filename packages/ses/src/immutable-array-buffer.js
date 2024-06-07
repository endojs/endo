/* eslint-disable class-methods-use-this */
import {
  defineProperties,
  arrayBufferSlice,
  toStringTagSymbol,
  isView,
  speciesSymbol,
} from './commons.js';

/**
 * `ImmutableArrayBuffer` is intended to be a peer of `ArrayBuffer` and
 * `SharedArrayBuffer`, but only with the non-mutating methods they have in
 * common. We're adding this to ses as if it was already part of the
 * language, and we consider this implementation to be a shim for an
 * upcoming tc39 proposal.
 *
 * As a proposal it would take additional steps that would the shim does not:
 * - to have `ImmutableArrayBuffer` be shared between
 *   threads (in spec speak, "agent") in exactly the same way
 *   `SharedArrayBuffer` is shared between agents. Unlike `SharedArrayBuffer`,
 *   sharing an `ImmutableArrayBuffer` does not introduce any observable
 *   concurrency. Unlike `ArrayBuffer`, sharing an `ImmutableArrayBuffer`
 *   does not detach anything.
 * - when used as a backing store of a `TypedArray` or `DataView`, all the query
 *   methods would work, but the mutating methods would throw. In this sense,
 *   the wrapping `TypedArray` or `DataView` would also be immutable.
 *
 * Technically, this file is a ponyfill because it does not install this class
 * on `globalThis` or have any other effects on primordial state. It only
 * defines and exports a new class.
 * `immutable-array-buffer-shim.js` is the corresponding shim which
 * installs `ImmutableArrayBuffer` on `globalThis`. It is imported by
 * `lockdown`, so that `ImmutableArrayBuffer` can act as-if defined as
 * part of the language.
 *
 * Note that the class isn't immutable until hardened by lockdown.
 * Even then, the instances are not immutable until hardened.
 * This class does not harden its instances itself to preserve similarity
 * with `ArrayBuffer` and `SharedArrayBuffer`.
 */
export class ImmutableArrayBuffer {
  /** @type {ArrayBuffer} */
  #buffer;

  /**
   * @param {unknown} arg
   * @returns {arg is DataView}
   */
  static isView(arg) {
    // TODO should this just share/alias`isView` instead?
    return isView(arg);
  }

  // TODO how to type this?
  static get [speciesSymbol]() {
    return ImmutableArrayBuffer;
  }

  /** @param {ArrayBuffer} buffer */
  constructor(buffer) {
    // This also enforces that `buffer` is a genuine `ArrayBuffer`
    this.#buffer = arrayBufferSlice(buffer, 0);
  }

  /** @type {number} */
  get byteLength() {
    return this.#buffer.byteLength;
  }

  /** @type {boolean} */
  get detached() {
    return false;
  }

  /** @type {number} */
  get maxByteLength() {
    // Not underlying maxByteLength, which is irrelevant
    return this.#buffer.byteLength;
  }

  /** @type {boolean} */
  get resizable() {
    return false;
  }

  /**
   * @param {number} begin
   * @param {number} [end]
   * @returns {ArrayBuffer}
   *   Returns a genuine ArrayBuffer, not a SharedArrayBuffer
   */
  slice(begin, end = undefined) {
    return arrayBufferSlice(this.#buffer, begin, end);
  }

  /** @type {string} */
  get [toStringTagSymbol]() {
    // Is remade into a data property by mutating the class prototype below.
    return 'ImmutableArrayBuffer';
  }
}

defineProperties(ImmutableArrayBuffer.prototype, {
  [toStringTagSymbol]: { value: 'ImmutableArrayBuffer' },
});
