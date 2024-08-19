import {
  arrayBufferPrototype,
  arrayBufferSlice,
  globalThis,
  TypeError,
  defineProperty,
} from './commons.js';

export const shimArrayBufferTransfer = () => {
  // @ts-expect-error TODO extend ArrayBuffer type to include transfer, etc.
  if (typeof arrayBufferPrototype.transfer === 'function') {
    // Assume already exists so does not need to be shimmed.
    // Such conditional shimming is ok in this case since ArrayBuffer.p.transfer
    // is already officially part of JS.
    return;
  }
  const clone = globalThis.structuredClone;
  if (typeof clone !== 'function') {
    // Indeed, Node <= 16 has neither.
    throw TypeError(
      `Can only shim missing ArrayBuffer.prototype.transfer on a platform with "structuredClone"`,
    );
  }

  /**
   * @type {ThisType<ArrayBuffer>}
   */
  const methods = {
    /**
     * @param {number} [newLength]
     */
    transfer(newLength = undefined) {
      // Hopefully, a zero-length slice is cheap, but still enforces that
      // `this` is a genuine `ArrayBuffer` exotic object.
      arrayBufferSlice(this, 0, 0);
      const oldLength = this.byteLength;
      if (newLength === undefined || newLength === oldLength) {
        return clone(this, { transfer: [this] });
      }
      if (typeof newLength !== 'number') {
        throw new TypeError(`transfer newLength if provided must be a number`);
      }
      if (newLength > oldLength) {
        // TODO support this case somehow
        throw new TypeError(
          `Cannot yet emulate transfer to larger ArrayBuffer ${newLength}`,
        );
      }
      const tmp = clone(this, { transfer: [this] });
      return arrayBufferSlice(tmp, 0, newLength);
    },
  };

  defineProperty(arrayBufferPrototype, 'transfer', {
    // @ts-expect-error
    value: methods.transfer,
    writable: true,
    enumerable: false,
    configurable: true,
  });
};
