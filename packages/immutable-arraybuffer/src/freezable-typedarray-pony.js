/* global globalThis */

import { makeInternalHeir } from './internal-heir.js';
import {
  hiddenBuffers,
  reverseHiddenBuffers,
  FERAL_GET_ARRAY_BUFFER,
} from './immutable-arraybuffer-pony-internal.js';

/**
 * Stangely, TypeScript only provides types for the concrete subtypes of
 * `TypedArray`, but not `TypeArray` itself.
 * As suggested at
 * https://github.com/microsoft/TypeScript/issues/15402#issuecomment-297544403
 * with the addition of `Float16Array` which happened recently.
 *
 * @typedef {
 *  | Int8Array
 *  | Uint8Array
 *  | Uint8ClampedArray
 *  | Int16Array
 *  | Uint16Array
 *  | Float16Array
 *  | Int32Array
 *  | Uint32Array
 *  | Float32Array
 *  | Float64Array
 *  | BigInt64Array
 *  | BigUint64Array
 * } TypedArray
 */

const {
  Object,
  Reflect,
  WeakMap,
  TypeError,
  Uint8Array,
  Proxy,
  Symbol,
  // eslint-disable-next-line no-restricted-globals
} = globalThis;

const {
  getOwnPropertyDescriptor,
  getOwnPropertyDescriptors,
  defineProperties,
  getPrototypeOf,
  setPrototypeOf,
} = Object;
const { apply, construct } = Reflect;
const { get: weakMapGet, has: weakMapHas } = WeakMap.prototype;
const TypedArray = getPrototypeOf(Uint8Array);
const { prototype: typedArrayPrototype } = TypedArray;
const { iterator: symbolIterator, toStringTag: symbolToStringTag } = Symbol;

/**
 * Could be used by the shim as the getter for a replacement of
 * `TypedArray.prototype.buffer`.
 */
export const virtualTypedArrayBufferGetter = (() => {
  /** @type {ThisType<TypedArray>} */
  const obj = {
    get buffer() {
      if (apply(weakMapHas, reverseHiddenBuffers, [this])) {
        return apply(weakMapGet, reverseHiddenBuffers, [this]);
      } else {
        return apply(FERAL_GET_ARRAY_BUFFER, this, []);
      }
    },
  };
  const { get: pseudoGetter } = /** @type {PropertyDescriptor} */ (
    getOwnPropertyDescriptor(obj, 'buffer')
  );
  return pseudoGetter;
})();

const freezableTypedArrayInternalPrototype = makeInternalHeir(
  typedArrayPrototype,
  'a freezable TypedArray',
  vfta => vfta, // TODO fix
  [
    // queries
    'at',
    'buffer',
    'byteLength',
    'byteOffset',
    'entries',
    'every',
    'filter',
    'find',
    'findIndex',
    'findLast',
    'findLastIndex',
    'forEach',
    'includes',
    'indexOf',
    'join',
    'keys',
    'lastIndexOf',
    'length',
    'map',
    'reduce',
    'reduceRight',
    'some',
    'toLocaleString',
    'toReversed',
    'toSorted',
    'toString',
    symbolIterator,
  ],
  [
    // mutators
    'copyWithin',
    'fill',
    'reverse',
    'set',
    'sort',
  ],
  /** @type {ThisType<TypedArray>} */ ({
    slice: undefined,
    subarray: undefined,
    with: undefined,
    [symbolToStringTag]: 'FreezableTypedArray',
  }),
);

/**
 * Could be used by the shim to replace all the concrete TypedArray constructors
 * with constructors that also accept an emulated immutable ArrayBuffer
 * argument.
 *
 * @param {any} OriginalConstructor
 */
export const makePseudoTypedArrayConstructor = OriginalConstructor => {
  /**
   * @param {any[]} args
   */
  function PseudoTypedArray(...args) {
    if (new.target === undefined) {
      throw new TypeError(
        `Constructor ${OriginalConstructor.name} requires 'new'`,
      );
    }
    const firstArg = args[0];
    if (apply(weakMapHas, hiddenBuffers, [firstArg])) {
      if (args.length !== 1) {
        throw new TypeError(`only one ArrayBuffer argument expected`);
      }
      if (new.target !== PseudoTypedArray) {
        throw new TypeError(
          'emulated freezable TypedArray does not (yet?) support subclassing.',
        );
      }
      const hiddenBuffer = apply(weakMapGet, hiddenBuffers, [firstArg]);
      const hiddenTypedArray = construct(
        OriginalConstructor,
        [hiddenBuffer],
        PseudoTypedArray,
      );
      const proxy = new Proxy(hiddenTypedArray, {
        // TODO trap and error on all attempts to mutate an indexed property.
        // Non-indexed properties as well as queries should pass through to
        // the target.
      });
      return proxy;
    } else {
      return construct(OriginalConstructor, args, new.target);
    }
  }
  defineProperties(
    PseudoTypedArray,
    getOwnPropertyDescriptors(OriginalConstructor),
  );
  setPrototypeOf(PseudoTypedArray, TypedArray);
};
