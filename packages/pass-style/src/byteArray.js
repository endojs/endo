/// <reference types="ses"/>

import { PASS_STYLE, assertChecker } from './passStyle-helpers.js';

/** @typedef {import('./types.js').ByteArray} ByteArray */

const { Fail } = assert;
const { setPrototypeOf } = Object;
const { apply } = Reflect;

/**
 * @type {WeakSet<ByteArray>}
 */
const genuineByteArray = new WeakSet();

const slice = ArrayBuffer.prototype.slice;
const sliceOf = (buffer, start, end) => apply(slice, buffer, [start, end]);

/**
 * A ByteArray is much like an ArrayBuffer, but immutable.
 * It cannot be used as an ArrayBuffer argument when a genuine ArrayBuffer is
 * needed. But a `byteArray.slice()` is a genuine ArrayBuffer, initially with
 * a copy of the copyByte's data.
 *
 * On platforms that support freezing ArrayBuffer, like perhaps a future XS,
 * (TODO) the intention is that `byteArray` could hold on to a single frozen
 * one and return it for every call to `arrayBuffer.slice`, rather than making
 * a fresh copy each time.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {ByteArray}
 */
export const makeByteArray = arrayBuffer => {
  try {
    // Both validates and gets an exclusive copy.
    // This `arrayBuffer` must not escape, to emulate immutability.
    arrayBuffer = sliceOf(arrayBuffer);
  } catch {
    Fail`Expected genuine ArrayBuffer" ${arrayBuffer}`;
  }
  /** @type {ByteArray} */
  const byteArray = {
    // Can't say it this way because it confuses TypeScript
    // __proto__: ArrayBuffer.prototype,
    byteLength: arrayBuffer.byteLength,
    slice(start, end) {
      return sliceOf(arrayBuffer, start, end);
    },
    [PASS_STYLE]: 'byteArray',
    [Symbol.toStringTag]: 'ByteArray',
  };
  setPrototypeOf(byteArray, ArrayBuffer.prototype);
  harden(byteArray);
  genuineByteArray.add(byteArray);
  return byteArray;
};
harden(makeByteArray);

/**
 * TODO: This technique for recognizing genuine ByteArray is incompatible
 * with our normal assumption of uncontrolled multiple instantiation of
 * a single module. However, our only alternative to this technique is
 * unprivileged re-validation of open data, which is incompat with our
 * need to encapsulate `arrayBuffer`, the genuinely mutable ArrayBuffer.
 *
 * @param {unknown} candidate
 * @param {import('./types.js').Checker} [check]
 * @returns {boolean}
 */
const canBeValid = (candidate, check = undefined) =>
  // @ts-expect-error `has` argument can actually be anything.
  genuineByteArray.has(candidate);

/**
 * @type {import('./internal-types.js').PassStyleHelper}
 */
export const ByteArrayHelper = harden({
  styleName: 'byteArray',

  canBeValid,

  assertValid: (candidate, _passStyleOfRecur) => {
    canBeValid(candidate, assertChecker);
  },
});
