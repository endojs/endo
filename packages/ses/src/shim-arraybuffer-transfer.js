import {
  ArrayBuffer,
  arrayBufferPrototype,
  arrayBufferSlice,
  arrayBufferGetByteLength,
  Uint8Array,
  typedArraySet,
  globalThis,
  TypeError,
  defineProperty,
} from './commons.js';

export const shimArrayBufferTransfer = () => {
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
    // On a platform with neither `Array.prototype.transfer`
    // nor `structuredClone`, this shim does nothing.
    // For example, Node <= 16 has neither.
    //
    // Empty object because this shim has nothing for `addIntrinsics` to add.
    return {};
    // TODO Rather than doing nothing, should the endo ses-shim throw
    // in this case?
    // throw TypeError(
    //   `Can only shim missing ArrayBuffer.prototype.transfer on a platform with "structuredClone"`,
    // );
    // For example, endo no longer supports Node <= 16. All browsers have
    // `structuredClone`. XS has `Array.prototype.transfer`. Are there still
    // any platforms without both that Endo should still support?
    // What about Hermes?
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
        throw TypeError(`transfer newLength if provided must be a number`);
      }
      if (newLength > oldLength) {
        const result = new ArrayBuffer(newLength);
        const taOld = new Uint8Array(this);
        const taNew = new Uint8Array(result);
        typedArraySet(taNew, taOld);
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
