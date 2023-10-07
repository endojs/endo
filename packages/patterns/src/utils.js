// @ts-check
import { E } from '@endo/eventual-send';
import { isPromise } from '@endo/promise-kit';

/** @typedef {import('@endo/marshal').Checker} Checker */

const {
  fromEntries,
  entries,
  getOwnPropertyDescriptors,
  create,
  defineProperties,
} = Object;
const { ownKeys } = Reflect;

const { details: X, quote: q, Fail } = assert;

// TODO migrate to proper home
// From the `agoric-sdk` monorepo. Moved here temporarily because the pattern
// code is migrated from `@agoric/store` to `@endo/patterns`, and depends on
// the functionality in this file, which is otherwise available only
// within the `agoric-sdk` monorepo.

/**
 * TODO as long as `@endo/pass-style` remains the proper home of the
 * `Checker` type, it probably makes most sense to move `identChecker`
 * into `@endo/pass-style` as well.
 *
 * In the `assertFoo`/`isFoo`/`checkFoo` pattern, `checkFoo` has a `check`
 * parameter of type `Checker`. `assertFoo` calls `checkFoo` passes
 * `assertChecker` as the `check` argument. `isFoo` passes `identChecker`
 * as the `check` argument. `identChecker` acts precisely like an
 * identity function, but is typed as a `Checker` to indicate its
 * intended use.
 *
 * @type {Checker}
 */
export const identChecker = (cond, _details) => cond;
harden(identChecker);

/**
 * Throws if multiple entries use the same property name. Otherwise acts
 * like `Object.fromEntries` but hardens the result.
 * Use it to protect from property names computed from user-provided data.
 *
 * @template K,V
 * @param {Iterable<[K,V]>} allEntries
 * @returns {{[k: K]: V}}
 */
export const fromUniqueEntries = allEntries => {
  const entriesArray = [...allEntries];
  const result = harden(fromEntries(entriesArray));
  if (ownKeys(result).length === entriesArray.length) {
    return result;
  }
  const names = new Set();
  for (const [name, _] of entriesArray) {
    if (names.has(name)) {
      Fail`collision on property name ${q(name)}: ${entriesArray}`;
    }
    names.add(name);
  }
  throw Fail`internal: failed to create object from unique entries`;
};
harden(fromUniqueEntries);

/**
 * By analogy with how `Array.prototype.map` will map the elements of
 * an array to transformed elements of an array of the same shape,
 * `objectMap` will do likewise for the string-named own enumerable
 * properties of an object.
 *
 * Typical usage applies `objectMap` to a CopyRecord, i.e.,
 * an object for which `passStyleOf(original) === 'copyRecord'`. For these,
 * none of the following edge cases arise. The result will be a CopyRecord
 * with exactly the same property names, whose values are the mapped form of
 * the original's values.
 *
 * When the original is not a CopyRecord, some edge cases to be aware of
 *    * No matter how mutable the original object, the returned object is
 *      hardened.
 *    * Only the string-named enumerable own properties of the original
 *      are mapped. All other properties are ignored.
 *    * If any of the original properties were accessors, `Object.entries`
 *      will cause its `getter` to be called and will use the resulting
 *      value.
 *    * No matter whether the original property was an accessor, writable,
 *      or configurable, all the properties of the returned object will be
 *      non-writable, non-configurable, data properties.
 *    * No matter what the original object may have inherited from, and
 *      no matter whether it was a special kind of object such as an array,
 *      the returned object will always be a plain object inheriting directly
 *      from `Object.prototype` and whose state is only these new mapped
 *      own properties.
 *
 * With these differences, even if the original object was not a CopyRecord,
 * if all the mapped values are Passable, then the returned object will be
 * a CopyRecord.
 *
 * @template {Record<string, any>} O
 * @template R map result
 * @param {O} original
 * @param {(value: O[keyof O], key: keyof O) => R} mapFn
 * @returns {Record<keyof O, R>}
 */
export const objectMap = (original, mapFn) => {
  const ents = entries(original);
  const mapEnts = ents.map(
    ([k, v]) => /** @type {[keyof O, R]} */ ([k, mapFn(v, k)]),
  );
  return /** @type {Record<keyof O, R>} */ (harden(fromEntries(mapEnts)));
};
harden(objectMap);

/**
 * Like `objectMap`, but at the reflective level of property descriptors
 * rather than property values.
 *
 * Except for hardening, the edge case behavior is mostly the opposite of
 * the `objectMap` edge cases.
 *    * No matter how mutable the original object, the returned object is
 *      hardened.
 *    * All own properties of the original are mapped, even if symbol-named
 *      or non-enumerable.
 *    * If any of the original properties were accessors, the descriptor
 *      containing the getter and setter are given to `metaMapFn`.
 *    * The own properties of the returned are according to the descriptors
 *      returned by `metaMapFn`.
 *    * The returned object will always be a plain object whose state is
 *      only these mapped own properties. It will inherit from the third
 *      argument if provided, defaulting to `Object.prototype` if omitted.
 *
 * Because a property descriptor is distinct from `undefined`, we bundle
 * mapping and filtering together. When the `metaMapFn` returns `undefined`,
 * that property is omitted from the result.
 *
 * @template {Record<PropertyKey, any>} O
 * @param {O} original
 * @param {(
 *   desc: TypedPropertyDescriptor<O[keyof O]>,
 *   key: keyof O
 * ) => (PropertyDescriptor | undefined)} metaMapFn
 * @param {any} [proto]
 * @returns {any}
 */
export const objectMetaMap = (
  original,
  metaMapFn,
  proto = Object.prototype,
) => {
  const descs = getOwnPropertyDescriptors(original);
  const keys = ownKeys(original);

  const descEntries = /** @type {[PropertyKey,PropertyDescriptor][]} */ (
    keys
      .map(key => [key, metaMapFn(descs[key], key)])
      .filter(([_key, optDesc]) => optDesc !== undefined)
  );
  return harden(create(proto, fromUniqueEntries(descEntries)));
};
harden(objectMetaMap);

/**
 * Like `Object.assign` but at the reflective level of property descriptors
 * rather than property values.
 *
 * Unlike `Object.assign`, this includes all own properties, whether enumerable
 * or not. An original accessor property is copied by sharing its getter and
 * setter, rather than calling the getter to obtain a value. If an original
 * property is non-configurable, a property of the same name on a later original
 * that would conflict instead causes the call to `objectMetaAssign` to throw an
 * error.
 *
 * Returns the enhanced `target` after hardening.
 *
 * @param {any} target
 * @param {any[]} originals
 * @returns {any}
 */
export const objectMetaAssign = (target, ...originals) => {
  for (const original of originals) {
    defineProperties(target, getOwnPropertyDescriptors(original));
  }
  return harden(target);
};
harden(objectMetaAssign);

/**
 *
 * @param {Array<string | symbol>} leftNames
 * @param {Array<string | symbol>} rightNames
 */
export const listDifference = (leftNames, rightNames) => {
  const rightSet = new Set(rightNames);
  return leftNames.filter(name => !rightSet.has(name));
};
harden(listDifference);

/**
 * @param {Error} innerErr
 * @param {string|number} label
 * @param {ErrorConstructor=} ErrorConstructor
 * @returns {never}
 */

// Evade https://github.com/endojs/endo/issues/1450 using blank line
export const throwLabeled = (innerErr, label, ErrorConstructor = undefined) => {
  if (typeof label === 'number') {
    label = `[${label}]`;
  }
  const outerErr = assert.error(
    `${label}: ${innerErr.message}`,
    ErrorConstructor,
  );
  assert.note(outerErr, X`Caused by ${innerErr}`);
  throw outerErr;
};
harden(throwLabeled);

/**
 * @template A,R
 * @param {(...args: A[]) => R} func
 * @param {A[]} args
 * @param {string|number} [label]
 * @returns {R}
 */
export const applyLabelingError = (func, args, label = undefined) => {
  if (label === undefined) {
    return func(...args);
  }
  let result;
  try {
    result = func(...args);
  } catch (err) {
    throwLabeled(err, label);
  }
  if (isPromise(result)) {
    // @ts-expect-error If result is a rejected promise, this will
    // return a promise with a different rejection reason. But this
    // confuses TypeScript because it types that case as `Promise<never>`
    // which is cool for a promise that will never fulfll.
    // But TypeScript doesn't understand that this will only happen
    // when `result` was a rejected promise. In only this case `R`
    // should already allow `Promise<never>` as a subtype.
    return E.when(result, undefined, reason => throwLabeled(reason, label));
  } else {
    return result;
  }
};
harden(applyLabelingError);

/**
 * Makes a one-shot iterable iterator from a provided `next` function.
 *
 * @template [T=unknown]
 * @param {() => IteratorResult<T>} next
 * @returns {IterableIterator<T>}
 */
export const makeIterator = next => {
  const iter = harden({
    [Symbol.iterator]: () => iter,
    next,
  });
  return iter;
};
harden(makeIterator);

/**
 * A `harden`ing analog of Array.prototype[Symbol.iterator].
 *
 * @template [T=unknown]
 * @param {Array<T>} arr
 * @returns {IterableIterator<T>}
 */
export const makeArrayIterator = arr => {
  const { length } = arr;
  let i = 0;
  return makeIterator(() => {
    /** @type {T} */
    let value;
    if (i < length) {
      value = arr[i];
      i += 1;
      return harden({ done: false, value });
    }
    // @ts-expect-error The terminal value doesn't matter
    return harden({ done: true, value });
  });
};
harden(makeArrayIterator);
