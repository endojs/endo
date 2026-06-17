/* global globalThis */

import { makeInternalHeir } from './internal-heir.js';
import {
  hiddenBuffers,
  reverseHiddenBuffers,
  FERAL_GET_ARRAY_BUFFER,
} from './immutable-arraybuffer-pony-internal.js';

/**
 * @import {TypedArray} from './immutable-arraybuffer-pony-internal.js';
 */

const {
  Object,
  Reflect,
  WeakMap,
  TypeError,
  Uint8Array,
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
const { get: weakMapGet, set: weakMapSet } = WeakMap.prototype;
const TypedArray = getPrototypeOf(Uint8Array);
const { prototype: typedArrayPrototype } = TypedArray;
const { iterator: symbolIterator, toStringTag: symbolToStringTag } = Symbol;

/**
 * If we could use classes with private fields everywhere, this would have
 * been a `this.#typedArray` private field on an `FreezableTypedArrayInternal`
 * class. But we currently cannot do so on Hermes. So, instead, we
 * emulate the `this.#typedArray` private field, including its use as a
 * brand check.
 * Maps from all and only emulated Freezable TypedArrays to genuine
 * TypedArrays.
 *
 * NOTE: this is for use within this module, and must not be accessible from
 * outside this package.
 *
 * @type {Pick<WeakMap<TypedArray, TypedArray>, 'get' | 'has' | 'set'>}
 */
const hiddenTypedArrays = new WeakMap();

/**
 * Gets the genuine TypedArray encapsulated behind the emulated
 * freezable TypedArray. Also a brand check: If `freezableTA` is not an
 * emulated freezable TypedArray, it throws.
 *
 * @param {TypedArray} freezableTA
 */
const getHiddenTypedArray = freezableTA => {
  const result = apply(weakMapGet, hiddenTypedArrays, [freezableTA]);
  if (result) {
    return result;
  }
  throw new TypedArray(`Not an emulated freezable TypedArray`);
};

/**
 * Used by the shim as the getter for a replacement of
 * `TypedArray.prototype.buffer`, so that this accessor does not leak
 * a hidden genuine ArrayBuffers even if a hidden genuine TypedArray leaks.
 *
 * As a brand check, it should pass if `this` is either a genuine TypedArray
 * or if it is one of our emulated freezable TypedArrays. Thus we
 * cannot use `getHiddenTypedArray` internally, since that brand check
 * only passes the emulated one.
 */
export const virtualTypedArrayBufferGetter = (() => {
  /** @type {ThisType<TypedArray>} */
  const obj = {
    get buffer() {
      const genuineTA = apply(weakMapGet, hiddenTypedArrays, [this]) || this;
      const genuineBuffer = apply(FERAL_GET_ARRAY_BUFFER, genuineTA, []);
      return (
        apply(weakMapGet, reverseHiddenBuffers, [genuineBuffer]) ||
        genuineBuffer
      );
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
  getHiddenTypedArray,
  [
    // redirected queries
    'at',
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
    // complaining mutators
    'copyWithin',
    'fill',
    'reverse',
    'set',
    'sort',
  ],
  /** @type {ThisType<TypedArray>} */ ({
    buffer: undefined, // The big TODO
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
  const PseudoTypedArrayPrototype = {
    __proto__: freezableTypedArrayInternalPrototype,
    // eslint-disable-next-line no-use-before-define
    constructor: PseudoTypedArray,
    BYTES_PER_ELEMENT: OriginalConstructor.BYTES_PER_ELEMENT,
  };

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
    const hiddenBuffer = apply(weakMapGet, hiddenBuffers, [firstArg]);
    if (!hiddenBuffer) {
      return construct(OriginalConstructor, args, new.target);
    }
    if (args.length !== 1) {
      throw new TypeError(`only one ArrayBuffer argument expected`);
    }
    if (new.target !== PseudoTypedArray) {
      throw new TypeError(
        'emulated freezable TypedArray does not (yet?) support subclassing.',
      );
    }
    const hiddenTypedArray = construct(
      OriginalConstructor,
      [hiddenBuffer],
      PseudoTypedArray,
    );

    const freezableTypedArray = {
      __proto__: PseudoTypedArrayPrototype,
    };
    // @ts-expect-error freezableTypedArray implements TypedArray
    weakMapSet(hiddenTypedArrays, freezableTypedArray, [hiddenTypedArray]);
    return freezableTypedArray;
  }

  const constructorDescs = getOwnPropertyDescriptors(OriginalConstructor);
  constructorDescs.prototype.value = PseudoTypedArrayPrototype;

  defineProperties(PseudoTypedArray, constructorDescs);
  setPrototypeOf(PseudoTypedArray, TypedArray);
};
