/* global globalThis */

import {
  hiddenBuffers,
  reverseHiddenBuffers,
} from './immutable-arraybuffer-pony-internal.js';

const {
  Object,
  Reflect,
  WeakMap,
  TypeError,
  Uint8Array,
  // eslint-disable-next-line no-restricted-globals
} = globalThis;

const {
  getOwnPropertyDescriptor,
  getOwnPropertyDescriptors,
  defineProperties,
  getPrototypeOf,
  setPrototypeOf,
} = Object;
const { apply } = Reflect;
const { get: weakMapGet, has: weakMapHas } = WeakMap.prototype;
const TypedArray = getPrototypeOf(Uint8Array);
const { get: originalTypedArrayBufferGetter } =
  /** @type {PropertyDescriptor} */ (
    getOwnPropertyDescriptor(TypedArray, 'buffer')
  );

export const pseudoTypedArrayBufferGetter = (() => {
  /** @type {ThisType<ArrayBuffer>} */
  const obj = {
    get buffer() {
      if (apply(weakMapHas, reverseHiddenBuffers, [this])) {
        return apply(weakMapGet, reverseHiddenBuffers, [this]);
      } else {
        // @ts-ignore suspect TS confusion but don't know.
        return apply(originalTypedArrayBufferGetter, this, []);
      }
    },
  };
  const { get: pseudoGetter } = /** @type {PropertyDescriptor} */ (
    getOwnPropertyDescriptor(obj, 'buffer')
  );
  return pseudoGetter;
})();

/**
 * @param {any} RealConstructor
 */
export const makePseudoTypedArrayConstructor = RealConstructor => {
  /**
   * @param {any[]} args
   */
  function PseudoTypedArray(...args) {
    if (new.target === undefined) {
      throw new TypeError(`Constructor ${RealConstructor.name} requires 'new'`);
    }
    if (apply(weakMapHas, hiddenBuffers, [args[0]])) {
    } else {
      return new RealConstructor(...args);
    }
  }
  defineProperties(
    PseudoTypedArray,
    getOwnPropertyDescriptors(RealConstructor),
  );
  setPrototypeOf(PseudoTypedArray, TypedArray);
};
