import {
  ArrayBuffer,
  arrayBufferPrototype,
  arrayBufferSlice,
  arrayBufferGetByteLength,
  Uint8Array,
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
    //
    // Empty object because this shim has nothing for `addIntrinsics` to add.
    return {};
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
      // Using this builtin getter also ensures that `this` is a genuine
      // ArrayBuffer.
      const oldLength = arrayBufferGetByteLength(this);
      if (newLength === undefined || newLength === oldLength) {
        return clone(this, { transfer: [this] });
      }
      if (typeof newLength !== 'number') {
        throw new TypeError(`transfer newLength if provided must be a number`);
      }
      if (newLength > oldLength) {
        // TODO Is there any way to do this bulk move or copy other than by
        // manually iterating over each position?
        const result = new ArrayBuffer(newLength);
        // TODO Should this use DavaViews rather than TypedArrays?
        const taOld = new Uint8Array(this);
        const taNew = new Uint8Array(result);
        let i = 0;
        for (; i < oldLength; i += 1) {
          taNew[i] = taOld[i];
        }
        for (; i < newLength; i += 1) {
          taNew[i] = 0;
        }
        // Using clone only to detach, and only after the copy succeeds
        clone(this, { transfer: [this] });
        return result;
      } else {
        const result = arrayBufferSlice(this, 0, newLength);
        // Using clone only to detach, and only after the slice succeeds
        clone(this, { transfer: [this] });
        return result;
      }
    },
  };

  defineProperty(arrayBufferPrototype, 'transfer', {
    // @ts-expect-error
    value: methods.transfer,
    writable: true,
    enumerable: false,
    configurable: true,
  });

  // Empty object because this shim has nothing for `addIntrinsics` to add.
  return {};
};
